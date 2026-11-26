// The 14 EU allergens (Regulation 1169/2011) with the letter codes used on Austrian menus
// (Allergeninformationsverordnung). Names per language live in public/js/i18n.js (ALLERGENS).
// Stored on an item as a string of codes in this order, e.g. "ACG".

export const ALLERGEN_CODES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'L', 'M', 'N', 'O', 'P', 'R'];

/** ['G', 'A', 'C'] → "ACG" (canonical order, no duplicates, unknown codes dropped). */
export const toAllergenString = (codes = []) => ALLERGEN_CODES.filter((c) => codes.includes(c)).join('');

/** "ACG" → ['A', 'C', 'G'] */
export const fromAllergenString = (s) => ALLERGEN_CODES.filter((c) => (s || '').includes(c));
