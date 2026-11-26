import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { buildTestApp } from './helpers.js';
import { hashPassword, verifyPassword, isValidHash } from '../src/lib/password.js';
import { SESSION_TTL_MS, deleteExpiredSessions } from '../src/db/sessions.js';
import { loadConfig } from '../src/config.js';

const USER = 'admin';
const PASS = 'correct horse battery staple';
let HASH;

before(async () => {
  // Lower cost than production to keep the tests fast; verify reads N from the hash.
  HASH = await hashPassword(PASS, { N: 2 ** 14, r: 8, p: 1 });
});

function app(env = {}) {
  return buildTestApp({ ADMIN_USERNAME: USER, ADMIN_PASSWORD_HASH: HASH, ...env });
}

const login = (a, body = { username: USER, password: PASS }, headers = {}) =>
  a.inject({ method: 'POST', url: '/api/auth/login', payload: body, headers });

/** Extracts "gsa_admin=<id>" from a response's Set-Cookie header. */
function sessionCookie(res) {
  const raw = [res.headers['set-cookie']].flat().find((c) => c?.startsWith('gsa_admin='));
  assert.ok(raw, 'expected a gsa_admin cookie');
  return { pair: raw.split(';')[0], raw, id: raw.split(';')[0].split('=')[1] };
}

/* ---------- password hashing ---------- */

test('hashPassword produces scrypt$N$r$p$salt$hash that verifies', async () => {
  assert.match(HASH, /^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  assert.equal(await verifyPassword(PASS, HASH), true);
  assert.equal(await verifyPassword(PASS + 'x', HASH), false);
  assert.equal(await verifyPassword('', HASH), false);
});

test('two hashes of the same password differ (random salt)', async () => {
  const other = await hashPassword(PASS, { N: 2 ** 14, r: 8, p: 1 });
  assert.notEqual(other, HASH);
  assert.equal(await verifyPassword(PASS, other), true);
});

test('malformed hashes never verify and are rejected by config', async () => {
  for (const bad of ['', 'plain', 'scrypt$1$2', 'bcrypt$16384$8$1$abc$def', 'scrypt$1000$8$1$c2FsdHNhbHQ=$aGFzaGhhc2hoYXNoaGFzaA==']) {
    assert.equal(isValidHash(bad), false, bad);
    assert.equal(await verifyPassword(PASS, bad), false, bad);
  }
  assert.throws(() => loadConfig({ NODE_ENV: 'test', ADMIN_PASSWORD_HASH: 'plaintext' }), /not a valid scrypt hash/);
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /ADMIN_PASSWORD_HASH is required/);
});

/* ---------- login ---------- */

test('login with the wrong password returns 401 and no cookie', async (t) => {
  const { app: a, db } = app();
  t.after(() => a.close());

  const res = await login(a, { username: USER, password: 'wrong password' });
  assert.equal(res.statusCode, 401);
  assert.equal(res.headers['set-cookie'], undefined);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM session').get().n, 0);
});

test('login with the wrong username returns 401', async (t) => {
  const { app: a } = app();
  t.after(() => a.close());
  const res = await login(a, { username: 'root', password: PASS });
  assert.equal(res.statusCode, 401);
});

test('login is disabled when no password hash is configured', async (t) => {
  const { app: a } = buildTestApp({ ADMIN_PASSWORD_HASH: '' });
  t.after(() => a.close());
  const res = await login(a);
  assert.equal(res.statusCode, 401);
});

test('login rejects a body that fails the schema, and non-JSON bodies', async (t) => {
  const { app: a } = app();
  t.after(() => a.close());

  assert.equal((await login(a, { username: USER })).statusCode, 400);
  const form = await a.inject({
    method: 'POST', url: '/api/auth/login',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: `username=${USER}&password=${encodeURIComponent(PASS)}`,
  });
  assert.equal(form.statusCode, 415);
});

test('successful login returns 204 and a strict, HttpOnly session cookie', async (t) => {
  const { app: a, db } = app();
  t.after(() => a.close());

  const res = await login(a);
  assert.equal(res.statusCode, 204);
  const { raw, id } = sessionCookie(res);
  assert.match(raw, /HttpOnly/i);
  assert.match(raw, /SameSite=Strict/i);
  assert.match(raw, /Path=\//);
  assert.match(raw, /Max-Age=43200/);
  assert.doesNotMatch(raw, /Secure/i, 'not Secure outside production');
  assert.equal(Buffer.from(id, 'base64url').length, 32);

  const row = db.prepare('SELECT * FROM session WHERE id = ?').get(id);
  assert.ok(row);
  assert.ok(Math.abs(row.expires_at - (Date.now() + SESSION_TTL_MS)) < 5000);
});

test('the session cookie is Secure in production', async (t) => {
  const { app: a } = app({ NODE_ENV: 'production' });
  t.after(() => a.close());
  const res = await login(a);
  assert.equal(res.statusCode, 204);
  assert.match(sessionCookie(res).raw, /Secure/);
});

test('login is rate limited to 5 attempts per minute per IP', async (t) => {
  const { app: a } = app();
  t.after(() => a.close());

  for (let i = 0; i < 5; i++) {
    const res = await login(a, { username: USER, password: 'nope' + i });
    assert.equal(res.statusCode, 401, `attempt ${i + 1}`);
  }
  const blocked = await login(a); // even the right password
  assert.equal(blocked.statusCode, 429);

  // A different client IP is not affected.
  const other = await a.inject({
    method: 'POST', url: '/api/auth/login', payload: { username: USER, password: PASS },
    remoteAddress: '10.0.0.7',
  });
  assert.equal(other.statusCode, 204);
});

/* ---------- me / protected endpoints ---------- */

test('protected endpoint without a cookie returns 401 (not a redirect)', async (t) => {
  const { app: a } = app();
  t.after(() => a.close());

  for (const url of ['/api/admin/menu', '/api/auth/me']) {
    const res = await a.inject({ method: 'GET', url });
    assert.equal(res.statusCode, 401, url);
    assert.equal(res.headers.location, undefined);
    assert.deepEqual(res.json(), { error: 'Unauthorized' });
  }
  const bogus = await a.inject({ method: 'GET', url: '/api/admin/menu', cookies: { gsa_admin: 'made-up' } });
  assert.equal(bogus.statusCode, 401);
});

test('with a session cookie, me and the admin menu work', async (t) => {
  const { app: a } = app();
  t.after(() => a.close());
  const { pair } = sessionCookie(await login(a));

  const me = await a.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: pair } });
  assert.equal(me.statusCode, 200);
  assert.deepEqual(me.json(), { username: USER });

  const menu = await a.inject({ method: 'GET', url: '/api/admin/menu', headers: { cookie: pair } });
  assert.equal(menu.statusCode, 200);
  assert.equal(menu.headers['cache-control'], 'no-store');
  assert.deepEqual(menu.json().groups, []);
});

test('an expired session returns 401', async (t) => {
  const { app: a, db } = app();
  t.after(() => a.close());
  const { pair, id } = sessionCookie(await login(a));

  db.prepare('UPDATE session SET expires_at = ? WHERE id = ?').run(Date.now() - 1, id);

  for (const url of ['/api/admin/menu', '/api/auth/me']) {
    const res = await a.inject({ method: 'GET', url, headers: { cookie: pair } });
    assert.equal(res.statusCode, 401, url);
  }
  assert.equal(deleteExpiredSessions(db), 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM session').get().n, 0);
});

test('using a session extends its expiry', async (t) => {
  const { app: a, db } = app();
  t.after(() => a.close());
  const { pair, id } = sessionCookie(await login(a));

  const soon = Date.now() + 60_000; // about to expire
  db.prepare('UPDATE session SET expires_at = ? WHERE id = ?').run(soon, id);

  const res = await a.inject({ method: 'GET', url: '/api/admin/menu', headers: { cookie: pair } });
  assert.equal(res.statusCode, 200);
  const { expires_at } = db.prepare('SELECT expires_at FROM session WHERE id = ?').get(id);
  assert.ok(expires_at > Date.now() + SESSION_TTL_MS - 5000);
  assert.match(sessionCookie(res).raw, /Max-Age=43200/, 'cookie lifetime is renewed too');
});

test('logout deletes the session and clears the cookie', async (t) => {
  const { app: a, db } = app();
  t.after(() => a.close());
  const { pair, id } = sessionCookie(await login(a));

  const out = await a.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie: pair } });
  assert.equal(out.statusCode, 204);
  assert.match(sessionCookie(out).raw, /gsa_admin=;|Expires=Thu, 01 Jan 1970/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM session WHERE id = ?').get(id).n, 0);

  const me = await a.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: pair } });
  assert.equal(me.statusCode, 401);

  // Logging out without a session is harmless.
  assert.equal((await a.inject({ method: 'POST', url: '/api/auth/logout' })).statusCode, 204);
});

test('a faked X-Forwarded-For does not get around the login rate limit', async (t) => {
  const { app: a } = app({ TRUST_PROXY: 'true' }); // "true" is treated as 1 hop
  t.after(() => a.close());

  const codes = [];
  for (let i = 0; i < 6; i++) {
    // nginx appends the real client IP; the client controls everything to the left of it.
    const res = await a.inject({
      method: 'POST', url: '/api/auth/login', payload: { username: USER, password: 'nope' },
      headers: { 'x-forwarded-for': `6.6.6.${i}, 203.0.113.5` },
    });
    codes.push(res.statusCode);
  }
  assert.deepEqual(codes, [401, 401, 401, 401, 401, 429]);
});
