// Sample menu from the prototype's sampleData(). Development only:
// runs when SEED_SAMPLE_DATA=true and the database has no groups yet.
// The prototype's inline SVG images are not ported; image_file stays NULL.
// Allergen codes (A–R) are plausible examples for the sample dishes, not checked recipes.

const SAMPLE = {
  tagline: {
    de: 'Meeresfrüchte, Grill & gute Gesellschaft',
    en: 'Seafood, grill & good company',
    el: 'Θαλασσινά, ψητά και καλή παρέα',
  },
  groups: [
    {
      name: { de: 'Meeresfrüchte', en: 'Seafood', el: 'Θαλασσινά' },
      items: [
        {
          priceCents: 1650, available: true,
          allergens: 'R', name: { de: 'Gegrillter Oktopus', en: 'Grilled octopus', el: 'Χταπόδι σχάρας' },
          desc: {
            de: 'Oktopus vom Holzkohlegrill mit Olivenöl, Zitrone und Oregano.',
            en: 'Charcoal-grilled octopus with olive oil, lemon and oregano.',
            el: 'Χταπόδι στα κάρβουνα με ελαιόλαδο, λεμόνι και ρίγανη.',
          },
          options: [],
        },
        {
          priceCents: 1400, available: true,
          allergens: 'ACR', name: { de: 'Frittierte Calamari', en: 'Fried calamari', el: 'Καλαμαράκια τηγανητά' },
          desc: {
            de: 'Knusprige Tintenfischringe mit Knoblauch-Dip.',
            en: 'Crispy squid rings with garlic dip.',
            el: 'Τραγανά καλαμαράκια με σκορδαλιά.',
          },
          options: [
            { name: { de: 'Kleine Portion', en: 'Small portion', el: 'Μικρή μερίδα' }, extraPriceCents: 0 },
            { name: { de: 'Große Portion', en: 'Large portion', el: 'Μεγάλη μερίδα' }, extraPriceCents: 400 },
          ],
        },
        {
          priceCents: 2400, available: false,
          allergens: 'D', name: { de: 'Doradenfilet', en: 'Sea bream fillet', el: 'Φιλέτο τσιπούρας' },
          desc: {
            de: 'In der Pfanne gebraten, mit saisonalem Gemüse.',
            en: 'Pan-seared with seasonal greens.',
            el: 'Στο τηγάνι, με λαχανικά εποχής.',
          },
          options: [],
        },
      ],
    },
    {
      name: { de: 'Burger', en: 'Burgers', el: 'Μπέργκερ' },
      items: [
        {
          priceCents: 1390, available: true,
          allergens: 'ACGMN', name: { de: 'Klassischer Rindfleischburger', en: 'Classic beef burger', el: 'Κλασικό μπέργκερ μοσχάρι' },
          desc: {
            de: '180 g Rindfleisch, Cheddar, Paradeiser, Salat, Haussauce.',
            en: '180 g beef patty, cheddar, tomato, lettuce, house sauce.',
            el: '180 γρ. μοσχάρι, τσένταρ, ντομάτα, μαρούλι, σάλτσα του μαγαζιού.',
          },
          options: [
            { name: { de: 'Doppeltes Patty', en: 'Double patty', el: 'Διπλό μπιφτέκι' }, extraPriceCents: 450 },
            { name: { de: 'Mit Speck', en: 'Add bacon', el: 'Με μπέικον' }, extraPriceCents: 150 },
            { name: { de: 'Glutenfreies Brötchen', en: 'Gluten-free bun', el: 'Ψωμάκι χωρίς γλουτένη' }, extraPriceCents: 100 },
          ],
        },
        {
          priceCents: 1250, available: true,
          allergens: 'AGN', name: { de: 'Veggie-Burger', en: 'Veggie burger', el: 'Χορτοφαγικό μπέργκερ' },
          desc: {
            de: 'Kichererbsen-Laibchen, Feta, geröstete Paprika, Rucola.',
            en: 'Chickpea patty, feta, roasted peppers, rocket.',
            el: 'Μπιφτέκι ρεβιθιού, φέτα, ψητές πιπεριές, ρόκα.',
          },
          options: [],
        },
      ],
    },
    {
      name: { de: 'Beilagen', en: 'Side dishes', el: 'Συνοδευτικά' },
      items: [
        {
          priceCents: 450, available: true,
          allergens: '', name: { de: 'Pommes', en: 'Fries', el: 'Πατάτες τηγανητές' },
          desc: {
            de: 'Handgeschnitten, mit Meersalz.',
            en: 'Hand-cut, sea salt.',
            el: 'Κομμένες στο χέρι, με θαλασσινό αλάτι.',
          },
          options: [
            { name: { de: 'Stattdessen Süßkartoffel', en: 'Sweet potato instead', el: 'Με γλυκοπατάτα' }, extraPriceCents: 150 },
          ],
        },
        {
          priceCents: 500, available: true,
          allergens: 'MO', name: { de: 'Erdäpfelsalat', en: 'Potato salad', el: 'Πατατοσαλάτα' },
          desc: {
            de: 'Nach Wiener Art, mit Schnittlauch und Essig-Marinade.',
            en: 'Austrian-style, with chives and vinegar dressing.',
            el: 'Αυστριακή συνταγή, με σχοινόπρασο και ξίδι.',
          },
          options: [],
        },
      ],
    },
  ],
};

/** Seeds the sample menu if the database has no groups. Returns true if it seeded. */
export function seedSampleData(db) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM menu_group').get();
  if (n > 0) return false;

  const insGroup = db.prepare(
    'INSERT INTO menu_group (name_de, name_en, name_el, sort_order) VALUES (?, ?, ?, ?)'
  );
  const insItem = db.prepare(`
    INSERT INTO menu_item (group_id, name_de, name_en, name_el, desc_de, desc_en, desc_el,
                           price_cents, is_available, allergens, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insOption = db.prepare(`
    INSERT INTO item_option (item_id, name_de, name_en, name_el, extra_price_cents, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)`);
  const setTagline = db.prepare(
    'UPDATE site_settings SET tagline_de = ?, tagline_en = ?, tagline_el = ? WHERE id = 1'
  );

  db.transaction(() => {
    setTagline.run(SAMPLE.tagline.de, SAMPLE.tagline.en, SAMPLE.tagline.el);
    SAMPLE.groups.forEach((g, gi) => {
      const groupId = insGroup.run(g.name.de, g.name.en, g.name.el, gi).lastInsertRowid;
      g.items.forEach((it, ii) => {
        const itemId = insItem.run(
          groupId, it.name.de, it.name.en, it.name.el, it.desc.de, it.desc.en, it.desc.el,
          it.priceCents, it.available ? 1 : 0, it.allergens ?? '', ii
        ).lastInsertRowid;
        it.options.forEach((o, oi) => {
          insOption.run(itemId, o.name.de, o.name.en, o.name.el, o.extraPriceCents, oi);
        });
      });
    });
  })();
  return true;
}
