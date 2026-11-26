import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTestApp, insertGroup, insertItem, insertOption } from './helpers.js';
import { seedSampleData } from '../src/db/seed.js';

test('GET /api/menu on an empty database returns settings and no groups', async (t) => {
  const { app } = buildTestApp();
  t.after(() => app.close());

  const res = await app.inject({ method: 'GET', url: '/api/menu' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], 'public, max-age=60');
  assert.match(res.headers['content-type'], /application\/json/);
  assert.deepEqual(res.json(), {
    settings: { name: 'Gyros Sta Adelfia', tagline: { de: null, en: null, el: null } },
    groups: [],
  });
});

test('GET /api/menu applies ordering and visibility rules', async (t) => {
  const { app, db } = buildTestApp();
  t.after(() => app.close());

  // Inserted out of order on purpose; sort_order decides.
  const burgers = insertGroup(db, { de: 'Burger', en: 'Burgers', sort: 2 });
  const seafood = insertGroup(db, { de: 'Meeresfrüchte', en: 'Seafood', el: 'Θαλασσινά', sort: 1 });
  const hidden = insertGroup(db, { de: 'Versteckt', sort: 0, visible: false });
  insertGroup(db, { de: 'Leer', sort: 3 }); // visible but no items → omitted

  insertItem(db, hidden, { de: 'Geheim' });
  const veggie = insertItem(db, burgers, { de: 'Veggie-Burger', price: 1250, sort: 1 });
  const beef = insertItem(db, burgers, { de: 'Rindfleischburger', price: 1390, sort: 0, image: 'abc.jpg' });
  const bream = insertItem(db, seafood, { de: 'Doradenfilet', price: 2400, available: false });
  insertOption(db, beef, { de: 'Mit Speck', extra: 150, sort: 1 });
  insertOption(db, beef, { de: 'Doppeltes Patty', extra: 450, sort: 0 });

  const res = await app.inject({ method: 'GET', url: '/api/menu' });
  assert.equal(res.statusCode, 200);
  const { groups } = res.json();

  assert.deepEqual(groups.map((g) => g.id), [seafood, burgers], 'visible, non-empty groups in sort order');
  assert.deepEqual(groups[0].name, { de: 'Meeresfrüchte', en: 'Seafood', el: 'Θαλασσινά' });
  assert.deepEqual(groups[1].name, { de: 'Burger', en: 'Burgers', el: null });

  // Unavailable items are included, flagged.
  assert.equal(groups[0].items.length, 1);
  assert.equal(groups[0].items[0].id, bream);
  assert.equal(groups[0].items[0].isAvailable, false);
  assert.equal(groups[0].items[0].imageUrl, null);

  // Items in sort order, with options in sort order.
  assert.deepEqual(groups[1].items.map((i) => i.id), [beef, veggie]);
  const beefOut = groups[1].items[0];
  assert.deepEqual(beefOut, {
    id: beef,
    name: { de: 'Rindfleischburger', en: null, el: null },
    description: { de: '', en: null, el: null },
    priceCents: 1390,
    imageUrl: '/uploads/abc.jpg',
    isAvailable: true,
    allergens: [],
    options: [
      { name: { de: 'Doppeltes Patty', en: null, el: null }, extraPriceCents: 450 },
      { name: { de: 'Mit Speck', en: null, el: null }, extraPriceCents: 150 },
    ],
  });
  assert.deepEqual(groups[1].items[1].options, []);

  // Nothing from the hidden group leaks out.
  assert.ok(!res.body.includes('Geheim'));
});

test('GET /api/menu returns the seeded sample menu', async (t) => {
  const { app, db } = buildTestApp();
  t.after(() => app.close());
  seedSampleData(db);

  const { settings, groups } = (await app.inject({ method: 'GET', url: '/api/menu' })).json();
  assert.equal(settings.tagline.el, 'Θαλασσινά, ψητά και καλή παρέα');
  assert.deepEqual(groups.map((g) => g.name.en), ['Seafood', 'Burgers', 'Side dishes']);
  assert.equal(groups.flatMap((g) => g.items).length, 7);
  const calamari = groups[0].items[1];
  assert.equal(calamari.name.el, 'Καλαμαράκια τηγανητά');
  assert.deepEqual(calamari.options.map((o) => o.extraPriceCents), [0, 400]);
});

test('GET /healthz returns 200', async (t) => {
  const { app } = buildTestApp();
  t.after(() => app.close());
  const res = await app.inject({ method: 'GET', url: '/healthz' });
  assert.equal(res.statusCode, 200);
});

test('serves the menu page and its assets', async (t) => {
  const { app } = buildTestApp();
  t.after(() => app.close());

  const page = await app.inject({ method: 'GET', url: '/' });
  assert.equal(page.statusCode, 200);
  assert.match(page.headers['content-type'], /text\/html/);
  assert.match(page.body, /src="\/js\/menu\.js"/);

  for (const url of ['/css/site.css', '/js/i18n.js', '/js/menu.js', '/img/logo.svg']) {
    const res = await app.inject({ method: 'GET', url });
    assert.equal(res.statusCode, 200, url);
  }
  const js = await app.inject({ method: 'GET', url: '/js/menu.js' });
  assert.match(js.headers['content-type'], /javascript/);
});

test('serves the admin page; /admin redirects to /admin/', async (t) => {
  const { app } = buildTestApp();
  t.after(() => app.close());

  const redirect = await app.inject({ method: 'GET', url: '/admin' });
  assert.equal(redirect.statusCode, 301);
  assert.equal(redirect.headers.location, '/admin/');

  const page = await app.inject({ method: 'GET', url: '/admin/' });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /src="\/js\/admin\.js"/);
  assert.match(page.body, /noindex/);
  assert.equal((await app.inject({ method: 'GET', url: '/js/admin.js' })).statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: '/js/admin-i18n.js' })).statusCode, 200);
  assert.match(page.body, /data-langs/, 'language switcher (DE/EN/EL)');
});

test('allergen codes: browser list matches the server, sample menu declares some', async (t) => {
  const { ALLERGEN_CODES } = await import('../src/lib/allergens.js');
  const { ALLERGENS, ALLERGEN_CODES: clientCodes } = await import('../public/js/i18n.js');
  assert.deepEqual(clientCodes, ALLERGEN_CODES);
  assert.equal(ALLERGEN_CODES.length, 14);
  for (const c of ALLERGEN_CODES) {
    assert.ok(ALLERGENS[c].de && ALLERGENS[c].en && ALLERGENS[c].el, `names for ${c}`);
  }

  const { app, db } = buildTestApp();
  t.after(() => app.close());
  seedSampleData(db);
  const { groups } = (await app.inject({ method: 'GET', url: '/api/menu' })).json();
  const burger = groups[1].items.find((i) => i.name.en === 'Classic beef burger');
  assert.deepEqual(burger.allergens, ['A', 'C', 'G', 'M', 'N']);
});
