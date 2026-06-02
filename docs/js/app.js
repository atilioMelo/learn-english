/* app.js – Index page: load and render module cards */

(async function () {
  const grid    = document.getElementById('modules-grid');
  const loading = document.getElementById('loading');
  const errorEl = document.getElementById('error-msg');

  async function loadModules() {
    const resp = await fetch('data/modules.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  }

  function renderCard(mod) {
    const a = document.createElement('a');
    a.className = 'module-card';
    a.href = `play.html?module=${mod.module}`;

    a.innerHTML = `
      <span class="card-num">Module ${String(mod.module).padStart(2, '0')}</span>
      <span class="card-title">${escHtml(mod.title)}</span>
      <div class="card-meta">
        <span class="card-tag">📄 ${mod.episodes} episode${mod.episodes !== 1 ? 's' : ''}</span>
        <span class="card-tag">📝 ${mod.vocab_count} words</span>
      </div>`;
    return a;
  }

  try {
    const modules = await loadModules();
    loading.classList.add('hidden');

    if (!modules.length) {
      errorEl.textContent = 'No modules found. Run the Python script to generate the first one.';
      errorEl.classList.remove('hidden');
      return;
    }

    modules.forEach(mod => grid.appendChild(renderCard(mod)));
    grid.classList.remove('hidden');
  } catch (err) {
    loading.classList.add('hidden');
    errorEl.textContent = `Could not load modules: ${err.message}`;
    errorEl.classList.remove('hidden');
  }
})();

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
