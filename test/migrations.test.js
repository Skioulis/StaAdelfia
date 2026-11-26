import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { migrate } from '../src/db/index.js';

const migrations = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'db', 'migrations');

test('a database created before 002 is upgraded in place and keeps its data', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  // Simulate a database from before the allergen migration: only 001 applied.
  db.exec(fs.readFileSync(path.join(migrations, '001_init.sql'), 'utf8'));
  db.pragma('user_version = 1');
  db.prepare("INSERT INTO menu_group (name_de) VALUES ('Burger')").run();
  db.prepare("INSERT INTO menu_item (group_id, name_de, price_cents) VALUES (1, 'Veggie', 1250)").run();

  migrate(db);

  assert.equal(db.pragma('user_version', { simple: true }), 2);
  assert.deepEqual(db.prepare('SELECT name_de, price_cents, allergens FROM menu_item').get(),
    { name_de: 'Veggie', price_cents: 1250, allergens: '' });

  migrate(db); // running again changes nothing
  assert.equal(db.pragma('user_version', { simple: true }), 2);
  db.close();
});
