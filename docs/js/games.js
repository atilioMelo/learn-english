/* games.js – Play page: all game modes */

// ─── Utilities ──────────────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function qs(sel, ctx = document) { return ctx.querySelector(sel); }

function getParam(name) {
  return new URLSearchParams(location.search).get(name);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── State ──────────────────────────────────────────────────────────────────

let moduleData   = null;
let currentGame  = 'flashcards';

// ─── Activity Log ────────────────────────────────────────────────────────────
// Each entry: { ts, module, activity, word, attempts, hintLevel, correct }
// Stored in localStorage under key 'pe_log'

const LOG_KEY = 'pe_log';

function logEvent(word, correct, attempts, hintLevel) {
  const entry = {
    ts:       new Date().toISOString(),
    module:   moduleData?.module ?? '?',
    activity: currentGame,
    word,
    attempts,
    hintLevel,   // 0 = no hint, 1-3 = hint level used
    correct
  };
  const log = JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]');
  log.push(entry);
  localStorage.setItem(LOG_KEY, JSON.stringify(log));
}

function exportLog() {
  const log = JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]');
  if (!log.length) { alert('Log vazio — jogue alguns exercícios primeiro.'); return; }
  const text = JSON.stringify(log, null, 2);
  navigator.clipboard.writeText(text)
    .then(() => {
      const btn = qs('#export-log-btn');
      const orig = btn.textContent;
      btn.textContent = '✓ Copiado!';
      setTimeout(() => { btn.textContent = orig; }, 2000);
    })
    .catch(() => {
      // fallback: open in new tab so user can copy manually
      const win = window.open('', '_blank');
      win.document.write(`<pre style="font-family:monospace;font-size:13px">${text.replace(/</g,'&lt;')}</pre>`);
    });
}

function clearLog() {
  if (!confirm('Apagar todo o histórico de atividades?')) return;
  localStorage.removeItem(LOG_KEY);
  const btn = qs('#export-log-btn');
  if (btn) btn.textContent = '📋 Export Log';
}

// ─── Notes ───────────────────────────────────────────────────────────────────
// Free-text notepad, saved to localStorage under 'pe_notes'

const NOTES_KEY = 'pe_notes';

function toggleNotes() {
  const overlay = qs('#notes-overlay');
  if (!overlay) return;
  const opening = overlay.classList.contains('hidden');
  overlay.classList.toggle('hidden');
  if (opening) {
    const area = qs('#notes-area');
    area.value = localStorage.getItem(NOTES_KEY) ?? '';
    area.focus();
  }
}

function exportNotes() {
  const text = qs('#notes-area')?.value ?? '';
  if (!text.trim()) { alert('Nenhuma anotação para copiar.'); return; }
  navigator.clipboard.writeText(text)
    .then(() => {
      const btn = qs('#notes-modal .btn-log') ?? [...document.querySelectorAll('.notes-modal .btn-log')][0];
      if (!btn) return;
      const orig = btn.textContent;
      btn.textContent = '✓ Copiado!';
      setTimeout(() => { btn.textContent = orig; }, 2000);
    })
    .catch(() => {
      const win = window.open('', '_blank');
      win.document.write(`<pre style="font-family:monospace;font-size:13px">${text.replace(/</g,'&lt;')}</pre>`);
    });
}

function clearNotes() {
  if (!confirm('Apagar todas as anotações?')) return;
  localStorage.removeItem(NOTES_KEY);
  const area = qs('#notes-area');
  if (area) area.value = '';
}

// Auto-save on every keystroke
document.addEventListener('DOMContentLoaded', () => {
  const area = qs('#notes-area');
  if (area) area.addEventListener('input', () => localStorage.setItem(NOTES_KEY, area.value));
});

let score        = 0;
let total        = 0;

// ─── Boot ────────────────────────────────────────────────────────────────────

(async function boot() {
  const moduleNum = getParam('module');
  if (!moduleNum) {
    showError('No module specified. Go back and select a module.');
    return;
  }

  const loading   = qs('#loading');
  const actNav    = qs('#activity-nav');
  const gameArea  = qs('#game-area');
  const scoreBar  = qs('#score-bar');
  const titleEl   = qs('#module-title');

  try {
    const resp = await fetch(`data/module-${String(moduleNum).padStart(2, '0')}.json`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    moduleData = await resp.json();

    titleEl.textContent = moduleData.title;
    document.title      = `${moduleData.title} – Plain English`;

    loading.classList.add('hidden');
    actNav.classList.remove('hidden');
    scoreBar.classList.remove('hidden');
    gameArea.classList.remove('hidden');
    qs('#log-bar')?.classList.remove('hidden');

    // Activity button listeners
    actNav.querySelectorAll('.act-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        actNav.querySelectorAll('.act-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentGame = btn.dataset.game;
        resetScore();
        renderGame(currentGame);
      });
    });

    renderGame('flashcards');
  } catch (err) {
    if (loading) loading.classList.add('hidden');
    showError(`Could not load module: ${err.message}`);
  }
})();

// ─── Score helpers ────────────────────────────────────────────────────────────

function resetScore() { score = 0; total = 0; updateScoreUI(); }

function addScore(pts, outOf) {
  score += pts;
  total += outOf;
  updateScoreUI();
}

function updateScoreUI() {
  const sv = qs('#score-val');
  const pc = qs('#progress-current');
  const pt = qs('#progress-total');
  if (sv) sv.textContent  = score;
  if (pc) pc.textContent  = total ? Math.round((score / total) * 100) + '%' : '–';
  if (pt) pt.textContent  = total;
}

// ─── Game dispatcher ─────────────────────────────────────────────────────────

function renderGame(game) {
  const area = qs('#game-area');
  area.innerHTML = '';
  resetScore();

  const acts = moduleData?.activities ?? {};

  switch (game) {
    case 'flashcards':      renderFlashcards(acts.flashcards ?? []);      break;
    case 'fill_blanks':     renderFillBlanks(acts.fill_blanks ?? []);     break;
    case 'multiple_choice': renderMultipleChoice(acts.multiple_choice ?? []); break;
    case 'matching':        renderMatching(acts.matching ?? []);           break;
    case 'sentence_order':  renderSentenceOrder(acts.sentence_order ?? []); break;
    default: area.innerHTML = '<p class="empty-state">Game not found.</p>';
  }
}

function emptyState(msg) {
  return `<div class="empty-state"><p>${esc(msg)}</p></div>`;
}

// ════════════════════════════════════════════════════════════════════════════
// 1. FLASHCARDS
// ════════════════════════════════════════════════════════════════════════════

function renderFlashcards(cards) {
  const area = qs('#game-area');
  if (!cards.length) { area.innerHTML = emptyState('No flashcards in this module.'); return; }

  const allCards = shuffle(cards);
  let filteredDeck = [...allCards];
  // flipCounts keyed by index in allCards (persists across search changes)
  const flipCounts = new Array(allCards.length).fill(0);
  let idx = 0;

  // Persistent outer structure (search bar stays while cards navigate)
  area.innerHTML = `
    <div class="fc-search-wrap">
      <input id="fc-search" class="fc-search" type="search" placeholder="🔍 Buscar expressão, palavra ou tradução…" autocomplete="off" spellcheck="false" />
      <span id="fc-search-count" class="fc-search-count"></span>
    </div>
    <div id="fc-card-area"></div>`;

  qs('#fc-search').addEventListener('input', function () {
    const q = this.value.trim().toLowerCase();
    filteredDeck = q
      ? allCards.filter(c =>
          c.word.toLowerCase().includes(q) ||
          (c.definition  ?? '').toLowerCase().includes(q) ||
          (c.translation ?? '').toLowerCase().includes(q) ||
          (c.example     ?? '').toLowerCase().includes(q))
      : [...allCards];
    idx = 0;
    render();
  });

  function render() {
    const cardArea = qs('#fc-card-area');
    const countEl  = qs('#fc-search-count');
    const searching = filteredDeck.length < allCards.length;

    if (countEl) {
      countEl.textContent = searching
        ? `${filteredDeck.length} resultado${filteredDeck.length !== 1 ? 's' : ''}`
        : '';
    }

    if (!filteredDeck.length) {
      cardArea.innerHTML = `<div class="empty-state"><p>Nenhum resultado para essa busca.</p></div>`;
      return;
    }

    const card    = filteredDeck[idx];
    const origIdx = allCards.indexOf(card);

    cardArea.innerHTML = `
      <div class="flashcard-wrap">
        <div class="flashcard" id="fc" tabindex="0" title="Click to flip">
          <div class="flashcard-inner">
            <div class="card-face card-front">
              <div class="card-word">${esc(card.word)}</div>
              ${card.episode ? `<div class="card-episode">${esc(card.episode)}</div>` : ''}
              <div class="flip-hint" style="margin-top:1.5rem">Tap to reveal ↕</div>
            </div>
            <div class="card-face card-back">
              ${card.translation ? `<div class="card-translation">${esc(card.translation)}</div>` : ''}
              ${card.definition  ? `<div class="card-definition">${esc(card.definition)}</div>`   : ''}
              ${card.example     ? `<div class="card-example">"${esc(card.example)}"</div>`       : ''}
            </div>
          </div>
        </div>

        <div class="fc-controls">
          <button class="btn" id="fc-prev" ${idx === 0 ? 'disabled' : ''}>← Prev</button>
          <span class="fc-counter">${idx + 1} / ${filteredDeck.length}</span>
          <button class="btn btn-primary" id="fc-next">${idx < filteredDeck.length - 1 ? 'Next →' : 'Restart 🔁'}</button>
        </div>
      </div>`;

    const fcEl = qs('#fc');

    function flip() {
      fcEl.classList.toggle('flipped');
      flipCounts[origIdx]++;
    }

    function goTo(newIdx) {
      const reveals = Math.ceil(flipCounts[origIdx] / 2);
      if (flipCounts[origIdx] > 0) logEvent(card.word, null, reveals, 0);
      idx = newIdx;
      render();
    }

    fcEl.addEventListener('click',   flip);
    fcEl.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') flip(); });

    qs('#fc-prev')?.addEventListener('click', () => { if (idx > 0) goTo(idx - 1); });
    qs('#fc-next').addEventListener('click',  () => {
      if (idx < filteredDeck.length - 1) { goTo(idx + 1); }
      else {
        // Restart: reshuffle full deck, clear search
        const searchEl = qs('#fc-search');
        if (searchEl) searchEl.value = '';
        filteredDeck = shuffle(allCards);
        allCards.splice(0, allCards.length, ...filteredDeck);
        flipCounts.fill(0);
        idx = 0;
        qs('#fc-search-count').textContent = '';
        render();
      }
    });
  }

  render();
}

// ════════════════════════════════════════════════════════════════════════════
// 2. FILL IN THE BLANKS
// ════════════════════════════════════════════════════════════════════════════

function renderFillBlanks(exercises) {
  const area = qs('#game-area');
  if (!exercises.length) { area.innerHTML = emptyState('No fill-in-the-blank exercises in this module.'); return; }

  const deck     = shuffle(exercises);
  let answered   = 0;

  const wrapper = document.createElement('div');

  deck.forEach((ex, i) => {
    const card = document.createElement('div');
    card.className = 'exercise-card';
    card.dataset.idx = i;
    card.innerHTML = `
      <div class="exercise-sentence">${esc(ex.sentence)}</div>
      <div style="display:flex;align-items:center;gap:.7rem;flex-wrap:wrap">
        <input class="blank-input" type="text" placeholder="${esc(ex.hint ?? '…')}" autocomplete="off" autocorrect="off" spellcheck="false" />
        <button class="btn btn-primary check-btn">Check</button>
        <button class="btn hint-btn" title="Show hint">Hint</button>
      </div>
      <div class="feedback-msg" style="min-height:1.2rem"></div>
      <button class="btn try-again-btn" style="display:none">↩ Try Again</button>`;

    const input      = card.querySelector('.blank-input');
    const checkBtn   = card.querySelector('.check-btn');
    const hintBtn    = card.querySelector('.hint-btn');
    const feedback   = card.querySelector('.feedback-msg');
    const retryBtn   = card.querySelector('.try-again-btn');

    let scoredThisCard = false;
    let attemptCount   = 0;

    function resetCard() {
      input.value          = '';
      input.disabled       = false;
      input.className      = 'blank-input';
      checkBtn.disabled    = false;
      hintBtn.disabled     = false;
      hintBtn.textContent  = 'Hint';
      hintStep             = 0;
      feedback.textContent = '';
      feedback.className   = 'feedback-msg';
      retryBtn.style.display = 'none';
      input.focus();
    }

    function check() {
      if (checkBtn.disabled) return;
      const val = input.value.trim().toLowerCase();
      const ans = ex.answer.trim().toLowerCase();
      attemptCount++;
      if (val === ans) {
        input.classList.add('correct');
        feedback.textContent = '✓ Correct!';
        feedback.className   = 'feedback-msg correct';
        if (!scoredThisCard) { addScore(1, 1); scoredThisCard = true; }
        logEvent(ex.answer, true, attemptCount, hintStep);
      } else {
        input.classList.add('wrong');
        feedback.innerHTML = `✗ The answer is: <strong>${esc(ex.answer)}</strong>`;
        feedback.className = 'feedback-msg wrong';
        if (!scoredThisCard) { addScore(0, 1); scoredThisCard = true; }
        logEvent(ex.answer, false, attemptCount, hintStep);
        retryBtn.style.display = '';
      }
      checkBtn.disabled = true;
      input.disabled    = true;
      answered++;
      if (answered === deck.length) showCompleteBanner(wrapper);
    }

    checkBtn.addEventListener('click', check);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') check(); });
    retryBtn.addEventListener('click', () => { scoredThisCard = false; answered--; resetCard(); });

    // Progressive hint: 1st click = PT-BR translation
    //                   2nd click = English context sentence
    //                   3rd click = fill answer in input
    let hintStep = 0;  // declared before check() uses it
    hintBtn.addEventListener('click', () => {
      if (checkBtn.disabled) return;   // already answered

      hintStep++;
      if (hintStep === 1) {
        const fc = (moduleData.activities.flashcards ?? [])
          .find(c => c.word.toLowerCase() === ex.answer.toLowerCase());
        const tr = fc?.translation;
        if (tr) {
          feedback.innerHTML = `💡 <span class="hint-translation">${esc(tr)}</span>`;
          feedback.className = 'feedback-msg hint';
          hintBtn.textContent = 'Hint 2/3';
        } else {
          hintStep++;   // no translation → skip to context
        }
      }
      if (hintStep === 2) {
        const fc = (moduleData.activities.flashcards ?? [])
          .find(c => c.word.toLowerCase() === ex.answer.toLowerCase());
        const ctxList = fc?.contexts?.length ? fc.contexts : [];
        let ctxSentence;
        if (ctxList.length) {
          ctxSentence = ctxList[Math.floor(Math.random() * ctxList.length)];
        } else {
          ctxSentence = ex.sentence.replace(/_+/g, ex.answer);
        }
        const highlighted = ctxSentence.replace(
          new RegExp('(' + ex.answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'),
          '<strong>$1</strong>'
        );
        feedback.innerHTML = `💡 <span class="hint-context">${highlighted}</span>`;
        feedback.className = 'feedback-msg hint';
        hintBtn.textContent = 'Show answer';
        input.focus();
      }
      if (hintStep >= 3) {
        input.value = ex.answer;
        input.focus();
        hintBtn.disabled = true;
      }
    });

    wrapper.appendChild(card);
  });

  area.appendChild(wrapper);
}

// ════════════════════════════════════════════════════════════════════════════
// 3. MULTIPLE CHOICE
// ════════════════════════════════════════════════════════════════════════════

function renderMultipleChoice(questions) {
  const area = qs('#game-area');
  if (!questions.length) { area.innerHTML = emptyState('No quiz questions in this module.'); return; }

  const deck      = shuffle(questions);
  let answered    = 0;

  const wrapper = document.createElement('div');

  deck.forEach((q, i) => {
    const card = document.createElement('div');
    card.className = 'question-card';

    const optionsHtml = shuffle(q.options).map((opt, j) =>
      `<button class="option-btn" data-idx="${j}" data-correct="${opt.correct}">${esc(opt.text)}</button>`
    ).join('');

    card.innerHTML = `
      <div style="font-size:.75rem;color:var(--text-muted);margin-bottom:.5rem;text-transform:uppercase;letter-spacing:.06em">Choose the word that completes the sentence</div>
      <div class="question-text">${esc(q.question)}</div>
      <div class="options-list">${optionsHtml}</div>
      <div class="feedback-msg" style="min-height:1.2rem;margin-top:.5rem"></div>`;

    const feedback  = card.querySelector('.feedback-msg');
    const optBtns   = card.querySelectorAll('.option-btn');
    card._attempts  = 0;

    optBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        optBtns.forEach(b => b.disabled = true);
        const isCorrect = btn.dataset.correct === 'true';
        card._attempts = (card._attempts ?? 0) + 1;

        if (isCorrect) {
          btn.classList.add('correct');
          feedback.textContent = '✓ Correct!';
          feedback.className   = 'feedback-msg correct';
          if (!card._scored) { addScore(1, 1); card._scored = true; }
          logEvent(q.word, true, card._attempts, 0);
          answered++;
          if (answered === deck.length) showCompleteBanner(wrapper);
        } else {
          btn.classList.add('wrong');
          // Highlight correct option
          optBtns.forEach(b => { if (b.dataset.correct === 'true') b.classList.add('correct'); });
          // Look up PT-BR translation of the correct word
          const fc = (moduleData.activities.flashcards ?? [])
            .find(c => c.word.toLowerCase() === q.word.toLowerCase());
          const tr = fc?.translation;
          feedback.innerHTML = `✗ The answer was <strong>${esc(q.word)}</strong>` +
            (tr ? `<br><span class="hint-translation">${esc(tr)}</span>` : '');
          feedback.className   = 'feedback-msg wrong';
          if (!card._scored) { addScore(0, 1); card._scored = true; }
          logEvent(q.word, false, card._attempts, 0);
          answered++;
          if (answered === deck.length) showCompleteBanner(wrapper);
          // Add Try Again button
          if (!card.querySelector('.try-again-btn')) {
            const retryBtn = document.createElement('button');
            retryBtn.className   = 'btn try-again-btn';
            retryBtn.textContent = '↩ Try Again';
            retryBtn.addEventListener('click', () => {
              // Reset all option buttons
              optBtns.forEach(b => {
                b.disabled = false;
                b.classList.remove('correct', 'wrong');
              });
              feedback.textContent = '';
              feedback.className   = 'feedback-msg';
              retryBtn.remove();
              card._scored = false;
              answered--;
            });
            feedback.after(retryBtn);
          }
        }
      });
    });

    wrapper.appendChild(card);
  });

  area.appendChild(wrapper);
}

// ════════════════════════════════════════════════════════════════════════════
// 4. MATCHING
// ════════════════════════════════════════════════════════════════════════════

function renderMatching(groups) {
  const area = qs('#game-area');
  if (!groups.length) { area.innerHTML = emptyState('No matching exercises in this module.'); return; }

  const wrapper = document.createElement('div');

  groups.forEach((group, gi) => {
    const section = document.createElement('div');
    section.style.marginBottom = '2rem';

    const title = document.createElement('p');
    title.style.cssText = 'font-size:.8rem;color:var(--text-muted);margin-bottom:.6rem;text-transform:uppercase;letter-spacing:.06em';
    title.textContent = `Group ${gi + 1}`;
    section.appendChild(title);

    const wrap = document.createElement('div');
    wrap.className = 'matching-wrap';

    const words    = shuffle(group.map(p => p.word));
    const defs     = shuffle(group.map(p => p.definition));
    const pairMap  = Object.fromEntries(group.map(p => [p.word, p.definition]));
    const attempts = Object.fromEntries(group.map(p => [p.word, 0]));

    let selectedWord = null;
    let matched      = 0;

    const wordCol = document.createElement('div');
    wordCol.className = 'matching-col';
    const defCol  = document.createElement('div');
    defCol.className  = 'matching-col';

    const wordEls = words.map(w => {
      const el = document.createElement('div');
      el.className = 'match-item';
      el.textContent = w;
      el.dataset.value = w;
      el.dataset.type  = 'word';
      wordCol.appendChild(el);
      return el;
    });

    const defEls = defs.map(d => {
      const el = document.createElement('div');
      el.className = 'match-item';
      el.textContent = d;
      el.dataset.value = d;
      el.dataset.type  = 'def';
      defCol.appendChild(el);
      return el;
    });

    function clearSelected() {
      wordEls.forEach(e => e.classList.remove('selected'));
      selectedWord = null;
    }

    function handleClick(el) {
      if (el.classList.contains('matched')) return;

      if (el.dataset.type === 'word') {
        clearSelected();
        el.classList.add('selected');
        selectedWord = el.dataset.value;
      } else if (el.dataset.type === 'def' && selectedWord) {
        const correctDef = pairMap[selectedWord];

        if (el.dataset.value === correctDef) {
          // Correct match
          attempts[selectedWord] = (attempts[selectedWord] ?? 0) + 1;
          logEvent(selectedWord, true, attempts[selectedWord], 0);
          const wEl = wordEls.find(e => e.dataset.value === selectedWord);
          wEl?.classList.add('matched');
          el.classList.add('matched');
          addScore(1, 1);
          matched++;
          clearSelected();
          if (matched === group.length) {
            const msg = document.createElement('p');
            msg.style.cssText = 'color:var(--success);font-size:.85rem;margin-top:.5rem;font-weight:600';
            msg.textContent = '✓ Group complete!';
            section.appendChild(msg);
          }
        } else {
          // Wrong
          attempts[selectedWord] = (attempts[selectedWord] ?? 0) + 1;
          logEvent(selectedWord, false, attempts[selectedWord], 0);
          el.classList.add('wrong');
          const wEl = wordEls.find(e => e.dataset.value === selectedWord);
          wEl?.classList.add('wrong');
          addScore(0, 1);
          setTimeout(() => {
            el.classList.remove('wrong');
            wEl?.classList.remove('wrong');
            clearSelected();
          }, 700);
        }
      }
    }

    [...wordEls, ...defEls].forEach(el => el.addEventListener('click', () => handleClick(el)));

    wrap.appendChild(wordCol);
    wrap.appendChild(defCol);
    section.appendChild(wrap);
    wrapper.appendChild(section);
  });

  area.appendChild(wrapper);
}

// ════════════════════════════════════════════════════════════════════════════
// 5. SENTENCE ORDER
// ════════════════════════════════════════════════════════════════════════════

function renderSentenceOrder(exercises) {
  const area = qs('#game-area');
  if (!exercises.length) { area.innerHTML = emptyState('No sentence-order exercises in this module.'); return; }

  const deck    = shuffle(exercises);
  let answered  = 0;

  const wrapper = document.createElement('div');

  deck.forEach((ex, i) => {
    const card = document.createElement('div');
    card.className = 'sentence-order-card';

    const slot      = document.createElement('div');
    slot.className  = 'answer-slot';

    const tokenWrap = document.createElement('div');
    tokenWrap.className = 'word-tokens';

    const result    = document.createElement('div');
    result.className = 'sentence-result';

    const controls  = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.gap     = '.6rem';
    controls.style.marginTop = '.6rem';

    const checkBtn  = document.createElement('button');
    checkBtn.className   = 'btn btn-primary';
    checkBtn.textContent = 'Check';

    const resetBtn  = document.createElement('button');
    resetBtn.className   = 'btn';
    resetBtn.textContent = 'Reset';

    controls.appendChild(checkBtn);
    controls.appendChild(resetBtn);

    const placed = [];
    const tokens = shuffle(ex.shuffled).map(w => {
      const el = document.createElement('div');
      el.className   = 'word-token';
      el.textContent = w;
      el.addEventListener('click', () => {
        if (el.classList.contains('used')) return;
        placed.push(w);
        el.classList.add('used');
        const pt = document.createElement('div');
        pt.className   = 'placed-token';
        pt.textContent = w;
        pt.addEventListener('click', () => {
          // Remove from answer slot
          const idx2 = placed.indexOf(w);
          if (idx2 !== -1) placed.splice(idx2, 1);
          pt.remove();
          el.classList.remove('used');
        });
        slot.appendChild(pt);
      });
      tokenWrap.appendChild(el);
      return el;
    });

    card._soAttempts = 0;
    checkBtn.addEventListener('click', () => {
      if (checkBtn.disabled) return;
      const attempt = placed.join(' ');
      const correct = ex.sentence;
      card._soAttempts++;
      if (attempt.toLowerCase() === correct.toLowerCase()) {
        result.textContent = '✓ Correct!';
        result.style.color = 'var(--success)';
        result.style.fontWeight = '700';
        addScore(1, 1);
        logEvent(ex.sentence.slice(0, 60), true, card._soAttempts, 0);
      } else {
        result.innerHTML = `✗ Correct order: <em>${esc(correct)}</em>`;
        result.style.color = 'var(--danger)';
        addScore(0, 1);
        logEvent(ex.sentence.slice(0, 60), false, card._soAttempts, 0);
      }
      checkBtn.disabled = true;
      tokens.forEach(t => t.style.pointerEvents = 'none');
      answered++;
      if (answered === deck.length) showCompleteBanner(wrapper);
    });

    resetBtn.addEventListener('click', () => {
      placed.length = 0;
      slot.innerHTML = '';
      tokens.forEach(t => t.classList.remove('used'));
      result.textContent = '';
    });

    card.appendChild(slot);
    card.appendChild(tokenWrap);
    card.appendChild(result);
    card.appendChild(controls);
    wrapper.appendChild(card);
  });

  area.appendChild(wrapper);
}

// ─── Complete banner ─────────────────────────────────────────────────────────

function showCompleteBanner(container) {
  const pct = total ? Math.round((score / total) * 100) : 0;
  const banner = document.createElement('div');
  banner.className = 'game-complete';
  banner.innerHTML = `
    <h2>🎉 Activity complete!</h2>
    <div class="final-score">${pct}%</div>
    <p style="color:var(--text-muted);margin:.6rem 0 1.2rem">${score} out of ${total} correct</p>
    <button class="btn btn-primary" id="replay-btn">Try again 🔁</button>`;
  container.appendChild(banner);
  banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
  qs('#replay-btn').addEventListener('click', () => renderGame(currentGame));
}

// ─── Error helper ─────────────────────────────────────────────────────────────

function showError(msg) {
  const el = qs('#error-msg');
  const ld = qs('#loading');
  if (ld) ld.classList.add('hidden');
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
}
