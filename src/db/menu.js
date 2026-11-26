// Queries for the public menu. Maps columns to the API shape ({ name: { de, en, el } }).

export const loc = (row, prefix) => ({
  de: row[`${prefix}_de`] ?? null,
  en: row[`${prefix}_en`] ?? null,
  el: row[`${prefix}_el`] ?? null,
});

export const imageUrl = (file) => (file ? `/uploads/${file}` : null);

export function getSettings(db) {
  const row = db.prepare('SELECT * FROM site_settings WHERE id = 1').get();
  return { name: row.restaurant_name, tagline: loc(row, 'tagline') };
}

/**
 * Public menu: visible groups that have at least one item, in sort order.
 * Unavailable items are included (the page shows them greyed out).
 */
export function getPublicMenu(db) {
  const groups = db.prepare(`
    SELECT g.* FROM menu_group g
    WHERE g.is_visible = 1
      AND EXISTS (SELECT 1 FROM menu_item i WHERE i.group_id = g.id)
    ORDER BY g.sort_order, g.id`).all();

  const items = db.prepare(`
    SELECT i.* FROM menu_item i
    JOIN menu_group g ON g.id = i.group_id
    WHERE g.is_visible = 1
    ORDER BY i.group_id, i.sort_order, i.id`).all();

  const options = db.prepare(`
    SELECT o.* FROM item_option o
    JOIN menu_item i ON i.id = o.item_id
    JOIN menu_group g ON g.id = i.group_id
    WHERE g.is_visible = 1
    ORDER BY o.item_id, o.sort_order, o.id`).all();

  const optionsByItem = new Map();
  for (const o of options) {
    if (!optionsByItem.has(o.item_id)) optionsByItem.set(o.item_id, []);
    optionsByItem.get(o.item_id).push({ name: loc(o, 'name'), extraPriceCents: o.extra_price_cents });
  }

  const itemsByGroup = new Map();
  for (const i of items) {
    if (!itemsByGroup.has(i.group_id)) itemsByGroup.set(i.group_id, []);
    itemsByGroup.get(i.group_id).push({
      id: i.id,
      name: loc(i, 'name'),
      description: loc(i, 'desc'),
      priceCents: i.price_cents,
      imageUrl: imageUrl(i.image_file),
      isAvailable: i.is_available === 1,
      options: optionsByItem.get(i.id) ?? [],
    });
  }

  return {
    settings: getSettings(db),
    groups: groups.map((g) => ({
      id: g.id,
      name: loc(g, 'name'),
      items: itemsByGroup.get(g.id) ?? [],
    })),
  };
}
