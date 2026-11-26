import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildTestApp } from './helpers.js';
import { SESSION_CLEANUP_MS } from '../src/app.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const csp = (res) => Object.fromEntries(
  res.headers['content-security-policy'].split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]),
);

/* ---------- security headers ---------- */

test('every response carries the CSP and security headers', async (t) => {
  const { app } = buildTestApp();
  t.after(() => app.close());

  for (const url of ['/', '/admin/', '/api/menu', '/healthz', '/api/auth/me', '/nope']) {
    const res = await app.inject({ method: 'GET', url });
    assert.ok(res.headers['content-security-policy'], `CSP on ${url}`);
    assert.equal(res.headers['x-content-type-options'], 'nosniff', url);
    assert.equal(res.headers['x-frame-options'], 'SAMEORIGIN', url);
    assert.equal(res.headers['referrer-policy'], 'strict-origin-when-cross-origin', url);
  }

  const d = csp(await app.inject({ method: 'GET', url: '/' }));
  assert.deepEqual(d['default-src'], ["'self'"]);
  assert.deepEqual(d['script-src'], ["'self'"], 'no inline or remote scripts');
  assert.deepEqual(d['style-src-elem'], ["'self'", 'https://fonts.googleapis.com']);
  assert.deepEqual(d['style-src-attr'], ["'unsafe-inline'"]);
  assert.deepEqual(d['font-src'], ["'self'", 'https://fonts.gstatic.com']);
  assert.deepEqual(d['img-src'], ["'self'", 'data:', 'blob:']);
  assert.deepEqual(d['connect-src'], ["'self'"]);
  assert.deepEqual(d['object-src'], ["'none'"]);
  assert.deepEqual(d['frame-ancestors'], ["'none'"]);
  assert.ok(!('upgrade-insecure-requests' in d), 'not in development (plain http)');
});

test('production adds upgrade-insecure-requests', async (t) => {
  const { app } = buildTestApp({ NODE_ENV: 'production', ADMIN_PASSWORD_HASH: 'scrypt$16384$8$1$c2FsdHNhbHRzYWx0$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaA==' });
  t.after(() => app.close());
  const d = csp(await app.inject({ method: 'GET', url: '/' }));
  assert.ok('upgrade-insecure-requests' in d);
});

test('auth and admin responses are never cached; healthz is not either', async (t) => {
  const { app } = buildTestApp();
  t.after(() => app.close());
  for (const [method, url] of [['GET', '/api/auth/me'], ['POST', '/api/auth/logout'], ['GET', '/api/admin/menu'], ['GET', '/healthz']]) {
    const res = await app.inject({ method, url });
    assert.equal(res.headers['cache-control'], 'no-store', `${method} ${url}`);
  }
});

/* ---------- errors ---------- */

test('a 500 hides the error details from the client', async (t) => {
  const { app } = buildTestApp({ NODE_ENV: 'production', ADMIN_PASSWORD_HASH: 'scrypt$16384$8$1$c2FsdHNhbHRzYWx0$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaA==' });
  t.after(() => app.close());
  app.get('/boom', async () => {
    throw new Error('SQLITE_CORRUPT at /data/menu.db');
  });

  const res = await app.inject({ method: 'GET', url: '/boom' });
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.json(), { error: 'Internal Server Error' });
  assert.doesNotMatch(res.body, /SQLITE|menu\.db|at .*\.js/);
});

test('unknown routes return a JSON 404; bad JSON returns 400 without internals', async (t) => {
  const { app, db } = buildTestApp();
  t.after(() => app.close());

  for (const url of ['/nope', '/api/nope', '/css/nope.css']) {
    const res = await app.inject({ method: 'GET', url });
    assert.equal(res.statusCode, 404, url);
    assert.deepEqual(res.json(), { error: 'Not found' }, url);
  }

  const { createSession } = await import('../src/db/sessions.js');
  const res = await app.inject({
    method: 'POST', url: '/api/admin/groups', payload: '{"name": ',
    headers: { 'content-type': 'application/json', cookie: `gsa_admin=${createSession(db)}` },
  });
  assert.equal(res.statusCode, 400);
  assert.doesNotMatch(res.body, /node_modules|at .*\.js/);
});

/* ---------- session cleanup timer ---------- */

test('expired sessions are deleted once an hour, and the timer stops on close', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { app, db } = buildTestApp();
  await app.ready();

  const now = Date.now();
  db.prepare('INSERT INTO session (id, expires_at) VALUES (?, ?), (?, ?)').run('old', now - 1, 'live', now + 3_600_000);

  t.mock.timers.tick(SESSION_CLEANUP_MS - 1);
  assert.equal(db.prepare('SELECT COUNT(*) FROM session').pluck().get(), 2, 'not before an hour');
  t.mock.timers.tick(1);
  assert.deepEqual(db.prepare('SELECT id FROM session').pluck().all(), ['live']);

  await app.close(); // clears the interval; ticking further must not touch the closed db
  t.mock.timers.tick(SESSION_CLEANUP_MS * 3);
});

/* ---------- the real server process ---------- */

function startServer(env) {
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: root,
    env: { PATH: process.env.PATH, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (out += d));
  const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  return { child, exited, output: () => out };
}

async function waitForHealth(port, tries = 100) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('server did not start');
}

test('SIGTERM closes the server, then the database, and exits 0', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsa-proc-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const port = 20000 + Math.floor(Math.random() * 20000);

  const srv = startServer({ NODE_ENV: 'development', PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir, SEED_SAMPLE_DATA: 'true' });
  t.after(() => srv.child.kill('SIGKILL'));
  await waitForHealth(port);

  const menu = await (await fetch(`http://127.0.0.1:${port}/api/menu`)).json();
  assert.equal(menu.groups.length, 3, 'seeded and serving');
  assert.ok(fs.existsSync(path.join(dataDir, 'menu.db-wal')), 'WAL file exists while running');

  srv.child.kill('SIGTERM');
  const code = await srv.exited;
  assert.equal(code, 0, srv.output());
  assert.match(srv.output(), /Shutting down/);
  assert.match(srv.output(), /Shutdown complete/);
  assert.equal(fs.existsSync(path.join(dataDir, 'menu.db-wal')), false, 'db closed cleanly (WAL checkpointed and removed)');
});

test('a missing setting stops startup with a clear message', async () => {
  const srv = startServer({ NODE_ENV: 'production', DATA_DIR: os.tmpdir() });
  const code = await srv.exited;
  assert.equal(code, 1);
  assert.match(srv.output(), /ADMIN_PASSWORD_HASH is required in production/);
});
