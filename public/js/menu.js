import { LANGS, initialLang, saveLang, tr, money, ui, esc } from './i18n.js';

const $ = (s, r = document) => r.querySelector(s);

let lang = initialLang();
let MENU = null; // { settings, groups } from /api/menu
let loadError = false;

/* ---------- data ---------- */
async function loadMenu() {
  loadError = false;
  try {
    const res = await fetch('/api/menu', { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    MENU = await res.json();
  } catch (err) {
    console.error('Loading the menu failed:', err);
    loadError = true;
  }
  render();
}

const findItem = (id) => {
  for (const g of MENU?.groups ?? []) {
    const it = g.items.find((i) => i.id === id);
    if (it) return it;
  }
  return null;
};

/* ---------- sheet (item detail) ---------- */
function openSheet(html, onMount) {
  const root = $('#overlay-root');
  root.innerHTML = `<div class="overlay"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
  const ov = root.firstElementChild;
  ov.addEventListener('click', (e) => { if (e.target === ov) closeSheet(); });
  document.body.style.overflow = 'hidden';
  onMount && onMount(ov.firstElementChild);
}
function closeSheet() {
  $('#overlay-root').innerHTML = '';
  document.body.style.overflow = '';
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

/* ---------- render ---------- */
function renderHeader() {
  document.documentElement.lang = lang;
  $('#m-eyebrow').textContent = ui('eyebrow', lang);
  const name = MENU?.settings.name || 'Gyros Sta Adelfia';
  $('#m-name').textContent = name;
  $('#m-tagline').textContent = MENU ? tr(MENU.settings.tagline, lang) : '';
  document.title = `${name} — ${ui('eyebrow', lang)}`;
  $('#m-langs').setAttribute('aria-label', ui('language', lang));
  $('#m-langs').innerHTML = LANGS.map((l) =>
    `<button type="button" data-lang="${l.code}" lang="${l.code}" aria-pressed="${l.code === lang}">${l.label}</button>`
  ).join('');
}

function itemCard(it) {
  const name = tr(it.name, lang);
  const desc = tr(it.description, lang);
  return `
    <button type="button" class="item ${it.imageUrl ? '' : 'no-img'} ${it.isAvailable ? '' : 'unavailable'}" data-item="${it.id}">
      <div>
        <h3>${esc(name)}</h3>
        ${desc ? `<p class="desc">${esc(desc)}</p>` : ''}
        <div class="bottom">
          <span class="price">${money(it.priceCents, lang)}</span>
          ${!it.isAvailable ? `<span class="badge-off">${esc(ui('unavailable', lang))}</span>`
            : it.options.length ? `<span class="opt-hint">${esc(ui('choose', lang))}</span>` : ''}
        </div>
      </div>
      ${it.imageUrl ? `<img class="thumb" src="${esc(it.imageUrl)}" alt="" loading="lazy">` : ''}
    </button>`;
}

function render() {
  renderHeader();

  if (loadError) {
    $('#m-chips').innerHTML = '';
    $('#m-groups').innerHTML = `<div class="empty"><p>${esc(ui('error', lang))}</p>
      <button type="button" class="btn" data-retry>${esc(ui('retry', lang))}</button></div>`;
    return;
  }
  if (!MENU) return; // still loading

  const groups = MENU.groups.filter((g) => g.items.length);
  $('#m-chips').innerHTML = groups.map((g, i) =>
    `<button type="button" class="chip ${i === 0 ? 'active' : ''}" data-target="g-${g.id}">${esc(tr(g.name, lang))}</button>`
  ).join('');

  $('#m-groups').innerHTML = groups.length ? groups.map((g) => `
    <section class="group" id="g-${g.id}">
      <h2>${esc(tr(g.name, lang))}</h2>
      <div class="items">${g.items.map(itemCard).join('')}</div>
    </section>`).join('') : `<p class="empty">${esc(ui('empty', lang))}</p>`;

  setupScrollSpy();
}

function showItem(id) {
  const it = findItem(id);
  if (!it) return;
  const desc = tr(it.description, lang);
  openSheet(`
    <div class="close-wrap"><button type="button" class="close" aria-label="${esc(ui('close', lang))}">×</button></div>
    ${it.imageUrl ? `<img class="hero" src="${esc(it.imageUrl)}" alt="">` : '<div style="height:44px"></div>'}
    <div class="body">
      <h3>${esc(tr(it.name, lang))}</h3>
      ${desc ? `<p class="full-desc">${esc(desc)}</p>` : ''}
      ${it.options.length ? `<p class="label-sm">${esc(ui('options', lang))}</p>
        <ul class="opts">${it.options.map((o) => `<li><span>${esc(tr(o.name, lang))}</span><span>${
          o.extraPriceCents > 0 ? '+ ' + money(o.extraPriceCents, lang) : esc(ui('included', lang))
        }</span></li>`).join('')}</ul>` : ''}
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span class="price" style="font-size:24px">${money(it.priceCents, lang)}</span>
        ${!it.isAvailable ? `<span class="badge-off">${esc(ui('unavailable', lang))}</span>` : ''}
      </div>
    </div>`, (s) => {
    const btn = $('.close', s);
    btn.onclick = closeSheet;
    btn.focus();
  });
}

/* ---------- scroll spy: highlight the chip of the group in view ---------- */
let spy;
function setupScrollSpy() {
  spy && spy.disconnect();
  spy = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      document.querySelectorAll('.chip').forEach((c) => {
        const on = c.dataset.target === e.target.id;
        c.classList.toggle('active', on);
        if (on) c.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
      });
    });
  }, { rootMargin: '-70px 0px -70% 0px' });
  document.querySelectorAll('.group').forEach((s) => spy.observe(s));
}

/* ---------- events ---------- */
function setLang(code) {
  lang = code;
  saveLang(code);
  // Keep a shared ?lang= link in step with the switcher, so a reload shows the same language.
  const url = new URL(location.href);
  if (url.searchParams.has('lang')) {
    url.searchParams.set('lang', code);
    history.replaceState(null, '', url);
  }
  render();
}

$('#view-menu').addEventListener('click', (e) => {
  const lb = e.target.closest('[data-lang]');
  if (lb) { setLang(lb.dataset.lang); return; }
  const chip = e.target.closest('.chip');
  if (chip) { document.getElementById(chip.dataset.target)?.scrollIntoView({ behavior: 'smooth' }); return; }
  const item = e.target.closest('[data-item]');
  if (item) { showItem(Number(item.dataset.item)); return; }
  if (e.target.closest('[data-retry]')) loadMenu();
});

render();
loadMenu();
