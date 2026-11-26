// Admin queries: groups, items, options, settings.
// Maps columns to the API shape ({ name: { de, en, el } }); nothing outside db/ sees name_de etc.

import { loc, imageUrl, getSettings } from './menu.js';
import { FieldError } from '../lib/errors.js';

/* ---------- mapping ---------- */

// German is required (and trimmed); en/el are optional, and an empty string is stored as NULL.
const req = (s) => String(s ?? '').trim();
const opt = (s) => {
  const v = String(s ?? '').trim();
  return v === '' ? null : v;
};
const bool = (b) => (b ? 1 : 0);

const toGroup = (g) => ({ id: g.id, name: loc(g, 'name'), isVisible: g.is_visible === 1 });
const toOption = (o) => ({ id: o.id, name: loc(o, 'name'), extraPriceCents: o.extra_price_cents });
const toItem = (i, options) => ({
  id: i.id,
  groupId: i.group_id,
  name: loc(i, 'name'),
  description: loc(i, 'desc'),
  priceCents: i.price_cents,
  imageUrl: imageUrl(i.image_file),
  isAvailable: i.is_available === 1,
  options,
});

/* ---------- menu ---------- */

/** Everything, including hidden groups, empty groups and unavailable items. */
export function getAdminMenu(db) {
  const groups = db.prepare('SELECT * FROM menu_group ORDER BY sort_order, id').all();
  const items = db.prepare('SELECT * FROM menu_item ORDER BY group_id, sort_order, id').all();
  const options = db.prepare('SELECT * FROM item_option ORDER BY item_id, sort_order, id').all();

  const optionsByItem = Map.groupBy(options, (o) => o.item_id);
  const itemsByGroup = Map.groupBy(items, (i) => i.group_id);

  return {
    settings: getSettings(db),
    groups: groups.map((g) => ({
      ...toGroup(g),
      items: (itemsByGroup.get(g.id) ?? []).map((i) => toItem(i, (optionsByItem.get(i.id) ?? []).map(toOption))),
    })),
  };
}

/* ---------- groups ---------- */

export function getGroup(db, id) {
  const row = db.prepare('SELECT * FROM menu_group WHERE id = ?').get(id);
  return row ? toGroup(row) : null;
}

export function createGroup(db, { name, isVisible = true }) {
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO menu_group (name_de, name_en, name_el, is_visible, sort_order)
    VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order) + 1, 0) FROM menu_group))`
  ).run(req(name.de), opt(name.en), opt(name.el), bool(isVisible));
  return getGroup(db, lastInsertRowid);
}

/** Returns the updated group, or null if the id is unknown. */
export function updateGroup(db, id, { name, isVisible }) {
  const { changes } = db.prepare(`
    UPDATE menu_group SET name_de = ?, name_en = ?, name_el = ?, is_visible = ?, updated_at = datetime('now')
    WHERE id = ?`
  ).run(req(name.de), opt(name.en), opt(name.el), bool(isVisible), id);
  return changes ? getGroup(db, id) : null;
}

/**
 * Deletes a group with its items and options (ON DELETE CASCADE).
 * Returns the image files of the deleted items, for the caller to remove, or null if the id is unknown.
 */
export function deleteGroup(db, id) {
  return db.transaction(() => {
    const files = db.prepare('SELECT image_file FROM menu_item WHERE group_id = ? AND image_file IS NOT NULL')
      .pluck().all(id);
    const { changes } = db.prepare('DELETE FROM menu_group WHERE id = ?').run(id);
    return changes ? files : null;
  })();
}

/** Rewrites sort_order as 0..n. `ids` must be exactly the set of all group ids. */
export function reorderGroups(db, ids) {
  db.transaction(() => {
    const existing = db.prepare('SELECT id FROM menu_group').pluck().all();
    assertSameIds(ids, existing);
    const set = db.prepare('UPDATE menu_group SET sort_order = ? WHERE id = ?');
    ids.forEach((id, i) => set.run(i, id));
  })();
}

/* ---------- items ---------- */

export function getItem(db, id) {
  const row = db.prepare('SELECT * FROM menu_item WHERE id = ?').get(id);
  if (!row) return null;
  const options = db.prepare('SELECT * FROM item_option WHERE item_id = ? ORDER BY sort_order, id').all(id);
  return toItem(row, options.map(toOption));
}

function assertGroupExists(db, groupId) {
  if (!db.prepare('SELECT 1 FROM menu_group WHERE id = ?').get(groupId)) {
    throw new FieldError({ groupId: 'Unknown group' });
  }
}

const nextItemSort = (db, groupId) =>
  db.prepare('SELECT COALESCE(MAX(sort_order) + 1, 0) FROM menu_item WHERE group_id = ?').pluck().get(groupId);

/**
 * Replaces an item's options with `options`: sent ones with an id of this item are updated,
 * the rest are inserted, and options not sent are deleted. Order follows the array.
 */
function replaceOptions(db, itemId, options) {
  const existing = new Set(db.prepare('SELECT id FROM item_option WHERE item_id = ?').pluck().all(itemId));
  const keep = new Set();
  const upd = db.prepare(`
    UPDATE item_option SET name_de = ?, name_en = ?, name_el = ?, extra_price_cents = ?, sort_order = ?
    WHERE id = ? AND item_id = ?`);
  const ins = db.prepare(`
    INSERT INTO item_option (item_id, name_de, name_en, name_el, extra_price_cents, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)`);

  options.forEach((o, i) => {
    const vals = [req(o.name.de), opt(o.name.en), opt(o.name.el), o.extraPriceCents ?? 0, i];
    if (o.id != null && existing.has(o.id) && !keep.has(o.id)) {
      upd.run(...vals, o.id, itemId);
      keep.add(o.id);
    } else {
      ins.run(itemId, ...vals); // new option (an unknown or foreign id is treated as new)
    }
  });

  const del = db.prepare('DELETE FROM item_option WHERE id = ?');
  for (const id of existing) if (!keep.has(id)) del.run(id);
}

export function createItem(db, data) {
  return db.transaction(() => {
    assertGroupExists(db, data.groupId);
    const d = data.description ?? {};
    const { lastInsertRowid: id } = db.prepare(`
      INSERT INTO menu_item (group_id, name_de, name_en, name_el, desc_de, desc_en, desc_el,
                             price_cents, is_available, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      data.groupId, req(data.name.de), opt(data.name.en), opt(data.name.el),
      req(d.de), opt(d.en), opt(d.el),
      data.priceCents, bool(data.isAvailable ?? true), nextItemSort(db, data.groupId),
    );
    replaceOptions(db, id, data.options ?? []);
    return getItem(db, id);
  })();
}

/** Updates an item and replaces its options. Returns null if the id is unknown. */
export function updateItem(db, id, data) {
  return db.transaction(() => {
    const current = db.prepare('SELECT group_id, sort_order FROM menu_item WHERE id = ?').get(id);
    if (!current) return null;
    assertGroupExists(db, data.groupId);
    // Moving to another group puts the item at the end of that group.
    const sort = data.groupId === current.group_id ? current.sort_order : nextItemSort(db, data.groupId);
    const d = data.description ?? {};
    db.prepare(`
      UPDATE menu_item SET group_id = ?, name_de = ?, name_en = ?, name_el = ?,
        desc_de = ?, desc_en = ?, desc_el = ?, price_cents = ?, is_available = ?, sort_order = ?,
        updated_at = datetime('now')
      WHERE id = ?`
    ).run(
      data.groupId, req(data.name.de), opt(data.name.en), opt(data.name.el),
      req(d.de), opt(d.en), opt(d.el),
      data.priceCents, bool(data.isAvailable ?? true), sort, id,
    );
    replaceOptions(db, id, data.options ?? []);
    return getItem(db, id);
  })();
}

/**
 * Deletes an item and its options. Returns { imageFile } (possibly null) for the caller
 * to remove, or null if the id is unknown.
 */
export function deleteItem(db, id) {
  return db.transaction(() => {
    const row = db.prepare('SELECT image_file FROM menu_item WHERE id = ?').get(id);
    if (!row) return null;
    db.prepare('DELETE FROM menu_item WHERE id = ?').run(id);
    return { imageFile: row.image_file };
  })();
}

/** Rewrites sort_order as 0..n within a group. Returns false if the group is unknown. */
export function reorderItems(db, groupId, ids) {
  return db.transaction(() => {
    if (!db.prepare('SELECT 1 FROM menu_group WHERE id = ?').get(groupId)) return false;
    const existing = db.prepare('SELECT id FROM menu_item WHERE group_id = ?').pluck().all(groupId);
    assertSameIds(ids, existing);
    const set = db.prepare('UPDATE menu_item SET sort_order = ? WHERE id = ?');
    ids.forEach((id, i) => set.run(i, id));
    return true;
  })();
}

function assertSameIds(sent, existing) {
  const a = new Set(sent);
  const same = a.size === sent.length && a.size === existing.length && existing.every((id) => a.has(id));
  if (!same) throw new FieldError({ ids: 'Must list every id exactly once' });
}

/* ---------- settings ---------- */

export { getSettings };

export function updateSettings(db, { name, tagline = {} }) {
  db.prepare(`
    UPDATE site_settings SET restaurant_name = ?, tagline_de = ?, tagline_en = ?, tagline_el = ? WHERE id = 1`
  ).run(req(name), opt(tagline.de), opt(tagline.en), opt(tagline.el));
  return getSettings(db);
}

/* ---------- item images ---------- */

/**
 * Sets (or with null, clears) an item's image file.
 * Returns { oldFile } for the caller to delete, or null if the item id is unknown.
 */
export function setItemImage(db, id, fileName) {
  return db.transaction(() => {
    const row = db.prepare('SELECT image_file FROM menu_item WHERE id = ?').get(id);
    if (!row) return null;
    db.prepare("UPDATE menu_item SET image_file = ?, updated_at = datetime('now') WHERE id = ?").run(fileName, id);
    return { oldFile: row.image_file };
  })();
}
