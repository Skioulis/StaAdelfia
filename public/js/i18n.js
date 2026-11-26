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
  de: { eyebrow: 'Speisekarte', options: 'Auswahl', choose: 'Mit Auswahl', unavailable: 'Heute nicht verfügbar', empty: 'Die Speisekarte wird gerade vorbereitet.', included: 'inklusive', error: 'Die Speisekarte konnte nicht geladen werden. Bitte später erneut versuchen.', retry: 'Erneut versuchen', close: 'Schließen', language: 'Sprache', allergens: 'Allergene', allergenInfo: 'Allergeninformation', allergenNote: 'Kennzeichnung nach EU-Verordnung 1169/2011. Bei Fragen hilft Ihnen unser Personal gerne weiter.' },
  en: { eyebrow: 'Menu', options: 'Options', choose: 'Options available', unavailable: 'Not available today', empty: 'The menu is being prepared.', included: 'included', error: 'The menu could not be loaded. Please try again later.', retry: 'Try again', close: 'Close', language: 'Language', allergens: 'Allergens', allergenInfo: 'Allergen information', allergenNote: 'Labelled according to EU Regulation 1169/2011. Please ask our staff if you have any questions.' },
  el: { eyebrow: 'Μενού', options: 'Επιλογές', choose: 'Με επιλογές', unavailable: 'Μη διαθέσιμο σήμερα', empty: 'Το μενού ετοιμάζεται.', included: 'περιλαμβάνεται', error: 'Δεν ήταν δυνατή η φόρτωση του μενού. Δοκιμάστε ξανά αργότερα.', retry: 'Δοκιμάστε ξανά', close: 'Κλείσιμο', language: 'Γλώσσα', allergens: 'Αλλεργιογόνα', allergenInfo: 'Πληροφορίες για αλλεργιογόνα', allergenNote: 'Σήμανση σύμφωνα με τον Κανονισμό (ΕΕ) 1169/2011. Για ερωτήσεις απευθυνθείτε στο προσωπικό μας.' },
};

/**
 * The 14 EU allergens with the letter codes used on Austrian menus (A–R).
 * Must match ALLERGEN_CODES in src/lib/allergens.js (a test checks this).
 */
export const ALLERGENS = {
  A: { de: 'Glutenhaltiges Getreide', en: 'Cereals containing gluten', el: 'Δημητριακά με γλουτένη' },
  B: { de: 'Krebstiere', en: 'Crustaceans', el: 'Καρκινοειδή' },
  C: { de: 'Eier', en: 'Eggs', el: 'Αυγά' },
  D: { de: 'Fisch', en: 'Fish', el: 'Ψάρια' },
  E: { de: 'Erdnüsse', en: 'Peanuts', el: 'Αράπικα φιστίκια' },
  F: { de: 'Soja', en: 'Soy', el: 'Σόγια' },
  G: { de: 'Milch und Laktose', en: 'Milk and lactose', el: 'Γάλα και λακτόζη' },
  H: { de: 'Schalenfrüchte', en: 'Tree nuts', el: 'Ξηροί καρποί' },
  L: { de: 'Sellerie', en: 'Celery', el: 'Σέλινο' },
  M: { de: 'Senf', en: 'Mustard', el: 'Μουστάρδα' },
  N: { de: 'Sesam', en: 'Sesame', el: 'Σουσάμι' },
  O: { de: 'Sulfite', en: 'Sulphites', el: 'Θειώδη' },
  P: { de: 'Lupinen', en: 'Lupin', el: 'Λούπινο' },
  R: { de: 'Weichtiere', en: 'Molluscs', el: 'Μαλάκια' },
};
export const ALLERGEN_CODES = Object.keys(ALLERGENS);

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
