#!/usr/bin/env python3
"""
Plain English – Weekly Module Generator
========================================
Reads PDFs + vocab.xlsx from a module folder and generates JSON data
for the GitHub Pages site.

Usage:
  python generate_module.py              # processa o módulo mais recente
  python generate_module.py --module 3  # processa o módulo 03
  python generate_module.py --all       # processa todos os módulos
  python generate_module.py --no-push   # não envia ao GitHub
  python generate_module.py --prepare   # gera enrichment_request.json para
                                        # enriquecimento pelo Copilot

Fluxo semanal:
  1. Adicione PDFs em modules/module-XX/pdfs/ e preencha vocab.xlsx
  2. python generate_module.py --prepare   -> gera enrichment_request.json
  3. Peça ao Copilot para enriquecer       -> gera definitions_cache.json
  4. python generate_module.py             -> usa o cache, publica no GitHub
"""

import argparse
import json
import os
import re
import random
import subprocess
import sys
from pathlib import Path

import pdfplumber
import openpyxl
import requests

# ──────────────────────────────────────────────
# Paths
# ──────────────────────────────────────────────
BASE_DIR    = Path(__file__).parent
MODULES_DIR = BASE_DIR / "modules"
DATA_DIR    = BASE_DIR / "docs" / "data"

DICT_API = "https://api.dictionaryapi.dev/api/v2/entries/en"


# ──────────────────────────────────────────────
# PDF & Vocab helpers
# ──────────────────────────────────────────────

def extract_pdf_text(pdf_path: Path) -> str:
    """Extrai texto de um arquivo PDF."""
    text = ""
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
    return text


def read_vocab(vocab_path: Path) -> list:
    """Lê vocabulário do arquivo XLSX.

    Colunas esperadas (linha 1 = cabeçalho):
      A: Word/Expression  B: Example sentence  C: My notes  D: Episode
    """
    wb = openpyxl.load_workbook(vocab_path)
    ws = wb.active
    vocab = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row or not row[0]:
            continue
        word    = str(row[0]).strip()
        example = str(row[1]).strip() if len(row) > 1 and row[1] else ""
        notes   = str(row[2]).strip() if len(row) > 2 and row[2] else ""
        episode = str(row[3]).strip() if len(row) > 3 and row[3] else ""
        if word:
            vocab.append({"word": word, "example": example,
                          "notes": notes, "episode": episode})
    return vocab


# ──────────────────────────────────────────────
# Definitions cache (gerado pelo Copilot)
# ──────────────────────────────

_def_cache: dict = {}   # carregado sob demanda por load_definitions_cache()
_trans_cache: dict = {}  # carregado sob demanda por load_definitions_cache()
_ctx_cache: dict = {}    # carregado sob demanda: word → [sentence1, sentence2]


def load_definitions_cache(module_dir: Path) -> None:
    """Carrega definitions_cache.json, translations_cache.json e contexts_cache.json do módulo."""
    global _def_cache, _trans_cache, _ctx_cache
    cache_file = module_dir / "definitions_cache.json"
    if cache_file.exists():
        with open(cache_file, encoding="utf-8") as f:
            _def_cache = json.load(f)
        print(f"  → Cache de definições: {len(_def_cache)} entradas")
    else:
        _def_cache = {}

    trans_file = module_dir / "translations_cache.json"
    if trans_file.exists():
        with open(trans_file, encoding="utf-8") as f:
            _trans_cache = json.load(f)
        print(f"  → Cache de traduções:  {len(_trans_cache)} entradas")
    else:
        _trans_cache = {}

    ctx_file = module_dir / "contexts_cache.json"
    if ctx_file.exists():
        with open(ctx_file, encoding="utf-8") as f:
            _ctx_cache = json.load(f)
        print(f"  → Cache de contextos:  {len(_ctx_cache)} entradas")
    else:
        _ctx_cache = {}


def get_definition(word: str, fallback_notes: str = "") -> str:
    """Retorna definição: cache do Copilot > notas do usuário > API > vazio."""
    # 1. Cache gerado pelo Copilot
    cached = _def_cache.get(word) or _def_cache.get(word.lower())
    if cached:
        return cached
    # 2. Notas manuais no vocab.xlsx
    if fallback_notes:
        return fallback_notes
    # 3. Free Dictionary API (somente palavras simples)
    if " " not in word.strip():
        try:
            resp = requests.get(f"{DICT_API}/{word.lower()}", timeout=6)
            if resp.status_code == 200:
                data = resp.json()
                meanings = data[0].get("meanings", [])
                if meanings:
                    defs = meanings[0].get("definitions", [])
                    if defs:
                        return defs[0].get("definition", "")
        except Exception:
            pass
    return ""


def fetch_definition(word: str) -> str:
    """Compat: redireciona para get_definition."""
    return get_definition(word)


# ──────────────────────────────────────────────
# Sentence helpers
# ──────────────────────────────────────────────

def clean_sentence(s: str) -> str:
    """Remove quebras de linha e espaços extras de uma frase."""
    s = re.sub(r"[\r\n]+", " ", s)
    return re.sub(r" {2,}", " ", s).strip()


def find_sentences(text: str, word: str, max_results: int = 3) -> list:
    """Encontra sentenças no texto que contenham a palavra (match de palavra inteira)."""
    # Normaliza o texto antes de buscar
    clean = re.sub(r"[\r\n]+", " ", text)
    clean = re.sub(r" {2,}", " ", clean)
    sentences  = re.split(r"(?<=[.!?])\s+", clean)
    word_lower = word.lower()
    # Usa \b só para palavras simples; expressões multi-palavra usam contains
    is_phrase   = " " in word.strip()
    matches = []
    for s in sentences:
        s_clean = s.strip()
        if not (15 < len(s_clean) < 300):
            continue
        # Descarta frases com URLs, numeração de página ou artefatos de PDF
        if re.search(r"https?://|www\.|\.com|\.pdf|\d\s*/\s*\d", s_clean, re.IGNORECASE):
            continue
        if is_phrase:
            if word_lower in s_clean.lower():
                matches.append(s_clean)
        else:
            if re.search(r"\b" + re.escape(word_lower) + r"\b", s_clean.lower()):
                matches.append(s_clean)
    return matches[:max_results]


# ──────────────────────────────────────────────
# Activity generators
# ──────────────────────────────────────────────

def gen_flashcards(vocab: list, all_text: str) -> list:
    """Gera cartões de vocabulário."""
    cards = []
    for item in vocab:
        definition  = get_definition(item["word"], item["notes"])
        translation = _trans_cache.get(item["word"]) or _trans_cache.get(item["word"].lower()) or ""
        contexts    = _ctx_cache.get(item["word"]) or _ctx_cache.get(item["word"].lower()) or []
        sentences   = find_sentences(all_text, item["word"])
        if not sentences and item["example"]:
            sentences = [clean_sentence(item["example"])]
        example = clean_sentence(sentences[0]) if sentences else clean_sentence(item["example"])
        cards.append({
            "word":        item["word"],
            "definition":  definition,
            "translation": translation,
            "example":     example,
            "contexts":    contexts,
            "episode":     item["episode"],
        })
    return cards


def _ctx_sentence(word: str) -> str:
    """Retorna uma frase aleatória do contexts_cache para a palavra, ou vazio."""
    entries = _ctx_cache.get(word) or _ctx_cache.get(word.lower()) or []
    return random.choice(entries) if entries else ""


def gen_fill_blanks(vocab: list, all_text: str) -> list:
    """Gera exercícios de preencher lacunas."""
    exercises = []
    for item in vocab:
        word      = item["word"]
        sentences = find_sentences(all_text, word)
        # Fallback to contexts_cache when word not found in PDF
        if not sentences:
            ctx = _ctx_sentence(word)
            if ctx:
                sentences = [ctx]
        if not sentences:
            continue
        sentence = sentences[0]
        # substitui a palavra pelo blank respeitando limites de palavra
        is_phrase = " " in word.strip()
        if is_phrase:
            pattern = re.escape(word)
        else:
            pattern = r"\b" + re.escape(word) + r"\b"
        blank_sentence = re.sub(pattern, "___", sentence, count=1, flags=re.IGNORECASE)
        if "___" not in blank_sentence:
            continue
        exercises.append({
            "sentence": blank_sentence,
            "answer":   word,
            "hint":     word[0] + "_" * (len(word) - 1),  # dica: primeira letra
        })
    random.shuffle(exercises)
    return exercises[:20]


def gen_multiple_choice(vocab: list, all_text: str) -> list:
    """Gera questões de múltipla escolha.

    Formato: mostra uma frase com lacuna e pede para escolher a palavra certa
    entre 4 opções. Funciona para qualquer item que tenha exemplo no PDF.
    """
    # Monta pool: itens que têm frase de contexto
    pool = []
    for item in vocab:
        word      = item["word"]
        sentences = find_sentences(all_text, word)
        example   = sentences[0] if sentences else ""
        # Fallback to contexts_cache when word not found in PDF
        if not example:
            example = _ctx_sentence(word) or item["example"]
        if not example:
            continue
        blank = re.sub(re.escape(word), "___", example, count=1, flags=re.IGNORECASE)
        if "___" not in blank:
            continue
        pool.append({"word": word, "sentence": blank})

    if len(pool) < 4:
        return []

    exercises = []
    words_only = [p["word"] for p in pool]
    for i, item in enumerate(pool):
        others  = [w for j, w in enumerate(words_only) if j != i]
        wrong   = random.sample(others, min(3, len(others)))
        if len(wrong) < 3:
            continue
        options = [{"text": item["word"], "correct": True}] + [
            {"text": w, "correct": False} for w in wrong
        ]
        random.shuffle(options)
        exercises.append({
            "question": item["sentence"],
            "word":     item["word"],
            "options":  options,
        })
    random.shuffle(exercises)
    return exercises[:20]


def gen_matching(vocab: list, all_text: str) -> list:
    """Gera grupos de matching (palavra ↔ frase de contexto do episódio).

    Usa a frase real do PDF como lado direito do par. Se não houver frase
    no PDF, usa a coluna 'Example Sentence' do vocab. Se não houver nada,
    tenta a definição (notas ou API).
    """
    pairs = []
    for item in vocab:
        word      = item["word"]
        sentences = find_sentences(all_text, word)
        example   = sentences[0] if sentences else ""
        # Fallback to contexts_cache when word not found in PDF
        if not example:
            example = _ctx_sentence(word) or item["example"]

        if example:
            # Encurta para não poluir visualmente (máx 90 chars)
            short = example.strip()
            if len(short) > 90:
                short = short[:87] + "…"
            pairs.append({"word": word, "definition": short})
        else:
            # Fallback: notas ou API
            definition = item["notes"] or fetch_definition(word)
            if definition:
                pairs.append({"word": word, "definition": definition[:90]})

    # Grupos de até 6 pares
    random.shuffle(pairs)
    groups = [pairs[i: i + 6] for i in range(0, len(pairs), 6)]
    return groups[:6]


def gen_sentence_order(all_text: str) -> list:
    """Gera exercícios de ordenar palavras na frase."""
    # Normaliza espaços e quebras de linha antes de dividir
    clean_text = re.sub(r"[\r\n]+", " ", all_text)
    clean_text = re.sub(r" {2,}", " ", clean_text)
    sentences  = re.split(r"(?<=[.!?])\s+", clean_text)
    candidates = [
        s.strip() for s in sentences
        if 25 < len(s.strip()) < 110
        and s.strip().count(" ") >= 5
        and not s.strip()[0].islower()   # começa com maiúscula
    ]
    random.shuffle(candidates)
    exercises = []
    for sent in candidates[:30]:  # busca em mais candidatos para garantir 10
        words    = sent.split()
        shuffled = words[:]
        random.shuffle(shuffled)
        if shuffled != words:
            exercises.append({"sentence": sent, "shuffled": shuffled})
        if len(exercises) == 10:
            break
    return exercises


# ──────────────────────────────────────────────
# Module processor
# ──────────────────────────────────────────────

def process_module(module_dir: Path, module_num: int) -> dict:
    """Processa um diretório de módulo e retorna o objeto de dados."""
    print(f"\n▸ Module {module_num:02d} — {module_dir.name}")

    # Carrega cache de definições gerado pelo Copilot (se existir)
    load_definitions_cache(module_dir)

    # Extrai texto dos PDFs
    pdfs_dir = module_dir / "pdfs"
    all_text = ""
    episodes = []
    if pdfs_dir.exists():
        pdf_files = sorted(pdfs_dir.glob("*.pdf"))
        if not pdf_files:
            print("  ⚠  Nenhum PDF encontrado em pdfs/")
        for pdf_file in pdf_files:
            print(f"  → Lendo {pdf_file.name}")
            text = extract_pdf_text(pdf_file)
            all_text += text + "\n\n"
            episodes.append({
                "filename": pdf_file.name,
                "title":    pdf_file.stem.replace("-", " ").replace("_", " ").title(),
            })
    else:
        print("  ⚠  Pasta pdfs/ não encontrada")

    # Lê vocabulário
    vocab = []
    vocab_file = module_dir / "vocab.xlsx"
    if vocab_file.exists():
        vocab = read_vocab(vocab_file)
        print(f"  → Vocabulário: {len(vocab)} itens")
    else:
        print("  ⚠  vocab.xlsx não encontrado — atividades de vocabulário serão vazias")

    # Gera atividades
    print("  → Gerando atividades…")
    data = {
        "module":      module_num,
        "title":       f"Module {module_num:02d}",
        "episodes":    episodes,
        "vocab_count": len(vocab),
        "activities": {
            "flashcards":      gen_flashcards(vocab, all_text),
            "fill_blanks":     gen_fill_blanks(vocab, all_text),
            "multiple_choice": gen_multiple_choice(vocab, all_text),
            "matching":        gen_matching(vocab, all_text),
            "sentence_order":  gen_sentence_order(all_text),
        },
    }
    print(
        f"  ✓  Flashcards: {len(data['activities']['flashcards'])}  "
        f"Fill-blanks: {len(data['activities']['fill_blanks'])}  "
        f"MC: {len(data['activities']['multiple_choice'])}  "
        f"Matching groups: {len(data['activities']['matching'])}  "
        f"Sentence order: {len(data['activities']['sentence_order'])}"
    )
    return data


def update_index(data_dir: Path):
    """Atualiza o arquivo de índice modules.json."""
    modules = []
    for json_file in sorted(data_dir.glob("module-*.json")):
        with open(json_file, encoding="utf-8") as f:
            d = json.load(f)
        modules.append({
            "module":      d["module"],
            "title":       d["title"],
            "episodes":    len(d.get("episodes", [])),
            "vocab_count": d.get("vocab_count", 0),
            "file":        json_file.name,
        })
    index_path = data_dir / "modules.json"
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(modules, f, ensure_ascii=False, indent=2)
    print(f"\n  ✓  Índice atualizado — {len(modules)} módulo(s)")


def git_push(base_dir: Path, label: str):
    """Faz commit e push no GitHub."""
    try:
        subprocess.run(["git", "add", "."],               cwd=base_dir, check=True)
        subprocess.run(["git", "commit", "-m",
                        f"feat: add {label} content"],    cwd=base_dir, check=True)
        subprocess.run(["git", "push"],                   cwd=base_dir, check=True)
        print("  ✓  Push realizado com sucesso.")
    except subprocess.CalledProcessError as e:
        print(f"  ✗  Erro no git: {e}\n     Faça o push manualmente.")


# ──────────────────────────────────────────────
# Entry-point
# ──────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Gera conteúdo Plain English para o GitHub Pages"
    )
    parser.add_argument("--module",   type=int, help="Número do módulo a processar")
    parser.add_argument("--all",      action="store_true", help="Processa todos os módulos")
    parser.add_argument("--no-push",  action="store_true", help="Não envia ao GitHub")
    parser.add_argument("--prepare",  action="store_true",
                        help="Gera enrichment_request.json para enriquecimento pelo Copilot")
    args = parser.parse_args()

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # ── Modo --prepare: só extrai palavras + contexto, não gera o site ──────
    if args.prepare:
        import prepare_enrichment  # executa o script de extração
        sys.exit(0)

    processed_num = None

    if args.all:
        for module_dir in sorted(MODULES_DIR.glob("module-*")):
            m = re.search(r"module-(\d+)", module_dir.name)
            if m:
                num  = int(m.group(1))
                data = process_module(module_dir, num)
                out  = DATA_DIR / f"module-{num:02d}.json"
                with open(out, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                processed_num = num
        label = "all modules"

    elif args.module:
        module_dir = MODULES_DIR / f"module-{args.module:02d}"
        if not module_dir.exists():
            print(f"Erro: pasta {module_dir} não encontrada.")
            sys.exit(1)
        data = process_module(module_dir, args.module)
        out  = DATA_DIR / f"module-{args.module:02d}.json"
        with open(out, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        processed_num = args.module
        label = f"module {args.module:02d}"

    else:
        # Processa o módulo mais recente
        module_dirs = sorted(MODULES_DIR.glob("module-*"))
        if not module_dirs:
            print("Nenhuma pasta de módulo encontrada em modules/")
            sys.exit(1)
        latest = module_dirs[-1]
        m = re.search(r"module-(\d+)", latest.name)
        if not m:
            print("Não foi possível identificar o número do módulo.")
            sys.exit(1)
        num  = int(m.group(1))
        data = process_module(latest, num)
        out  = DATA_DIR / f"module-{num:02d}.json"
        with open(out, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        processed_num = num
        label = f"module {num:02d}"

    update_index(DATA_DIR)

    if not args.no_push:
        git_push(BASE_DIR, label)

    print("\n✅  Concluído! O site será atualizado no GitHub Pages em instantes.")


if __name__ == "__main__":
    main()
