-- Allergen letter codes per item (A–R, see src/lib/allergens.js), e.g. 'ACG'. Empty = none declared.
ALTER TABLE menu_item ADD COLUMN allergens TEXT NOT NULL DEFAULT '';
