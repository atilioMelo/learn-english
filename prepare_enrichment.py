"""
prepare_enrichment.py – extrai palavras + contexto dos PDFs
e gera enrichment_request.json para enriquecimento pelo Copilot.
"""
import json
import re
import openpyxl
import pdfplumber
from pathlib import Path

BASE      = Path(__file__).parent
VOCAB_FILE = BASE / "modules/module-01/vocab.xlsx"
PDFS_DIR   = BASE / "modules/module-01/pdfs"
OUT_FILE   = BASE / "modules/module-01/enrichment_request.json"

# ── Ler vocab ──────────────────────────────────────────────────────────────
wb = openpyxl.load_workbook(VOCAB_FILE)
ws = wb.active
words = []
for row in ws.iter_rows(min_row=2, values_only=True):
    if row and row[0]:
        words.append({
            "word":  str(row[0]).strip(),
            "notes": str(row[2]).strip() if len(row) > 2 and row[2] else "",
        })

# ── Ler PDFs ───────────────────────────────────────────────────────────────
all_text = ""
for p in sorted(PDFS_DIR.glob("*.pdf")):
    with pdfplumber.open(p) as pdf:
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                all_text += t + " "

all_text = re.sub(r"[\r\n]+", " ", all_text)
all_text = re.sub(r" {2,}", " ", all_text)

# ── Busca contexto ─────────────────────────────────────────────────────────
def get_context(word, text, n=2):
    sents    = re.split(r"(?<=[.!?])\s+", text)
    is_phrase = " " in word
    pat = re.escape(word.lower())
    if not is_phrase:
        pat = r"\b" + pat + r"\b"
    hits = []
    for s in sents:
        sc = s.strip()
        if 15 < len(sc) < 300 and not re.search(r"https?://|www\.|\.com|\d\s*/\s*\d", sc, re.I):
            if re.search(pat, sc.lower()):
                hits.append(sc)
        if len(hits) == n:
            break
    return hits

# ── Gera request ───────────────────────────────────────────────────────────
result = []
for w in words:
    ctx = get_context(w["word"], all_text)
    result.append({
        "word":           w["word"],
        "existing_notes": w["notes"],
        "pdf_context":    ctx,
    })

with open(OUT_FILE, "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print(f"Done: {len(result)} words -> {OUT_FILE}")
for r in result[:30]:
    ctx_count = len(r["pdf_context"])
    notes     = r["existing_notes"][:50]
    print(f"  [{r['word']}]  ctx={ctx_count}  notes='{notes}'")
