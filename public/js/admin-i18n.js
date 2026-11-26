// Admin UI texts in German, English and Greek, plus translation of the API's (English) error messages.
// The admin language is separate from the guest menu's language (stored under its own key).

import { LANGS, DEFAULT_LANG, localeOf } from './i18n.js';

const STORAGE_KEY = 'admin-lang';

const T = {
  de: {
    title: 'Speisekarten-Verwaltung',
    loading: 'Wird geladen…',
    language: 'Sprache',
    username: 'Benutzername',
    password: 'Passwort',
    login: 'Anmelden',
    logout: 'Abmelden',
    viewMenu: 'Speisekarte ↗',
    tabItems: 'Artikel',
    tabGroups: 'Kategorien',
    tabSettings: 'Lokal',
    filterGroup: 'Nach Kategorie filtern',
    allGroups: 'Alle Kategorien',
    addItem: '+ Neuer Artikel',
    addGroup: '+ Neue Kategorie',
    groupsHint: 'Die Kategorien erscheinen in dieser Reihenfolge auf der Speisekarte.',
    restaurantName: 'Name des Lokals',
    tagline: 'Untertitel',
    save: 'Speichern',
    cancel: 'Abbrechen',
    delete: 'Löschen',
    edit: 'Ändern',
    moveUp: 'Nach oben',
    moveDown: 'Nach unten',
    hidden: 'Ausgeblendet',
    notAvailable: 'Nicht verfügbar',
    noName: '(ohne Namen)',
    emptyItems: 'Noch keine Artikel. Tippen Sie auf „+ Neuer Artikel“.',
    emptyGroups: 'Noch keine Kategorien. Tippen Sie auf „+ Neue Kategorie“.',
    addGroupFirst: 'Bitte zuerst eine Kategorie anlegen.',
    addGroupFirstLong: 'Legen Sie zuerst eine Kategorie an (Reiter „Kategorien“), dann die Artikel.',
    nOptions: { one: '{n} Option', other: '{n} Optionen' },
    nItems: { one: '{n} Artikel', other: '{n} Artikel' },
    areYouSure: 'Sind Sie sicher?',
    confirmDelete: '„{name}“ wird gelöscht.',
    confirmDeleteGroupItems: '„{name}“ wird gelöscht – ebenso die {n} Artikel darin samt Fotos.',
    groupDeleted: 'Kategorie gelöscht',
    groupSaved: 'Kategorie gespeichert',
    editGroup: 'Kategorie bearbeiten',
    newGroup: 'Neue Kategorie',
    name: 'Name',
    showOnMenu: 'Auf der Speisekarte zeigen',
    editItem: 'Artikel bearbeiten',
    newItem: 'Neuer Artikel',
    group: 'Kategorie',
    hiddenSuffix: '(ausgeblendet)',
    description: 'Beschreibung',
    price: 'Preis (€)',
    available: 'Verfügbar',
    image: 'Foto',
    chooseImage: 'Foto wählen',
    removeImage: 'Foto entfernen',
    uploading: 'Wird hochgeladen…',
    preparing: 'Wird vorbereitet…',
    options: 'Optionen',
    optionsHint: '– Größen, Extras, Auswahl (max. 20)',
    optionN: 'Option {n}',
    removeOption: 'Option entfernen',
    extraPrice: 'Aufpreis in € (0 = inklusive)',
    addOption: '+ Option hinzufügen',
    maxOptions: 'Höchstens 20 Optionen',
    notAnImage: 'Diese Datei konnte nicht als Bild gelesen werden.',
    imageSaved: 'Foto gespeichert',
    imageRemoved: 'Foto entfernt',
    itemDeleted: 'Artikel gelöscht',
    itemSaved: 'Artikel gespeichert',
    itemSavedImageFailed: 'Artikel gespeichert, aber das Foto konnte nicht hochgeladen werden: {msg}',
    enterPrice: 'Preis eingeben, z. B. 12,50',
    enterAmount: 'Betrag eingeben, z. B. 1,50',
    maxAmount: 'Höchstens {amount}',
    minAmount: 'Mindestens {amount}',
    saved: 'Gespeichert',
    required: 'Pflichtfeld',
    wrongLogin: 'Benutzername oder Passwort falsch.',
    noConnection: 'Keine Verbindung zum Server. Bitte die Internetverbindung prüfen und erneut versuchen.',
    sessionExpired: 'Ihre Sitzung ist abgelaufen. Bitte erneut anmelden.',
    tooMany: 'Zu viele Versuche. Bitte eine Minute warten und erneut versuchen.',
    requestFailed: 'Anfrage fehlgeschlagen ({status})',
    serverError: 'Fehler am Server. Bitte erneut versuchen.',
    checkFields: 'Bitte die markierten Felder prüfen.',
    maxChars: 'Höchstens {n} Zeichen',
    minChars: 'Mindestens {n} Zeichen',
    maxValue: 'Höchstens {n}',
    minValue: 'Mindestens {n}',
    maxEntries: 'Höchstens {n} Einträge',
    invalidValue: 'Ungültiger Wert',
    unknownGroup: 'Diese Kategorie gibt es nicht mehr. Bitte die Seite neu laden.',
    listChanged: 'Die Liste wurde inzwischen geändert. Bitte die Seite neu laden.',
    imageType: 'Nur JPEG-, PNG- oder WebP-Bilder',
    imageTooBig: 'Höchstens {n} MB',
    allergens: 'Allergene',
    allergensHint: '– erscheinen als Buchstaben A–R auf der Speisekarte',
    duplicateEntries: 'Doppelte Einträge',
    notFound: 'Dieser Eintrag existiert nicht mehr. Bitte die Seite neu laden.',
  },

  en: {
    title: 'Menu admin',
    loading: 'Loading…',
    language: 'Language',
    username: 'Username',
    password: 'Password',
    login: 'Log in',
    logout: 'Log out',
    viewMenu: 'Menu ↗',
    tabItems: 'Items',
    tabGroups: 'Groups',
    tabSettings: 'Restaurant',
    filterGroup: 'Filter by group',
    allGroups: 'All groups',
    addItem: '+ Add item',
    addGroup: '+ Add group',
    groupsHint: 'Groups appear on the menu in this order.',
    restaurantName: 'Restaurant name',
    tagline: 'Tagline',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    moveUp: 'Move up',
    moveDown: 'Move down',
    hidden: 'Hidden',
    notAvailable: 'Not available',
    noName: '(no name)',
    emptyItems: 'No items yet. Tap “+ Add item”.',
    emptyGroups: 'No groups yet. Tap “+ Add group”.',
    addGroupFirst: 'Add a group first.',
    addGroupFirstLong: 'Add a group first (Groups tab), then add items to it.',
    nOptions: { one: '{n} option', other: '{n} options' },
    nItems: { one: '{n} item', other: '{n} items' },
    areYouSure: 'Are you sure?',
    confirmDelete: '“{name}” will be deleted.',
    confirmDeleteGroupItems: '“{name}” will be deleted, together with its {n} items and their photos.',
    groupDeleted: 'Group deleted',
    groupSaved: 'Group saved',
    editGroup: 'Edit group',
    newGroup: 'New group',
    name: 'Name',
    showOnMenu: 'Show on menu',
    editItem: 'Edit item',
    newItem: 'New item',
    group: 'Group',
    hiddenSuffix: '(hidden)',
    description: 'Description',
    price: 'Price (€)',
    available: 'Available',
    image: 'Photo',
    chooseImage: 'Choose photo',
    removeImage: 'Remove photo',
    uploading: 'Uploading…',
    preparing: 'Preparing…',
    options: 'Options',
    optionsHint: '— sizes, extras, choices (max. 20)',
    optionN: 'Option {n}',
    removeOption: 'Remove option',
    extraPrice: 'Extra price in € (0 = included)',
    addOption: '+ Add option',
    maxOptions: 'At most 20 options',
    notAnImage: 'That file could not be read as an image.',
    imageSaved: 'Photo saved',
    imageRemoved: 'Photo removed',
    itemDeleted: 'Item deleted',
    itemSaved: 'Item saved',
    itemSavedImageFailed: 'Item saved, but the photo upload failed: {msg}',
    enterPrice: 'Enter a price, e.g. 12.50',
    enterAmount: 'Enter an amount, e.g. 1.50',
    maxAmount: 'At most {amount}',
    minAmount: 'At least {amount}',
    saved: 'Saved',
    required: 'Required',
    wrongLogin: 'Wrong username or password.',
    noConnection: 'No connection to the server. Check the internet connection and try again.',
    sessionExpired: 'Your session has expired. Please log in again.',
    tooMany: 'Too many attempts. Please wait a minute and try again.',
    requestFailed: 'Request failed ({status})',
    serverError: 'Something went wrong on the server. Please try again.',
    checkFields: 'Please check the marked fields.',
    maxChars: 'At most {n} characters',
    minChars: 'At least {n} characters',
    maxValue: 'At most {n}',
    minValue: 'At least {n}',
    maxEntries: 'At most {n} entries',
    invalidValue: 'Invalid value',
    unknownGroup: 'This group no longer exists. Please reload the page.',
    listChanged: 'The list was changed in the meantime. Please reload the page.',
    imageType: 'Only JPEG, PNG or WebP images',
    imageTooBig: 'At most {n} MB',
    allergens: 'Allergens',
    allergensHint: '— shown as letters A–R on the menu',
    duplicateEntries: 'Duplicate entries',
    notFound: 'This entry no longer exists. Please reload the page.',
  },

  el: {
    title: 'Διαχείριση μενού',
    loading: 'Φόρτωση…',
    language: 'Γλώσσα',
    username: 'Όνομα χρήστη',
    password: 'Κωδικός',
    login: 'Σύνδεση',
    logout: 'Έξοδος',
    viewMenu: 'Μενού ↗',
    tabItems: 'Είδη',
    tabGroups: 'Κατηγορίες',
    tabSettings: 'Κατάστημα',
    filterGroup: 'Φίλτρο κατηγορίας',
    allGroups: 'Όλες οι κατηγορίες',
    addItem: '+ Νέο είδος',
    addGroup: '+ Νέα κατηγορία',
    groupsHint: 'Οι κατηγορίες εμφανίζονται στο μενού με αυτή τη σειρά.',
    restaurantName: 'Όνομα καταστήματος',
    tagline: 'Υπότιτλος',
    save: 'Αποθήκευση',
    cancel: 'Άκυρο',
    delete: 'Διαγραφή',
    edit: 'Αλλαγή',
    moveUp: 'Μετακίνηση πάνω',
    moveDown: 'Μετακίνηση κάτω',
    hidden: 'Κρυφή',
    notAvailable: 'Μη διαθέσιμο',
    noName: '(χωρίς όνομα)',
    emptyItems: 'Δεν υπάρχουν ακόμη είδη. Πατήστε «+ Νέο είδος».',
    emptyGroups: 'Δεν υπάρχουν ακόμη κατηγορίες. Πατήστε «+ Νέα κατηγορία».',
    addGroupFirst: 'Προσθέστε πρώτα μια κατηγορία.',
    addGroupFirstLong: 'Προσθέστε πρώτα μια κατηγορία (καρτέλα «Κατηγορίες») και μετά τα είδη.',
    nOptions: { one: '{n} επιλογή', other: '{n} επιλογές' },
    nItems: { one: '{n} είδος', other: '{n} είδη' },
    areYouSure: 'Είστε σίγουροι;',
    confirmDelete: '«{name}» θα διαγραφεί.',
    confirmDeleteGroupItems: '«{name}» θα διαγραφεί, μαζί με όλα τα είδη της ({n}) και τις φωτογραφίες τους.',
    groupDeleted: 'Η κατηγορία διαγράφηκε',
    groupSaved: 'Η κατηγορία αποθηκεύτηκε',
    editGroup: 'Επεξεργασία κατηγορίας',
    newGroup: 'Νέα κατηγορία',
    name: 'Όνομα',
    showOnMenu: 'Εμφάνιση στο μενού',
    editItem: 'Επεξεργασία είδους',
    newItem: 'Νέο είδος',
    group: 'Κατηγορία',
    hiddenSuffix: '(κρυφή)',
    description: 'Περιγραφή',
    price: 'Τιμή (€)',
    available: 'Διαθέσιμο',
    image: 'Φωτογραφία',
    chooseImage: 'Επιλογή φωτογραφίας',
    removeImage: 'Αφαίρεση φωτογραφίας',
    uploading: 'Ανέβασμα…',
    preparing: 'Προετοιμασία…',
    options: 'Επιλογές',
    optionsHint: '— μεγέθη, έξτρα, επιλογές (έως 20)',
    optionN: 'Επιλογή {n}',
    removeOption: 'Αφαίρεση επιλογής',
    extraPrice: 'Επιπλέον τιμή σε € (0 = περιλαμβάνεται)',
    addOption: '+ Προσθήκη επιλογής',
    maxOptions: 'Έως 20 επιλογές',
    notAnImage: 'Το αρχείο δεν μπορεί να διαβαστεί ως εικόνα.',
    imageSaved: 'Η φωτογραφία αποθηκεύτηκε',
    imageRemoved: 'Η φωτογραφία αφαιρέθηκε',
    itemDeleted: 'Το είδος διαγράφηκε',
    itemSaved: 'Το είδος αποθηκεύτηκε',
    itemSavedImageFailed: 'Το είδος αποθηκεύτηκε, αλλά η φωτογραφία δεν ανέβηκε: {msg}',
    enterPrice: 'Εισαγάγετε τιμή, π.χ. 12,50',
    enterAmount: 'Εισαγάγετε ποσό, π.χ. 1,50',
    maxAmount: 'Έως {amount}',
    minAmount: 'Τουλάχιστον {amount}',
    saved: 'Αποθηκεύτηκε',
    required: 'Υποχρεωτικό',
    wrongLogin: 'Λάθος όνομα χρήστη ή κωδικός.',
    noConnection: 'Δεν υπάρχει σύνδεση με τον διακομιστή. Ελέγξτε τη σύνδεση στο διαδίκτυο και δοκιμάστε ξανά.',
    sessionExpired: 'Η σύνδεσή σας έληξε. Συνδεθείτε ξανά.',
    tooMany: 'Πάρα πολλές προσπάθειες. Περιμένετε ένα λεπτό και δοκιμάστε ξανά.',
    requestFailed: 'Το αίτημα απέτυχε ({status})',
    serverError: 'Σφάλμα στον διακομιστή. Δοκιμάστε ξανά.',
    checkFields: 'Ελέγξτε τα επισημασμένα πεδία.',
    maxChars: 'Έως {n} χαρακτήρες',
    minChars: 'Τουλάχιστον {n} χαρακτήρες',
    maxValue: 'Έως {n}',
    minValue: 'Τουλάχιστον {n}',
    maxEntries: 'Έως {n} καταχωρίσεις',
    invalidValue: 'Μη έγκυρη τιμή',
    unknownGroup: 'Η κατηγορία δεν υπάρχει πλέον. Ανανεώστε τη σελίδα.',
    listChanged: 'Η λίστα άλλαξε στο μεταξύ. Ανανεώστε τη σελίδα.',
    imageType: 'Μόνο εικόνες JPEG, PNG ή WebP',
    imageTooBig: 'Έως {n} MB',
    allergens: 'Αλλεργιογόνα',
    allergensHint: '— εμφανίζονται ως γράμματα A–R στο μενού',
    duplicateEntries: 'Διπλές καταχωρίσεις',
    notFound: 'Η καταχώριση δεν υπάρχει πλέον. Ανανεώστε τη σελίδα.',
  },
};

const isLang = (code) => LANGS.some((l) => l.code === code);

/** Admin language: ?lang= in the URL, saved choice, browser language, then German. */
function initialLang() {
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

let lang = initialLang();

export const getLang = () => lang;
export const locale = () => localeOf(lang);

export function setLang(code) {
  if (!isLang(code)) return;
  lang = code;
  try { localStorage.setItem(STORAGE_KEY, code); } catch {}
}

const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));

/** Translated text. Falls back to English, then to the key itself. */
export function t(key, vars = {}) {
  const s = T[lang]?.[key] ?? T.en[key] ?? key;
  return fill(s, vars);
}

/** "3 options" / "3 Optionen" / "3 επιλογές" with the language's plural rules. */
export function tn(key, n) {
  const forms = T[lang]?.[key] ?? T.en[key];
  const rule = new Intl.PluralRules(locale()).select(n);
  return fill(forms[rule] ?? forms.other, { n });
}

/**
 * Translates an error message from the API (always English) into the admin language.
 * `formatCents` turns a cents amount into a localized price, for fields named "...Cents".
 */
export function serverMessage(msg, key = '', formatCents = (c) => String(c)) {
  const m = String(msg ?? '');
  let r;
  if (/Cents$/.test(key) && (r = m.match(/at (most|least) (\d+)/i))) {
    return t(r[1].toLowerCase() === 'most' ? 'maxAmount' : 'minAmount', { amount: formatCents(Number(r[2])) });
  }
  if (m === 'Required') return t('required');
  if ((r = m.match(/^At most (\d+) characters$/))) return t('maxChars', { n: r[1] });
  if ((r = m.match(/^At least (\d+) characters$/))) return t('minChars', { n: r[1] });
  if ((r = m.match(/^Must be at most (\d+)$/))) return t('maxValue', { n: r[1] });
  if ((r = m.match(/^Must be at least (\d+)$/))) return t('minValue', { n: r[1] });
  if ((r = m.match(/^At most (\d+) entries$/))) return t('maxEntries', { n: r[1] });
  if ((r = m.match(/^At most (\d+) MB$/))) return t('imageTooBig', { n: r[1] });
  if (/^Must be (integer|number|boolean|string|object|array)/.test(m) || m === 'Invalid value') return t('invalidValue');
  if (m === 'Duplicate entries') return t('duplicateEntries');
  if (m === 'Unknown group') return t('unknownGroup');
  if (m === 'Must list every id exactly once') return t('listChanged');
  if (m === 'Must be a JPEG, PNG or WebP image') return t('imageType');
  if (/not found$/i.test(m)) return t('notFound');
  if (m === 'Validation failed') return t('checkFields');
  if (m === 'Internal Server Error') return t('serverError');
  return m;
}
