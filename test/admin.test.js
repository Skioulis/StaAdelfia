import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildTestApp, adminCookie } from './helpers.js';

/** App + logged-in request helper. */
async function setup(t, env = {}) {
  const { app, db } = buildTestApp(env);
  t.after(() => app.close());
  const cookie = await adminCookie(db);
  const call = (method, url, payload) => app.inject({ method, url, payload, headers: { cookie } });
  return { app, db, call };
}

const name = (de, en = null, el = null) => ({ de, en, el });
const adminMenu = async (call) => (await call('GET', '/api/admin/menu')).json();
const count = (db, table) => db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get();

async function createGroup(call, de, extra = {}) {
  const res = await call('POST', '/api/admin/groups', { name: name(de), ...extra });
  assert.equal(res.statusCode, 201, res.body);
  return res.json();
}
async function createItem(call, groupId, de, extra = {}) {
  const res = await call('POST', '/api/admin/items', { groupId, name: name(de), priceCents: 1000, ...extra });
  assert.equal(res.statusCode, 201, res.body);
  return res.json();
}

/* ---------- auth & transport ---------- */

describe('admin endpoints', () => {
  test('every admin endpoint returns 401 without a session', async (t) => {
    const { app } = buildTestApp();
    t.after(() => app.close());
    const routes = [
      ['GET', '/api/admin/menu'], ['POST', '/api/admin/groups'], ['PUT', '/api/admin/groups/1'],
      ['DELETE', '/api/admin/groups/1'], ['PUT', '/api/admin/groups/order'], ['POST', '/api/admin/items'],
      ['PUT', '/api/admin/items/1'], ['DELETE', '/api/admin/items/1'], ['PUT', '/api/admin/groups/1/items/order'],
      ['GET', '/api/admin/settings'], ['PUT', '/api/admin/settings'],
    ];
    for (const [method, url] of routes) {
      const res = await app.inject({ method, url, payload: method === 'GET' || method === 'DELETE' ? undefined : {} });
      assert.equal(res.statusCode, 401, `${method} ${url}`);
    }
  });

  test('rejects text/plain and form bodies (CSRF), sends no-store', async (t) => {
    const { app, db } = buildTestApp();
    t.after(() => app.close());
    const cookie = await adminCookie(db);
    for (const type of ['text/plain', 'application/x-www-form-urlencoded']) {
      const res = await app.inject({
        method: 'POST', url: '/api/admin/groups', headers: { cookie, 'content-type': type },
        payload: '{"name":{"de":"Burger"}}',
      });
      assert.equal(res.statusCode, 415, type);
    }
    assert.equal(count(db, 'menu_group'), 0);
    const menu = await app.inject({ method: 'GET', url: '/api/admin/menu', headers: { cookie } });
    assert.equal(menu.headers['cache-control'], 'no-store');
  });
});

/* ---------- groups ---------- */

describe('groups', () => {
  test('create returns 201 with the group, appended at the end', async (t) => {
    const { call } = await setup(t);
    const a = await createGroup(call, 'Meeresfrüchte');
    assert.deepEqual(a, { id: a.id, name: name('Meeresfrüchte'), isVisible: true });

    const res = await call('POST', '/api/admin/groups', {
      name: { de: '  Burger ', en: 'Burgers', el: '' }, isVisible: false,
    });
    assert.equal(res.statusCode, 201);
    assert.deepEqual(res.json().name, { de: 'Burger', en: 'Burgers', el: null }, 'trimmed; empty → null');
    assert.equal(res.json().isVisible, false);

    const { groups } = await adminMenu(call);
    assert.deepEqual(groups.map((g) => g.name.de), ['Meeresfrüchte', 'Burger']);
  });

  test('validation errors are keyed by field', async (t) => {
    const { call, db } = await setup(t);

    let res = await call('POST', '/api/admin/groups', { name: { en: 'Burgers' } });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json(), { error: 'Validation failed', errors: { 'name.de': 'Required' } });

    res = await call('POST', '/api/admin/groups', { name: { de: '   ' } });
    assert.deepEqual(res.json().errors, { 'name.de': 'Required' });

    res = await call('POST', '/api/admin/groups', { name: { de: 'x'.repeat(121), el: 'y'.repeat(121) } });
    assert.deepEqual(res.json().errors, {
      'name.de': 'At most 120 characters',
      'name.el': 'At most 120 characters',
    });

    res = await call('POST', '/api/admin/groups', {});
    assert.deepEqual(res.json().errors, { name: 'Required' });
    assert.equal(count(db, 'menu_group'), 0);
  });

  test('update changes name and visibility; hidden groups leave the public menu', async (t) => {
    const { app, call } = await setup(t);
    const g = await createGroup(call, 'Burger');
    await createItem(call, g.id, 'Veggie-Burger');

    const res = await call('PUT', `/api/admin/groups/${g.id}`, { name: name('Burger', 'Burgers', 'Μπέργκερ'), isVisible: false });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { id: g.id, name: name('Burger', 'Burgers', 'Μπέργκερ'), isVisible: false });

    const pub = (await app.inject({ method: 'GET', url: '/api/menu' })).json();
    assert.deepEqual(pub.groups, []);

    // PUT replaces, so isVisible is required.
    const partial = await call('PUT', `/api/admin/groups/${g.id}`, { name: name('Burger') });
    assert.equal(partial.statusCode, 400);
    assert.deepEqual(partial.json().errors, { isVisible: 'Required' });
  });

  test('unknown or malformed ids return 404 / 400', async (t) => {
    const { call } = await setup(t);
    let res = await call('PUT', '/api/admin/groups/999', { name: name('X'), isVisible: true });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.json(), { error: 'Group not found' });
    assert.equal((await call('DELETE', '/api/admin/groups/999')).statusCode, 404);
    assert.equal((await call('PUT', '/api/admin/groups/999/items/order', { ids: [] })).statusCode, 404);

    res = await call('DELETE', '/api/admin/groups/abc');
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json().errors, { id: 'Must be integer' });
  });

  test('reorder rewrites sort_order 0..n and needs every id exactly once', async (t) => {
    const { call, db } = await setup(t);
    const [a, b, c] = [await createGroup(call, 'A'), await createGroup(call, 'B'), await createGroup(call, 'C')];

    const res = await call('PUT', '/api/admin/groups/order', { ids: [c.id, a.id, b.id] });
    assert.equal(res.statusCode, 204);
    assert.deepEqual((await adminMenu(call)).groups.map((g) => g.name.de), ['C', 'A', 'B']);
    assert.deepEqual(db.prepare('SELECT sort_order FROM menu_group ORDER BY sort_order').pluck().all(), [0, 1, 2]);

    for (const ids of [[c.id, a.id], [c.id, a.id, b.id, 999], [c.id, a.id, a.id]]) {
      const bad = await call('PUT', '/api/admin/groups/order', { ids });
      assert.equal(bad.statusCode, 400, JSON.stringify(ids));
      assert.deepEqual(bad.json().errors, { ids: 'Must list every id exactly once' });
    }
    assert.deepEqual((await adminMenu(call)).groups.map((g) => g.name.de), ['C', 'A', 'B'], 'unchanged after errors');
  });

  test('delete cascades to items and options, and removes their image files', async (t) => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsa-test-'));
    t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
    fs.mkdirSync(path.join(dataDir, 'uploads'));
    const { call, db } = await setup(t, { DATA_DIR: dataDir });

    const doomed = await createGroup(call, 'Weg');
    const kept = await createGroup(call, 'Bleibt');
    const i1 = await createItem(call, doomed.id, 'Eins', { options: [{ name: name('Groß'), extraPriceCents: 400 }] });
    await createItem(call, doomed.id, 'Zwei');
    const i3 = await createItem(call, kept.id, 'Drei', { options: [{ name: name('Klein') }] });

    const file = (id) => {
      const f = `${randomUUID()}.jpg`;
      fs.writeFileSync(path.join(dataDir, 'uploads', f), 'x');
      db.prepare('UPDATE menu_item SET image_file = ? WHERE id = ?').run(f, id);
      return path.join(dataDir, 'uploads', f);
    };
    const doomedFile = file(i1.id);
    const keptFile = file(i3.id);

    const res = await call('DELETE', `/api/admin/groups/${doomed.id}`);
    assert.equal(res.statusCode, 204);

    assert.equal(count(db, 'menu_group'), 1);
    assert.deepEqual(db.prepare('SELECT name_de FROM menu_item').pluck().all(), ['Drei']);
    assert.deepEqual(db.prepare('SELECT name_de FROM item_option').pluck().all(), ['Klein']);
    assert.equal(fs.existsSync(doomedFile), false, 'image of a deleted item is removed');
    assert.equal(fs.existsSync(keptFile), true, 'other images stay');
  });
});

/* ---------- items ---------- */

describe('items', () => {
  test('create with options returns 201 with the item; options keep their order', async (t) => {
    const { call } = await setup(t);
    const g = await createGroup(call, 'Burger');
    const res = await call('POST', '/api/admin/items', {
      groupId: g.id,
      name: name('Klassischer Burger', 'Classic burger'),
      description: { de: '180 g Rind', en: '', el: null },
      priceCents: 1390,
      options: [
        { name: name('Doppeltes Patty'), extraPriceCents: 450 },
        { name: name('Mit Speck', 'Add bacon') , extraPriceCents: 150 },
        { name: name('Ohne Zwiebel') },
      ],
    });
    assert.equal(res.statusCode, 201, res.body);
    const it = res.json();
    assert.equal(it.groupId, g.id);
    assert.deepEqual(it.description, { de: '180 g Rind', en: null, el: null });
    assert.equal(it.isAvailable, true, 'defaults to available');
    assert.equal(it.imageUrl, null);
    assert.deepEqual(it.options.map((o) => [o.name.de, o.extraPriceCents]),
      [['Doppeltes Patty', 450], ['Mit Speck', 150], ['Ohne Zwiebel', 0]]);
    assert.ok(it.options.every((o) => Number.isInteger(o.id)));

    const second = await createItem(call, g.id, 'Veggie');
    const { groups } = await adminMenu(call);
    assert.deepEqual(groups[0].items.map((i) => i.id), [it.id, second.id], 'new items go last');
  });

  test('item validation: price range, option limit, unknown group, several fields at once', async (t) => {
    const { call, db } = await setup(t);
    const g = await createGroup(call, 'Burger');

    let res = await call('POST', '/api/admin/items', {
      groupId: g.id, name: { de: '' }, priceCents: 100001,
      description: { de: 'd'.repeat(601) },
      options: [{ name: name('Ok'), extraPriceCents: -1 }],
    });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json().errors, {
      'name.de': 'Required',
      priceCents: 'Must be at most 100000',
      'description.de': 'At most 600 characters',
      'options.0.extraPriceCents': 'Must be at least 0',
    });

    res = await call('POST', '/api/admin/items', { groupId: g.id, name: name('X'), priceCents: 12.5 });
    assert.deepEqual(res.json().errors, { priceCents: 'Must be integer' });

    const options = Array.from({ length: 21 }, (_, i) => ({ name: name(`O${i}`) }));
    res = await call('POST', '/api/admin/items', { groupId: g.id, name: name('X'), priceCents: 100, options });
    assert.deepEqual(res.json().errors, { options: 'At most 20 entries' });

    res = await call('POST', '/api/admin/items', { groupId: 999, name: name('X'), priceCents: 100 });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json().errors, { groupId: 'Unknown group' });

    // Limits themselves are allowed.
    res = await call('POST', '/api/admin/items', {
      groupId: g.id, name: name('x'.repeat(120)), priceCents: 100000, options: options.slice(0, 20),
    });
    assert.equal(res.statusCode, 201);
    assert.equal(count(db, 'menu_item'), 1);
  });

  test('update replaces the options list: delete missing, update sent ids, insert new', async (t) => {
    const { call, db } = await setup(t);
    const g = await createGroup(call, 'Beilagen');
    const other = await createItem(call, g.id, 'Andere', { options: [{ name: name('Fremd') }] });
    const it = await createItem(call, g.id, 'Pommes', {
      options: [{ name: name('Klein') }, { name: name('Mittel'), extraPriceCents: 100 }, { name: name('Groß'), extraPriceCents: 200 }],
    });
    const [small, medium] = it.options;
    const foreignId = other.options[0].id;

    const res = await call('PUT', `/api/admin/items/${it.id}`, {
      groupId: g.id, name: name('Pommes frites'), description: {}, priceCents: 490, isAvailable: false, allergens: [],
      options: [
        { id: medium.id, name: name('Mittel', 'Medium'), extraPriceCents: 150 }, // updated, now first
        { name: name('Süßkartoffel'), extraPriceCents: 150 },                    // new
        { id: foreignId, name: name('Gekapert') },                              // foreign id → new option
      ],
    });
    assert.equal(res.statusCode, 200, res.body);
    const out = res.json();
    assert.equal(out.name.de, 'Pommes frites');
    assert.equal(out.priceCents, 490);
    assert.equal(out.isAvailable, false);
    assert.deepEqual(out.options.map((o) => o.name.de), ['Mittel', 'Süßkartoffel', 'Gekapert']);
    assert.equal(out.options[0].id, medium.id, 'sent id is kept');
    assert.deepEqual(out.options[0].name, name('Mittel', 'Medium'));
    assert.equal(out.options[0].extraPriceCents, 150);
    assert.notEqual(out.options[2].id, foreignId);

    const ids = db.prepare('SELECT id FROM item_option WHERE item_id = ?').pluck().all(it.id);
    assert.ok(!ids.includes(small.id), 'missing option deleted');
    assert.equal(db.prepare('SELECT name_de FROM item_option WHERE id = ?').pluck().get(foreignId), 'Fremd',
      'another item’s option is untouched');

    // An empty list removes them all.
    const cleared = await call('PUT', `/api/admin/items/${it.id}`, {
      groupId: g.id, name: name('Pommes'), description: {}, priceCents: 450, isAvailable: true, allergens: [], options: [],
    });
    assert.deepEqual(cleared.json().options, []);
    assert.equal(cleared.json().isAvailable, true);

    // PUT replaces the item, so leaving fields out is an error rather than a silent reset.
    const partial = await call('PUT', `/api/admin/items/${it.id}`, { groupId: g.id, name: name('Pommes'), priceCents: 450 });
    assert.equal(partial.statusCode, 400);
    assert.deepEqual(partial.json().errors, {
      description: 'Required', isAvailable: 'Required', allergens: 'Required', options: 'Required',
    });
  });

  test('a failed update changes nothing (transaction)', async (t) => {
    const { call, db } = await setup(t);
    const g = await createGroup(call, 'G');
    const it = await createItem(call, g.id, 'Alt', { options: [{ name: name('Opt') }] });
    const res = await call('PUT', `/api/admin/items/${it.id}`, {
      groupId: 999, name: name('Neu'), description: {}, priceCents: 1, isAvailable: true, allergens: [], options: [],
    });
    assert.equal(res.statusCode, 400);
    assert.equal(db.prepare('SELECT name_de FROM menu_item').pluck().get(), 'Alt');
    assert.equal(count(db, 'item_option'), 1);
  });

  test('moving an item to another group puts it last there', async (t) => {
    const { call } = await setup(t);
    const a = await createGroup(call, 'A');
    const b = await createGroup(call, 'B');
    const moving = await createItem(call, a.id, 'Wandert');
    await createItem(call, b.id, 'B1');
    await createItem(call, b.id, 'B2');

    const res = await call('PUT', `/api/admin/items/${moving.id}`, {
      groupId: b.id, name: name('Wandert'), description: {}, priceCents: 1000, isAvailable: true, allergens: [], options: [],
    });
    assert.equal(res.statusCode, 200);
    const { groups } = await adminMenu(call);
    assert.deepEqual(groups[0].items, []);
    assert.deepEqual(groups[1].items.map((i) => i.name.de), ['B1', 'B2', 'Wandert']);
  });

  test('delete removes the item, its options and its image; unknown id is 404', async (t) => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsa-test-'));
    t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
    fs.mkdirSync(path.join(dataDir, 'uploads'));
    const { call, db } = await setup(t, { DATA_DIR: dataDir });

    const g = await createGroup(call, 'G');
    const it = await createItem(call, g.id, 'Weg', { options: [{ name: name('O1') }, { name: name('O2') }] });
    const f = `${randomUUID()}.webp`;
    fs.writeFileSync(path.join(dataDir, 'uploads', f), 'x');
    db.prepare('UPDATE menu_item SET image_file = ? WHERE id = ?').run(f, it.id);

    assert.equal((await call('DELETE', `/api/admin/items/${it.id}`)).statusCode, 204);
    assert.equal(count(db, 'menu_item'), 0);
    assert.equal(count(db, 'item_option'), 0);
    assert.equal(fs.existsSync(path.join(dataDir, 'uploads', f)), false);

    assert.equal((await call('DELETE', `/api/admin/items/${it.id}`)).statusCode, 404);
    assert.equal((await call('PUT', `/api/admin/items/${it.id}`, {
      groupId: g.id, name: name('X'), description: {}, priceCents: 1, isAvailable: true, allergens: [], options: [],
    })).statusCode, 404);
  });

  test('reorder items within a group', async (t) => {
    const { call } = await setup(t);
    const g = await createGroup(call, 'G');
    const other = await createGroup(call, 'Other');
    const [x, y, z] = [await createItem(call, g.id, 'X'), await createItem(call, g.id, 'Y'), await createItem(call, g.id, 'Z')];
    const stranger = await createItem(call, other.id, 'Fremd');

    const res = await call('PUT', `/api/admin/groups/${g.id}/items/order`, { ids: [z.id, x.id, y.id] });
    assert.equal(res.statusCode, 204);
    assert.deepEqual((await adminMenu(call)).groups[0].items.map((i) => i.name.de), ['Z', 'X', 'Y']);

    const bad = await call('PUT', `/api/admin/groups/${g.id}/items/order`, { ids: [z.id, x.id, stranger.id] });
    assert.equal(bad.statusCode, 400);
    assert.deepEqual(bad.json().errors, { ids: 'Must list every id exactly once' });
  });
});

/* ---------- settings ---------- */

describe('settings', () => {
  test('get and update restaurant name and tagline', async (t) => {
    const { app, call } = await setup(t);
    let res = await call('GET', '/api/admin/settings');
    assert.deepEqual(res.json(), { name: 'Gyros Sta Adelfia', tagline: { de: null, en: null, el: null } });

    res = await call('PUT', '/api/admin/settings', {
      name: ' Gyros Sta Adelfia ', tagline: { de: 'Griechisch in Wien', en: '', el: 'Ελληνικά στη Βιέννη' },
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), {
      name: 'Gyros Sta Adelfia', tagline: { de: 'Griechisch in Wien', en: null, el: 'Ελληνικά στη Βιέννη' },
    });
    const pub = (await app.inject({ method: 'GET', url: '/api/menu' })).json();
    assert.equal(pub.settings.tagline.el, 'Ελληνικά στη Βιέννη');

    res = await call('PUT', '/api/admin/settings', { name: '' });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json().errors, { name: 'Required' });
  });
});

/* ---------- allergens ---------- */

describe('allergens', () => {
  test('create, update and clear allergen codes; stored in canonical order', async (t) => {
    const { app, call, db } = await setup(t);
    const g = await createGroup(call, 'Burger');

    const created = await createItem(call, g.id, 'Burger', { allergens: ['N', 'A', 'G'] });
    assert.deepEqual(created.allergens, ['A', 'G', 'N'], 'sorted A–R');
    assert.equal(db.prepare('SELECT allergens FROM menu_item').pluck().get(), 'AGN');

    const plain = await createItem(call, g.id, 'Pommes');
    assert.deepEqual(plain.allergens, [], 'defaults to none');

    const full = { groupId: g.id, name: name('Burger'), description: {}, priceCents: 1000, isAvailable: true, options: [] };
    let res = await call('PUT', `/api/admin/items/${created.id}`, { ...full, allergens: ['R', 'C'] });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json().allergens, ['C', 'R']);

    res = await call('PUT', `/api/admin/items/${created.id}`, { ...full, allergens: [] });
    assert.deepEqual(res.json().allergens, []);

    // The public menu carries them too.
    await call('PUT', `/api/admin/items/${created.id}`, { ...full, allergens: ['A', 'M'] });
    const pub = (await app.inject({ method: 'GET', url: '/api/menu' })).json();
    assert.deepEqual(pub.groups[0].items.map((i) => i.allergens), [['A', 'M'], []]);
  });

  test('unknown or duplicate codes are rejected', async (t) => {
    const { call, db } = await setup(t);
    const g = await createGroup(call, 'G');

    let res = await call('POST', '/api/admin/items', { groupId: g.id, name: name('X'), priceCents: 100, allergens: ['A', 'Z'] });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json().errors, { 'allergens.1': 'Invalid value' });

    res = await call('POST', '/api/admin/items', { groupId: g.id, name: name('X'), priceCents: 100, allergens: ['a'] });
    assert.deepEqual(res.json().errors, { 'allergens.0': 'Invalid value' }, 'codes are upper case');

    res = await call('POST', '/api/admin/items', { groupId: g.id, name: name('X'), priceCents: 100, allergens: ['A', 'A'] });
    assert.deepEqual(res.json().errors, { allergens: 'Duplicate entries' });

    assert.equal(count(db, 'menu_item'), 0);
  });
});
