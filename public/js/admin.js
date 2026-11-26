// Admin page: login, then groups / items / options / settings, all through the API.
// The admin UI itself is available in German, English and Greek (switcher in the top bar);
// menu content is entered in DE/EN/EL, with German required.

import { LANGS, DEFAULT_LANG, money, esc } from './i18n.js';
import { t, tn, getLang, setLang, serverMessage } from './admin-i18n.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const DE = DEFAULT_LANG;
const IMAGE_MAX_PX = 1200;
const IMAGE_QUALITY = 0.82;

let MENU = { settings: { name: '', tagline: {} }, groups: [] }; // from GET /api/admin/menu
let filterGroup = 'all';

/* =========================================================
   API
   ========================================================= */
class ApiError extends Error {
  constructor(status, message, errors) {
    super(message);
    this.status = status;
    this.errors = errors || null;
  }
}

async function api(method, url, body) {
  const opts = { method, headers: { Accept: 'application/json' }, credentials: 'same-origin' };
  if (body instanceof FormData) {
    opts.body = body;
  } else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, opts);
  } catch {
    throw new ApiError(0, t('noConnection'));
  }
  let data = null;
  if (res.status !== 204) {
    try { data = await res.json(); } catch { /* not JSON */ }
  }
  if (res.status === 401 && url !== '/api/auth/login') {
    closeSheet();
    showLogin(t('sessionExpired'));
    throw new ApiError(401, 'Not logged in');
  }
  if (!res.ok) {
    const msg = res.status === 429 ? t('tooMany')
      : data?.error ? serverMessage(data.error) : t('requestFailed', { status: res.status });
    throw new ApiError(res.status, msg, data?.errors);
  }
  return data;
}

async function reload() {
  MENU = await api('GET', '/api/admin/menu');
  if (filterGroup !== 'all' && !MENU.groups.some((g) => g.id === filterGroup)) filterGroup = 'all';
  renderAdmin();
}

/** Disables a button while `fn` runs. */
async function busy(button, fn) {
  if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
  try {
    return await fn();
  } finally {
    if (button) { button.disabled = false; button.removeAttribute('aria-busy'); }
  }
}

/* =========================================================
   HELPERS
   ========================================================= */
const gName = (g) => g?.name[DE] || t('noName');
const allItems = () => MENU.groups.flatMap((g) => g.items);
const findItem = (id) => allItems().find((i) => i.id === id);
const findGroup = (id) => MENU.groups.find((g) => g.id === id);
const euro = (cents) => money(cents, getLang());

function toast(msg, { error = false } = {}) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  if (error) t.style.background = 'var(--danger)';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), error ? 5000 : 2600);
}

function openSheet(html, onMount) {
  const root = $('#overlay-root');
  root.innerHTML = `<div class="overlay"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
  const ov = root.firstElementChild;
  ov.addEventListener('click', (e) => { if (e.target === ov) closeSheet(); });
  document.body.style.overflow = 'hidden';
  onMount && onMount(ov.firstElementChild);
  $('input:not([type=hidden]):not([type=file]), select, textarea', ov)?.focus();
}
function closeSheet() {
  $('#overlay-root').innerHTML = '';
  document.body.style.overflow = '';
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

function confirmBox(text, onYes) {
  openSheet(`<div class="form"><h3>${esc(t('areYouSure'))}</h3><p style="margin:0">${esc(text)}</p>
    <p class="form-err hidden" data-err role="alert"></p>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button type="button" class="btn" data-no>${esc(t('cancel'))}</button>
      <button type="button" class="btn primary" style="background:var(--danger);border-color:var(--danger)" data-yes>${esc(t('delete'))}</button>
    </div></div>`, (s) => {
    $('[data-no]', s).onclick = closeSheet;
    const yes = $('[data-yes]', s);
    yes.focus();
    yes.onclick = () => busy(yes, async () => {
      try {
        await onYes();
        closeSheet();
      } catch (err) {
        showFormError(s, err);
      }
    });
  });
}

/* ---------- translated inputs (DE required, EN/EL optional) ---------- */
function mlInputs(key, values = {}, { textarea = false, required = false, max = 120 } = {}) {
  return LANGS.map((l, i) => `<div class="in"><span>${l.label}</span>${
    textarea
      ? `<textarea rows="2" name="${key}.${l.code}" lang="${l.code}" maxlength="${max}" aria-label="${l.label}">${esc(values?.[l.code] || '')}</textarea>`
      : `<input name="${key}.${l.code}" lang="${l.code}" maxlength="${max}" aria-label="${l.label}" value="${esc(values?.[l.code] || '')}" ${required && i === 0 ? 'required' : ''}>`
  }</div>`).join('');
}
function readMl(scope, key) {
  const o = {};
  for (const l of LANGS) o[l.code] = ($(`[name="${key}.${l.code}"]`, scope)?.value || '').trim();
  return o;
}

/* ---------- errors next to fields ---------- */
function clearErrors(scope) {
  $$('.field-err', scope).forEach((e) => e.remove());
  $$('.invalid', scope).forEach((e) => e.classList.remove('invalid'));
  const box = $('[data-err]', scope);
  if (box) { box.textContent = ''; box.classList.add('hidden'); }
}

function markField(el, msg) {
  const wrap = el.closest('.in') || el;
  wrap.classList.add('invalid');
  const p = document.createElement('p');
  p.className = 'err field-err';
  p.textContent = msg;
  wrap.after(p);
}

/**
 * Shows server errors. `locate(key)` maps an API field ("name.de", "options.0.extraPriceCents")
 * to an input; anything it can't place goes in the form's general error box.
 * Messages are translated; amounts in cents are shown as euros ("At most € 1.000,00").
 */
function showFormError(scope, err, locate = () => null) {
  clearErrors(scope);
  const general = [];
  if (err.errors) {
    for (const [key, raw] of Object.entries(err.errors)) {
      const msg = serverMessage(raw, key, euro);
      const el = locate(key);
      if (el) markField(el, msg);
      else general.push(`${key}: ${msg}`);
    }
    $('.invalid input, .invalid textarea, .inp.invalid', scope)?.focus();
  } else {
    general.push(err.message);
  }
  const box = $('[data-err]', scope);
  if (general.length && box) {
    box.textContent = general.join(' · ');
    box.classList.remove('hidden');
  } else if (general.length) {
    toast(general.join(' · '), { error: true });
  }
}

/** Client-side check before sending: German name required. Returns false if invalid. */
function requireGerman(scope, key) {
  const el = $(`[name="${key}.${DE}"]`, scope);
  if (el && !el.value.trim()) {
    markField(el, t('required'));
    el.focus();
    return false;
  }
  return true;
}

/** "13,90" or "13.9" → 1390 cents; null if not a valid amount. */
function toCents(value) {
  const n = Number(String(value).trim().replace(',', '.'));
  if (String(value).trim() === '' || !Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}
const centsToInput = (c) => (c == null ? '' : (c / 100).toFixed(2));
const PRICE_MAX_CENTS = 100000; // same limit as the API

/* ---------- images: resize to ≤1200 px JPEG in the browser ---------- */
function resizeImage(file, max = IMAGE_MAX_PX) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * r);
      c.height = Math.round(img.naturalHeight * r);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; // transparent PNGs get a white background in JPEG
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))), 'image/jpeg', IMAGE_QUALITY);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('not an image')); };
    img.src = url;
  });
}

async function uploadImage(itemId, blob) {
  const fd = new FormData();
  fd.append('file', blob, 'image.jpg');
  return api('POST', `/api/admin/items/${itemId}/image`, fd);
}

/* =========================================================
   RENDER
   ========================================================= */
function itemRow(it, { first, last }) {
  const g = findGroup(it.groupId);
  const opts = it.options.length ? ` · ${tn('nOptions', it.options.length)}` : '';
  return `<div class="row">
    ${it.imageUrl ? `<img src="${esc(it.imageUrl)}" alt="" loading="lazy">` : '<div class="ph"></div>'}
    <div class="info">
      <strong lang="${DE}">${esc(it.name[DE] || t('noName'))}${it.isAvailable ? '' : `<span class="pill off" lang="${getLang()}">${esc(t('notAvailable'))}</span>`}</strong>
      <small>${esc(gName(g))} · ${euro(it.priceCents)}${opts}</small>
    </div>
    <div class="acts">
      <button type="button" class="btn icon ghost" data-act="item-up" data-id="${it.id}" aria-label="${esc(t('moveUp'))}" ${first ? 'disabled' : ''}>↑</button>
      <button type="button" class="btn icon ghost" data-act="item-down" data-id="${it.id}" aria-label="${esc(t('moveDown'))}" ${last ? 'disabled' : ''}>↓</button>
      <button type="button" class="btn icon" data-act="item-edit" data-id="${it.id}">${esc(t('edit'))}</button>
    </div></div>`;
}

function renderAdmin() {
  // group filter
  $('#filter-group').innerHTML = `<option value="all">${esc(t('allGroups'))}</option>` +
    MENU.groups.map((g) => `<option value="${g.id}" ${filterGroup === g.id ? 'selected' : ''}>${esc(gName(g))}</option>`).join('');

  // items, grouped in menu order; arrows move an item within its group
  const groups = MENU.groups.filter((g) => filterGroup === 'all' || g.id === filterGroup);
  const showHeads = filterGroup === 'all';
  const html = groups.map((g) => {
    if (!g.items.length) return '';
    const rows = g.items.map((it, i) => itemRow(it, { first: i === 0, last: i === g.items.length - 1 })).join('');
    return (showHeads ? `<div class="group-head">${esc(gName(g))}</div>` : '') + rows;
  }).join('');
  $('#item-list').innerHTML = html || (MENU.groups.length
    ? `<p class="empty">${esc(t('emptyItems'))}</p>`
    : `<p class="empty">${esc(t('addGroupFirstLong'))}</p>`);

  // groups
  $('#group-list').innerHTML = MENU.groups.length ? MENU.groups.map((g, i) => `<div class="row">
      <div class="info">
        <strong lang="${DE}">${esc(gName(g))}${g.isVisible ? '' : `<span class="pill off" lang="${getLang()}">${esc(t('hidden'))}</span>`}</strong>
        <small>${LANGS.slice(1).map((l) => esc(g.name[l.code] || '—')).join(' · ')} · ${tn('nItems', g.items.length)}</small>
      </div>
      <div class="acts">
        <button type="button" class="btn icon ghost" data-act="group-up" data-id="${g.id}" aria-label="${esc(t('moveUp'))}" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="btn icon ghost" data-act="group-down" data-id="${g.id}" aria-label="${esc(t('moveDown'))}" ${i === MENU.groups.length - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" class="btn icon" data-act="group-edit" data-id="${g.id}">${esc(t('edit'))}</button>
      </div></div>`).join('') : `<p class="empty">${esc(t('emptyGroups'))}</p>`;

  // settings (don't overwrite what the owner is typing)
  const sf = $('#settings-form');
  if (!sf.contains(document.activeElement)) {
    sf.elements.name.value = MENU.settings.name;
    $('[data-ml="tagline"]', sf).innerHTML = mlInputs('tagline', MENU.settings.tagline, { max: 200 });
  }
}

/* =========================================================
   REORDER (↑ / ↓)
   ========================================================= */
let moving = false;
async function moveIn(ids, id, dir, url) {
  const i = ids.indexOf(id);
  const j = i + dir;
  if (moving || i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  moving = true;
  $$('[data-act$="-up"], [data-act$="-down"]').forEach((b) => (b.disabled = true));
  try {
    await api('PUT', url, { ids });
  } catch (err) {
    if (err.status !== 401) toast(err.message, { error: true });
  } finally {
    moving = false;
    await reload().catch(() => {});
  }
}
const moveGroup = (id, dir) => moveIn(MENU.groups.map((g) => g.id), id, dir, '/api/admin/groups/order');
function moveItem(id, dir) {
  const g = findGroup(findItem(id)?.groupId);
  if (g) moveIn(g.items.map((i) => i.id), id, dir, `/api/admin/groups/${g.id}/items/order`);
}

/* =========================================================
   GROUP EDITOR
   ========================================================= */
function editGroup(id) {
  const g = id ? findGroup(id) : { name: {}, isVisible: true, items: [] };
  if (!g) return;
  openSheet(`<form class="form" novalidate>
      <h3>${esc(t(id ? 'editGroup' : 'newGroup'))}</h3>
      <div class="field"><span class="fieldset-label">${esc(t('name'))}</span><div class="ml">${mlInputs('name', g.name, { required: true })}</div></div>
      <label class="switch"><input type="checkbox" name="visible" ${g.isVisible ? 'checked' : ''}> ${esc(t('showOnMenu'))}</label>
      <p class="form-err hidden" data-err role="alert"></p>
      <div class="form-actions">
        ${id ? `<button type="button" class="btn danger" data-del style="margin-right:auto">${esc(t('delete'))}</button>` : ''}
        <button type="button" class="btn" data-cancel>${esc(t('cancel'))}</button><button class="btn primary" data-save>${esc(t('save'))}</button>
      </div></form>`, (s) => {
    const f = $('form', s);
    $('[data-cancel]', s).onclick = closeSheet;

    const del = $('[data-del]', s);
    if (del) del.onclick = () => {
      const n = g.items.length;
      confirmBox(
        n ? t('confirmDeleteGroupItems', { name: gName(g), n }) : t('confirmDelete', { name: gName(g) }),
        async () => {
          await api('DELETE', `/api/admin/groups/${id}`);
          if (filterGroup === id) filterGroup = 'all';
          await reload();
          toast(t('groupDeleted'));
        },
      );
    };

    f.onsubmit = (e) => {
      e.preventDefault();
      clearErrors(f);
      if (!requireGerman(f, 'name')) return;
      const body = { name: readMl(f, 'name'), isVisible: f.elements.visible.checked };
      busy($('[data-save]', s), async () => {
        try {
          if (id) await api('PUT', `/api/admin/groups/${id}`, body);
          else await api('POST', '/api/admin/groups', body);
          closeSheet();
          await reload();
          toast(t('groupSaved'));
        } catch (err) {
          showFormError(f, err, (key) => {
            if (key.startsWith('name.')) return f.elements[key];
            if (key === 'isVisible') return f.elements.visible;
            return null;
          });
        }
      });
    };
  });
}

/* =========================================================
   ITEM EDITOR
   ========================================================= */
function optionRow(o = { name: {}, extraPriceCents: 0 }, n) {
  return `<div class="opt-row" ${o.id ? `data-opt-id="${o.id}"` : ''}>
    <div class="head"><span>${esc(t('optionN', { n }))}</span><button type="button" class="btn icon ghost" data-rm-opt aria-label="${esc(t('removeOption'))}">✕</button></div>
    <div class="ml">${mlInputs('opt', o.name)}</div>
    <div class="field"><label>${esc(t('extraPrice'))}</label>
      <input class="inp" type="number" inputmode="decimal" step="0.01" min="0" max="1000" name="opt.price" value="${centsToInput(o.extraPriceCents ?? 0)}"></div>
  </div>`;
}

function editItem(id) {
  if (!MENU.groups.length) { toast(t('addGroupFirst')); return; }
  const existing = id ? findItem(id) : null;
  if (id && !existing) return;
  const it = existing ? structuredClone(existing) : {
    groupId: filterGroup !== 'all' ? filterGroup : MENU.groups[0].id,
    name: {}, description: {}, priceCents: null, imageUrl: null, options: [], isAvailable: true,
  };
  let pendingImage = null; // new item: image is uploaded after the first save

  openSheet(`<form class="form" novalidate>
      <h3>${esc(t(id ? 'editItem' : 'newItem'))}</h3>
      <div class="field"><label for="f-group">${esc(t('group'))}</label>
        <select class="inp" id="f-group" name="groupId">${MENU.groups.map((g) =>
          `<option value="${g.id}" ${g.id === it.groupId ? 'selected' : ''}>${esc(gName(g))}${g.isVisible ? '' : ` ${esc(t('hiddenSuffix'))}`}</option>`).join('')}</select></div>
      <div class="field"><span class="fieldset-label">${esc(t('name'))}</span><div class="ml">${mlInputs('name', it.name, { required: true })}</div></div>
      <div class="field"><span class="fieldset-label">${esc(t('description'))}</span><div class="ml">${mlInputs('desc', it.description, { textarea: true, max: 600 })}</div></div>
      <div class="two">
        <div class="field"><label for="f-price">${esc(t('price'))}</label>
          <input class="inp" id="f-price" type="number" inputmode="decimal" step="0.01" min="0" max="1000" name="price" value="${centsToInput(it.priceCents)}" required></div>
        <div class="field" style="align-self:end"><label class="switch"><input type="checkbox" name="available" ${it.isAvailable ? 'checked' : ''}> ${esc(t('available'))}</label></div>
      </div>
      <div class="field"><span class="fieldset-label">${esc(t('image'))}</span>
        <div class="img-box">
          <img class="preview" alt="" ${it.imageUrl ? `src="${esc(it.imageUrl)}"` : ''}>
          <div style="display:grid;gap:6px">
            <label class="btn" style="text-align:center;display:flex;align-items:center;justify-content:center" data-pick>${esc(t('chooseImage'))}<input type="file" accept="image/*" hidden data-file></label>
            <button type="button" class="btn ghost danger" data-rm-img ${it.imageUrl ? '' : 'hidden'}>${esc(t('removeImage'))}</button>
            <span class="uploading hidden" data-uploading></span>
          </div>
        </div></div>
      <div class="field"><span class="fieldset-label">${esc(t('options'))} <span style="font-weight:400;color:var(--muted)">${esc(t('optionsHint'))}</span></span>
        <div style="display:grid;gap:8px" data-opts>${it.options.map((o, i) => optionRow(o, i + 1)).join('')}</div>
        <button type="button" class="btn" style="margin-top:8px" data-add-opt>${esc(t('addOption'))}</button></div>
      <p class="form-err hidden" data-err role="alert"></p>
      <div class="form-actions">
        ${id ? `<button type="button" class="btn danger" data-del style="margin-right:auto">${esc(t('delete'))}</button>` : ''}
        <button type="button" class="btn" data-cancel>${esc(t('cancel'))}</button><button class="btn primary" data-save>${esc(t('save'))}</button>
      </div></form>`, (s) => {
    const f = $('form', s);
    const opts = $('[data-opts]', s);
    const prev = $('.preview', s);
    const rmImg = $('[data-rm-img]', s);
    const uploading = $('[data-uploading]', s);
    const save = $('[data-save]', s);
    const renumber = () => $$('.opt-row .head span', opts).forEach((el, i) => (el.textContent = t('optionN', { n: i + 1 })));

    $('[data-cancel]', s).onclick = closeSheet;
    $('[data-add-opt]', s).onclick = () => {
      if (opts.children.length >= 20) { toast(t('maxOptions')); return; }
      opts.insertAdjacentHTML('beforeend', optionRow(undefined, opts.children.length + 1));
      $('.opt-row:last-child input', opts)?.focus();
    };
    opts.addEventListener('click', (e) => {
      if (e.target.closest('[data-rm-opt]')) { e.target.closest('.opt-row').remove(); renumber(); }
    });

    const setPreview = (src) => {
      if (src) prev.src = src; else prev.removeAttribute('src');
      rmImg.hidden = !src;
    };

    // Existing item: upload right away. New item: keep it until the item is saved.
    $('[data-file]', s).onchange = async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      uploading.textContent = t(id ? 'uploading' : 'preparing');
      uploading.classList.remove('hidden');
      save.disabled = true;
      let blob;
      try {
        blob = await resizeImage(file);
      } catch {
        uploading.classList.add('hidden');
        save.disabled = false;
        toast(t('notAnImage'), { error: true });
        return;
      }
      if (!id) {
        pendingImage = blob;
        setPreview(URL.createObjectURL(blob));
        uploading.classList.add('hidden');
        save.disabled = false;
        return;
      }
      try {
        const { imageUrl } = await uploadImage(id, blob);
        setPreview(imageUrl);
        toast(t('imageSaved'));
        reload().catch(() => {});
      } catch (err) {
        if (err.status !== 401) toast(err.errors?.file ? serverMessage(err.errors.file) : err.message, { error: true });
      } finally {
        uploading.classList.add('hidden');
        save.disabled = false;
      }
    };

    rmImg.onclick = () => {
      if (!id) { pendingImage = null; setPreview(null); return; }
      busy(rmImg, async () => {
        try {
          await api('DELETE', `/api/admin/items/${id}/image`);
          setPreview(null);
          toast(t('imageRemoved'));
          reload().catch(() => {});
        } catch (err) {
          if (err.status !== 401) toast(err.message, { error: true });
        }
      });
    };

    const del = $('[data-del]', s);
    if (del) del.onclick = () => confirmBox(t('confirmDelete', { name: it.name[DE] }), async () => {
      await api('DELETE', `/api/admin/items/${id}`);
      await reload();
      toast(t('itemDeleted'));
    });

    f.onsubmit = (e) => {
      e.preventDefault();
      clearErrors(f);
      if (!requireGerman(f, 'name')) return;

      const priceCents = toCents(f.elements.price.value);
      if (priceCents === null) { markField(f.elements.price, t('enterPrice')); f.elements.price.focus(); return; }
      if (priceCents > PRICE_MAX_CENTS) { markField(f.elements.price, t('maxAmount', { amount: euro(PRICE_MAX_CENTS) })); f.elements.price.focus(); return; }

      // Rows with no name at all are ignored; the rest are sent in order (the API keys errors by index).
      const rows = $$('.opt-row', opts).filter((row) => Object.values(readMl(row, 'opt')).some(Boolean));
      let bad = false;
      const options = rows.map((row) => {
        const extra = toCents($('[name="opt.price"]', row).value || '0');
        if (extra === null) { markField($('[name="opt.price"]', row), t('enterAmount')); bad = true; }
        else if (extra > PRICE_MAX_CENTS) { markField($('[name="opt.price"]', row), t('maxAmount', { amount: euro(PRICE_MAX_CENTS) })); bad = true; }
        if (!requireGerman(row, 'opt')) bad = true;
        const o = { name: readMl(row, 'opt'), extraPriceCents: extra ?? 0 };
        if (row.dataset.optId) o.id = Number(row.dataset.optId);
        return o;
      });
      if (bad) return;

      const body = {
        groupId: Number(f.elements.groupId.value),
        name: readMl(f, 'name'),
        description: readMl(f, 'desc'),
        priceCents,
        isAvailable: f.elements.available.checked,
        options,
      };

      busy(save, async () => {
        try {
          const saved = id
            ? await api('PUT', `/api/admin/items/${id}`, body)
            : await api('POST', '/api/admin/items', body);
          if (!id && pendingImage) {
            try {
              await uploadImage(saved.id, pendingImage);
            } catch (err) {
              if (err.status === 401) return;
              closeSheet();
              await reload();
              const why = err.errors?.file ? serverMessage(err.errors.file) : err.message;
              toast(t('itemSavedImageFailed', { msg: why }), { error: true });
              return;
            }
          }
          closeSheet();
          await reload();
          toast(t('itemSaved'));
        } catch (err) {
          if (err.status === 401) return;
          showFormError(f, err, (key) => {
            const m = key.match(/^options\.(\d+)\.(.+)$/);
            if (m) {
              const row = rows[Number(m[1])];
              if (!row) return opts;
              if (m[2] === 'extraPriceCents') return $('[name="opt.price"]', row);
              if (m[2].startsWith('name.')) return $(`[name="opt.${m[2].slice(5)}"]`, row);
              return null;
            }
            if (key.startsWith('name.')) return f.elements[key];
            if (key.startsWith('description.')) return f.elements[`desc.${key.slice(12)}`];
            if (key === 'priceCents') return f.elements.price;
            if (key === 'groupId') return f.elements.groupId;
            if (key === 'options') return opts;
            return null;
          });
        }
      });
    };
  });
}

/* =========================================================
   SETTINGS
   ========================================================= */
$('#settings-form').onsubmit = (e) => {
  e.preventDefault();
  const f = e.target;
  clearErrors(f);
  const name = f.elements.name.value.trim();
  if (!name) { markField(f.elements.name, t('required')); f.elements.name.focus(); return; }
  busy($('button.primary', f), async () => {
    try {
      MENU.settings = await api('PUT', '/api/admin/settings', { name, tagline: readMl(f, 'tagline') });
      document.activeElement?.blur();
      renderAdmin();
      toast(t('saved'));
    } catch (err) {
      if (err.status !== 401) showFormError(f, err, (key) => f.elements[key]);
    }
  });
};

/* =========================================================
   EVENTS
   ========================================================= */
$('#view-admin').addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) {
    $$('[data-tab]').forEach((b) => b.setAttribute('aria-selected', b === tab));
    ['items', 'groups', 'settings'].forEach((t) => $('#tab-' + t).classList.toggle('hidden', t !== tab.dataset.tab));
    return;
  }
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const id = Number(b.dataset.id);
  ({
    'item-up': () => moveItem(id, -1), 'item-down': () => moveItem(id, 1), 'item-edit': () => editItem(id),
    'group-up': () => moveGroup(id, -1), 'group-down': () => moveGroup(id, 1), 'group-edit': () => editGroup(id),
  })[b.dataset.act]?.();
});
$('#add-item').onclick = () => editItem();
$('#add-group').onclick = () => editGroup();
$('#filter-group').onchange = (e) => {
  filterGroup = e.target.value === 'all' ? 'all' : Number(e.target.value);
  renderAdmin();
};

$('#logout').onclick = (e) => busy(e.currentTarget, async () => {
  try { await api('POST', '/api/auth/logout'); } catch { /* logged out either way */ }
  showLogin();
});

/* =========================================================
   ADMIN LANGUAGE (DE / EN / ΕΛ)
   ========================================================= */
/** Static texts in admin/index.html: data-i18n="key" (text), data-i18n-aria="key" (aria-label). */
function applyTexts() {
  const lang = getLang();
  document.documentElement.lang = lang;
  document.title = `${t('title')} — Gyros Sta Adelfia`;
  $$('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
  $$('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
  $$('[data-langs]').forEach((box) => {
    box.setAttribute('aria-label', t('language'));
    box.innerHTML = LANGS.map((l) =>
      `<button type="button" data-lang="${l.code}" lang="${l.code}" aria-pressed="${l.code === lang}">${l.label}</button>`).join('');
  });
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-langs] [data-lang]');
  if (!b || b.dataset.lang === getLang()) return;
  setLang(b.dataset.lang);
  // Keep a ?lang= link in step with the choice, so a reload shows the same language.
  const url = new URL(location.href);
  if (url.searchParams.has('lang')) {
    url.searchParams.set('lang', b.dataset.lang);
    history.replaceState(null, '', url);
  }
  applyTexts();
  // Re-render the lists. Field errors on the login form are dropped (they were in the old language).
  if (!$('#view-admin').classList.contains('hidden')) renderAdmin();
  else clearErrors($('#login-form'));
  $(`[data-langs] [data-lang="${b.dataset.lang}"]`, b.closest('[data-langs]').parentElement)?.focus();
});

applyTexts();

/* =========================================================
   LOGIN / VIEWS
   ========================================================= */
function showView(name) {
  for (const v of ['loading', 'login', 'admin']) $(`#view-${v}`).classList.toggle('hidden', v !== name);
}

function showLogin(message) {
  closeSheet();
  MENU = { settings: { name: '', tagline: {} }, groups: [] };
  showView('login');
  const f = $('#login-form');
  f.reset();
  clearErrors(f);
  if (message) {
    const box = $('[data-err]', f);
    box.textContent = message;
    box.classList.remove('hidden');
  }
  f.elements.username.focus();
}

async function showDashboard() {
  showView('admin');
  try {
    await reload();
  } catch (err) {
    if (err.status !== 401) toast(err.message, { error: true });
  }
}

$('#login-form').onsubmit = (e) => {
  e.preventDefault();
  const f = e.target;
  clearErrors(f);
  const username = f.elements.username.value.trim();
  const password = f.elements.password.value;
  if (!username) { markField(f.elements.username, t('required')); f.elements.username.focus(); return; }
  if (!password) { markField(f.elements.password, t('required')); f.elements.password.focus(); return; }
  busy($('button.primary', f), async () => {
    try {
      await api('POST', '/api/auth/login', { username, password });
      f.reset();
      await showDashboard();
    } catch (err) {
      showFormError(f, err.status === 401 ? new ApiError(401, t('wrongLogin')) : err);
      f.elements.password.value = '';
      f.elements.password.focus();
    }
  });
};

/* On load: logged in already? */
(async () => {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (res.ok) await showDashboard();
    else showLogin();
  } catch {
    showLogin(t('noConnection'));
  }
})();
