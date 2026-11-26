import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export function openDb(file) {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

// Numbered .sql files, applied in order, tracked with PRAGMA user_version.
export function migrate(db) {
  const files = fs.readdirSync(migrationsDir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
  const current = db.pragma('user_version', { simple: true });
  for (const f of files) {
    const version = parseInt(f, 10);
    if (version <= current) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${version}`);
    })();
  }
}
