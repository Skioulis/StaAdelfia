import { loadConfig } from '../src/config.js';
import { openDb } from '../src/db/index.js';
import { buildApp } from '../src/app.js';

/** Builds the app on a fresh in-memory database. Close with `await app.close()`. */
export function buildTestApp(env = {}) {
  const config = loadConfig({ NODE_ENV: 'test', DATA_DIR: '/nonexistent', ...env });
  const db = openDb(':memory:');
  const app = buildApp(config, { db, logger: false });
  app.addHook('onClose', () => db.close());
  return { app, db, config };
}

export function insertGroup(db, { de, en = null, el = null, sort = 0, visible = true }) {
  return Number(db.prepare(
    'INSERT INTO menu_group (name_de, name_en, name_el, sort_order, is_visible) VALUES (?, ?, ?, ?, ?)'
  ).run(de, en, el, sort, visible ? 1 : 0).lastInsertRowid);
}

export function insertItem(db, groupId, { de, en = null, el = null, price = 1000, sort = 0, available = true, image = null }) {
  return Number(db.prepare(`
    INSERT INTO menu_item (group_id, name_de, name_en, name_el, price_cents, sort_order, is_available, image_file)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(groupId, de, en, el, price, sort, available ? 1 : 0, image).lastInsertRowid);
}

export function insertOption(db, itemId, { de, extra = 0, sort = 0 }) {
  return Number(db.prepare(
    'INSERT INTO item_option (item_id, name_de, extra_price_cents, sort_order) VALUES (?, ?, ?, ?)'
  ).run(itemId, de, extra, sort).lastInsertRowid);
}

/** A Cookie header value for a fresh admin session. */
export async function adminCookie(db) {
  const { createSession } = await import('../src/db/sessions.js');
  return `gsa_admin=${createSession(db)}`;
}
