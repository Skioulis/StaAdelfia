import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.js';
import { openDb } from './db/index.js';
import { seedSampleData } from './db/seed.js';
import { deleteExpiredSessions } from './db/sessions.js';
import { buildApp } from './app.js';
import { removeTempFiles } from './lib/images.js';

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

let db;
try {
  fs.mkdirSync(path.join(config.dataDir, 'uploads'), { recursive: true });
  fs.accessSync(config.dataDir, fs.constants.W_OK);
  db = openDb(path.join(config.dataDir, 'menu.db'));
} catch (err) {
  console.error(`Cannot use DATA_DIR ${config.dataDir}: ${err.message}`);
  if (err.code === 'EACCES' || err.code === 'EPERM' || err.code === 'SQLITE_CANTOPEN' || err.code === 'SQLITE_READONLY') {
    console.error(`The folder must be writable by this user (uid ${process.getuid?.()}).` +
      ' With Docker: mkdir -p data && sudo chown 1000:1000 data');
  }
  process.exit(1);
}
const app = buildApp(config, { db });

deleteExpiredSessions(db);
await removeTempFiles(config.dataDir);
if (!config.adminPasswordHash) {
  app.log.warn('ADMIN_PASSWORD_HASH is not set: admin login is disabled (run: npm run hash-password)');
}

if (config.seedSampleData && !config.production && seedSampleData(db)) {
  app.log.info('Seeded sample menu data');
}

// Graceful shutdown (docker stop sends SIGTERM): stop accepting requests and let running ones
// finish, then close the database (which also checkpoints the WAL). Force-exit after 10 s.
const SHUTDOWN_TIMEOUT_MS = 10_000;
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'Shutting down');
  const force = setTimeout(() => {
    app.log.error('Shutdown took too long, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  force.unref();
  try {
    await app.close();
    db.close();
    app.log.info('Shutdown complete');
    process.exit(0);
  } catch (err) {
    app.log.error(err, 'Error during shutdown');
    process.exit(1);
  }
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err, 'Could not start the server');
  db.close();
  process.exit(1);
}
