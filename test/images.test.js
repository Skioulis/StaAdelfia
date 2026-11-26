import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildTestApp, adminCookie, insertGroup, insertItem } from './helpers.js';
import { detectImageType, removeTempFiles, MAX_IMAGE_BYTES } from '../src/lib/images.js';

// Minimal files: the server only checks the magic bytes, so a valid header plus padding is enough.
const pad = (head, size = 64) => Buffer.concat([Buffer.from(head), Buffer.alloc(size - head.length, 0x11)]);
const JPEG = pad([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const PNG = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const WEBP = pad([...Buffer.from('RIFF'), 0x24, 0x00, 0x00, 0x00, ...Buffer.from('WEBPVP8 ')]);

function multipart(buffer, { field = 'file', filename = 'photo.jpg', type = 'image/jpeg' } = {}) {
  const boundary = '----gsatest' + Math.random().toString(16).slice(2);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload: body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

async function setup(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsa-img-'));
  fs.mkdirSync(path.join(dataDir, 'uploads'));
  const { app, db } = buildTestApp({ DATA_DIR: dataDir });
  t.after(async () => {
    await app.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  const cookie = await adminCookie(db);
  const groupId = insertGroup(db, { de: 'Burger' });
  const itemId = insertItem(db, groupId, { de: 'Veggie-Burger' });
  const upload = (buffer, opts, id = itemId) => {
    const { payload, headers } = multipart(buffer, opts);
    return app.inject({ method: 'POST', url: `/api/admin/items/${id}/image`, payload, headers: { ...headers, cookie } });
  };
  const uploads = () => fs.readdirSync(path.join(dataDir, 'uploads')).sort();
  const imageFile = () => db.prepare('SELECT image_file FROM menu_item WHERE id = ?').pluck().get(itemId);
  return { app, db, cookie, dataDir, itemId, upload, uploads, imageFile };
}

test('detectImageType checks magic bytes only', () => {
  assert.equal(detectImageType(JPEG), 'jpg');
  assert.equal(detectImageType(PNG), 'png');
  assert.equal(detectImageType(WEBP), 'webp');
  assert.equal(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(detectImageType(Buffer.from('RIFF\0\0\0\0WAVEfmt ')), null, 'RIFF but not WebP');
  assert.equal(detectImageType(JPEG.subarray(0, 5)), null, 'too short');
});

test('uploading a JPEG, PNG or WebP saves it and serves it with long cache headers', async (t) => {
  const { app, upload, uploads, imageFile } = await setup(t);

  for (const [buf, ext] of [[PNG, 'png'], [WEBP, 'webp'], [JPEG, 'jpg']]) {
    const res = await upload(buf, { filename: 'whatever.gif', type: 'application/octet-stream' });
    assert.equal(res.statusCode, 200, res.body);
    const { imageUrl } = res.json();
    assert.match(imageUrl, new RegExp(`^/uploads/[0-9a-f-]{36}\\.${ext}$`), 'type from bytes, not name or content type');
    assert.equal(`/uploads/${imageFile()}`, imageUrl);
  }
  assert.equal(uploads().length, 1, 'each replace removed the previous file');

  const res = await app.inject({ method: 'GET', url: `/uploads/${imageFile()}` });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], 'public, max-age=31536000, immutable');
  assert.equal(res.headers['content-type'], 'image/jpeg');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.deepEqual(res.rawPayload, JPEG);

  // The public menu points at it.
  const menu = (await app.inject({ method: 'GET', url: '/api/menu' })).json();
  assert.equal(menu.groups[0].items[0].imageUrl, `/uploads/${imageFile()}`);
});

test('a non-image is rejected and leaves no file behind', async (t) => {
  const { upload, uploads, imageFile } = await setup(t);

  const fakes = [
    [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'evil.svg', 'image/svg+xml'],
    [Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\n'), 'menu.jpg', 'image/jpeg'],
    [Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;'), 'anim.gif', 'image/gif'],
    [Buffer.from([0xff, 0xd8]), 'tiny.jpg', 'image/jpeg'],
    [Buffer.alloc(0), 'empty.jpg', 'image/jpeg'],
  ];
  for (const [buf, filename, type] of fakes) {
    const res = await upload(buf, { filename, type });
    assert.equal(res.statusCode, 400, filename);
    assert.deepEqual(res.json().errors, { file: 'Must be a JPEG, PNG or WebP image' }, filename);
  }
  assert.deepEqual(uploads(), [], 'no files and no temp files');
  assert.equal(imageFile(), null);
});

test('replacing an image deletes the old file', async (t) => {
  const { upload, uploads, imageFile, dataDir } = await setup(t);

  const first = (await upload(JPEG)).json().imageUrl;
  const firstPath = path.join(dataDir, first);
  assert.ok(fs.existsSync(firstPath));

  const second = (await upload(PNG, { filename: 'b.png', type: 'image/png' })).json().imageUrl;
  assert.notEqual(second, first, 'a new upload gets a new name (safe with immutable caching)');
  assert.equal(fs.existsSync(firstPath), false, 'old file deleted');
  assert.deepEqual(uploads(), [path.basename(second)]);
  assert.equal(imageFile(), path.basename(second));

  // A rejected replacement keeps the current image.
  const bad = await upload(Buffer.from('not an image at all'), { filename: 'x.jpg' });
  assert.equal(bad.statusCode, 400);
  assert.deepEqual(uploads(), [path.basename(second)]);
  assert.equal(imageFile(), path.basename(second));
});

test('a file over 5 MB is rejected with 413 and nothing is saved', async (t) => {
  const { upload, uploads, imageFile } = await setup(t);
  const big = Buffer.concat([JPEG, Buffer.alloc(MAX_IMAGE_BYTES, 0x22)]);
  const res = await upload(big);
  assert.equal(res.statusCode, 413);
  assert.deepEqual(res.json().errors, { file: 'At most 5 MB' });
  assert.deepEqual(uploads(), []);
  assert.equal(imageFile(), null);
});

test('upload errors: unknown item, missing file field, wrong content type, no session', async (t) => {
  const { app, cookie, itemId, upload, uploads } = await setup(t);

  let res = await upload(JPEG, {}, 999);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(uploads(), []);

  res = await upload(JPEG, { field: 'image' });
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.json().errors, { file: 'Required' });

  res = await app.inject({
    method: 'POST', url: `/api/admin/items/${itemId}/image`, headers: { cookie }, payload: { file: 'x' },
  });
  assert.equal(res.statusCode, 415);

  const { payload, headers } = multipart(JPEG);
  res = await app.inject({ method: 'POST', url: `/api/admin/items/${itemId}/image`, payload, headers });
  assert.equal(res.statusCode, 401);
  assert.deepEqual(uploads(), []);
});

test('multipart is refused on every other admin endpoint', async (t) => {
  const { app, cookie, db } = await setup(t);
  const { payload, headers } = multipart(Buffer.from('{"name":{"de":"X"}}'), { field: 'name', type: 'application/json' });
  const res = await app.inject({ method: 'POST', url: '/api/admin/groups', payload, headers: { ...headers, cookie } });
  assert.equal(res.statusCode, 415);
  assert.equal(db.prepare('SELECT COUNT(*) FROM menu_group').pluck().get(), 1);
});

test('DELETE /items/:id/image removes the file and clears the item', async (t) => {
  const { app, cookie, itemId, upload, uploads, imageFile } = await setup(t);
  await upload(JPEG);
  assert.equal(uploads().length, 1);

  const del = (id) => app.inject({ method: 'DELETE', url: `/api/admin/items/${id}/image`, headers: { cookie } });
  assert.equal((await del(itemId)).statusCode, 204);
  assert.deepEqual(uploads(), []);
  assert.equal(imageFile(), null);
  assert.equal((await del(itemId)).statusCode, 204, 'no image is fine');
  assert.equal((await del(999)).statusCode, 404);
});

test('/uploads does not serve temp files, unknown files or paths outside the folder', async (t) => {
  const { app, dataDir } = await setup(t);
  fs.writeFileSync(path.join(dataDir, 'uploads', '.tmp-abc'), 'partial');
  fs.writeFileSync(path.join(dataDir, 'secret.txt'), 'nope');
  for (const url of ['/uploads/.tmp-abc', '/uploads/missing.jpg', '/uploads/../secret.txt', '/uploads/%2e%2e/secret.txt', '/uploads/']) {
    const res = await app.inject({ method: 'GET', url });
    assert.ok([403, 404].includes(res.statusCode), `${url} → ${res.statusCode}`);
    assert.ok(!res.body.includes('nope') && !res.body.includes('partial'), url);
  }

  await removeTempFiles(dataDir);
  assert.deepEqual(fs.readdirSync(path.join(dataDir, 'uploads')), []);
});
