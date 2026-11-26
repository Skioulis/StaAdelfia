// Languages, UI strings and formatting helpers shared by the menu and admin pages.

/** First entry is the default language. */
export const LANGS = [
  { code: 'de', label: 'DE', locale: 'de-AT' }, // Austrian German (default)
  { code: 'en', label: 'EN', locale: 'en-IE' },
  { code: 'el', label: 'ΕΛ', locale: 'el-GR' },
];
export const DEFAULT_LANG = LANGS[0].code;
const FALLBACK = ['de', 'en', 'el'];
const CURRENCY = 'EUR';
const STORAGE_KEY = 'menu-lang';

/** UI text on the public menu, per language. */
export const UI = {
  de: { eyebrow: 'Speisekarte', options: 'Auswahl', choose: 'Mit Auswahl', unavailable: 'Heute nicht verfügbar', empty: 'Die Speisekarte wird gerade vorbereitet.', included: 'inklusive', error: 'Die Speisekarte konnte nicht geladen werden. Bitte später erneut versuchen.', retry: 'Erneut versuchen', close: 'Schließen', language: 'Sprache' },
  en: { eyebrow: 'Menu', options: 'Options', choose: 'Options available', unavailable: 'Not available today', empty: 'The menu is being prepared.', included: 'included', error: 'The menu could not be loaded. Please try again later.', retry: 'Try again', close: 'Close', language: 'Language' },
  el: { eyebrow: 'Μενού', options: 'Επιλογές', choose: 'Με επιλογές', unavailable: 'Μη διαθέσιμο σήμερα', empty: 'Το μενού ετοιμάζεται.', included: 'περιλαμβάνεται', error: 'Δεν ήταν δυνατή η φόρτωση του μενού. Δοκιμάστε ξανά αργότερα.', retry: 'Δοκιμάστε ξανά', close: 'Κλείσιμο', language: 'Γλώσσα' },
};

const isLang = (code) => LANGS.some((l) => l.code === code);

/** Language choice order: ?lang= in the URL, saved choice, browser language, then the default. */
export function initialLang() {
  const fromUrl = new URLSearchParams(location.search).get('lang');
  if (isLang(fromUrl)) return fromUrl;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLang(saved)) return saved;
  } catch {}
  for (const l of navigator.languages || [navigator.language || '']) {
    const code = l.slice(0, 2).toLowerCase();
    if (isLang(code)) return code;
  }
  return DEFAULT_LANG;
}

export function saveLang(code) {
  try { localStorage.setItem(STORAGE_KEY, code); } catch {}
}

/** Translated text with fallback: requested language → de → en → el. */
export function tr(obj, lang) {
  if (!obj) return '';
  for (const code of [lang, ...FALLBACK]) {
    if (obj[code]) return obj[code];
  }
  return '';
}

export const localeOf = (lang) => (LANGS.find((l) => l.code === lang) || LANGS[0]).locale;

/** Formats integer cents as euros in the language's locale. */
export function money(cents, lang) {
  return new Intl.NumberFormat(localeOf(lang), { style: 'currency', currency: CURRENCY })
    .format((cents || 0) / 100);
}

export const ui = (key, lang) => (UI[lang] || UI[DEFAULT_LANG])[key];

/** Escapes text for use inside innerHTML. Never put stored text into HTML without it. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
