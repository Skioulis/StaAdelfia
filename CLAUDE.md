# Gyros Sta Adelfia: menu website

Build spec for a small restaurant menu site with two pages: a public **menu** and a password-protected **admin** page. Follow the build order at the bottom, one step per session, and tick steps off as they are done.

## 1. What we are building

- **Menu page (`/`)**: guests (mostly on phones, often via a QR code) see menu groups (e.g. Seafood, Burgers, Side dishes) and the items in each group, with image, name, description, options and price. A switcher sets the language to German, English or Greek.
- **Admin page (`/admin`)**: the owner logs in and manages:
  - **Groups**: name in 3 languages, show/hide, order.
  - **Items**: group, name and description in 3 languages, price, image, options, available yes/no, order.
  - **Options** per item: name in 3 languages plus an extra price (0 = included). Examples: "Large portion +€4", "Add bacon +€1.50".
  - **Restaurant settings**: name and tagline (tagline in 3 languages).
- The visual design is already decided. `design/prototype.html` is a working static prototype (data kept in localStorage) and is **the reference for layout, colours, fonts and behaviour**. Reuse its HTML/CSS and JS and swap localStorage for API calls.

Not in v1: online ordering, payments, multiple admin users, reservations.

## 2. Stack and decisions

| Area | Decision |
|---|---|
| Runtime | **Node.js 26** (Active LTS), ES modules, plain JavaScript (no build step) |
| Web framework | **Fastify 5**, with `@fastify/static`, `@fastify/multipart`, `@fastify/cookie`, `@fastify/rate-limit` and `@fastify/helmet` |
| Database | **SQLite** via **better-sqlite3** (synchronous, fast, one file) |
| Validation | Fastify's built-in JSON Schema validation on every route |
| Frontend | Plain HTML/CSS/JS in `public/` (no framework, no build step), split from the prototype |
| Auth | Single admin account, password hashed with Node's built-in `crypto.scrypt`, server-side sessions in SQLite |
| Tests | Node's built-in test runner (`node --test`) plus `fastify.inject()`, no extra test framework |
| Hosting | Docker container, one volume for `/data`, behind the existing nginx reverse proxy |

Reasons:
- **Money as integer cents** (`price_cents`, `extra_price_cents`). This avoids floating-point rounding in JavaScript. Format to euros only in the UI.
- **Translations as columns** (`name_de`, `name_en`, `name_el`). There are exactly three languages, and columns are simple to query. Adding a language later means one migration.
- **The public menu API returns all three languages in one response.** The browser picks the language, so switching is instant and the response can be cached.
- **No ORM.** It's 4 tables. Write plain SQL with prepared statements in a small `db/` module, one function per query. Use transactions (`db.transaction()`) for multi-statement writes like saving an item with its options.
- **Few dependencies.** Fastify and its official plugins, plus better-sqlite3 and nothing else. Use `crypto` from Node for hashing and random ids.

## 3. Languages

| Code | Label | Locale (prices, formatting) | Notes |
|---|---|---|---|
| `de` | DE | `de-AT` | **Default** and required in admin forms. Use Austrian wording (Erdäpfel, Paradeiser…) |
| `en` | EN | `en-IE` | Optional |
| `el` | ΕΛ | `el-GR` | Optional |

- **Language choice order:** `?lang=` in the URL, then the saved choice (localStorage), then the browser language, then `de`.
- **Fallback when a translation is empty:** requested language → `de` → `en` → `el`.
- **Fonts** (Google Fonts, both include Greek): **Literata** for headings and prices, **Commissioner** for body text. Don't use Fraunces or Instrument Sans; they have no Greek letters.
- **UI strings** for the menu page (Options, Not available today, …) live in one JS dictionary per language, as in the prototype (`public/js/i18n.js`).
- **Admin UI** is also in DE/EN/EL, with its own switcher in the top bar and on the login card (`public/js/admin-i18n.js`). Its language is saved separately from the guest menu's (`admin-lang` vs `menu-lang` in localStorage), same choice order. The API's English error messages are translated in the browser. Content is still entered in all three languages, German required, and admin lists show the German names.
- Set `<html lang>` to the current language.

## 4. Brand

- Colours (from the old site and logo):
  - `--accent: #2E5B9D` (logo blue: headings, prices, buttons, header stripe)
  - `--sky: #007BBF` (old site blue: option badges)
  - `--ink: #212121` (text)
  - `--paper: #F3F7FB` (page background)
  - `--card: #FFFFFF`
  - `--line: #DBE4EE`
  - `--muted: #5D6570`
- **Logo:** `design/logo.png` is a placeholder (transparent PNG, cleaned from the image the owner supplied). The owner has a **final SVG** that will replace it at `public/img/logo.svg`. Reference the logo from one place so the swap is a one-line change.

## 5. Project layout

```
gyros-menu/
  package.json               // "type": "module", scripts: start, dev, test, hash-password
  src/
    server.js                // entry point: loads config, builds the app, listens
    app.js                   // buildApp(config) → Fastify instance (used by server.js and the tests)
    config.js                // reads env vars, validates them, defaults
    db/
      index.js               // opens better-sqlite3, pragmas, runs migrations
      migrations/001_init.sql
      menu.js                // queries: public menu
      admin.js               // queries: groups, items, options, settings
      sessions.js
      seed.js                // sample menu, development only
    routes/
      menu.js                // public
      auth.js
      admin.js               // groups, items, options, settings, images
    lib/
      password.js            // scrypt hash/verify
      images.js              // magic-byte check, save, delete
      schemas.js             // shared JSON Schemas (localizedText, item, group…)
    scripts/hash-password.js
  public/
    index.html               // menu page
    admin/index.html         // admin page (login + management)
    css/site.css             // shared styles from the prototype
    js/i18n.js               // LANGS, UI strings, tr(), money()
    js/menu.js
    js/admin.js
    img/logo.svg             // final logo (placeholder: logo.png)
  test/*.test.js
  Dockerfile
  docker-compose.yml
  .dockerignore
  .env.example
  README.md
```

## 6. Data model

`src/db/migrations/001_init.sql`:

```sql
CREATE TABLE menu_group (
  id          INTEGER PRIMARY KEY,
  name_de     TEXT NOT NULL,
  name_en     TEXT,
  name_el     TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_visible  INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE menu_item (
  id              INTEGER PRIMARY KEY,
  group_id        INTEGER NOT NULL REFERENCES menu_group(id) ON DELETE CASCADE,
  name_de         TEXT NOT NULL,
  name_en         TEXT,
  name_el         TEXT,
  desc_de         TEXT NOT NULL DEFAULT '',
  desc_en         TEXT,
  desc_el         TEXT,
  price_cents     INTEGER NOT NULL CHECK (price_cents BETWEEN 0 AND 100000),
  image_file      TEXT,                         -- file name only, e.g. "3f2a….jpg"
  is_available    INTEGER NOT NULL DEFAULT 1,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_item_group ON menu_item(group_id, sort_order);

CREATE TABLE item_option (
  id                 INTEGER PRIMARY KEY,
  item_id            INTEGER NOT NULL REFERENCES menu_item(id) ON DELETE CASCADE,
  name_de            TEXT NOT NULL,
  name_en            TEXT,
  name_el            TEXT,
  extra_price_cents  INTEGER NOT NULL DEFAULT 0,   -- 0 = included
  sort_order         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE site_settings (       -- single row, id = 1
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  restaurant_name TEXT NOT NULL DEFAULT 'Gyros Sta Adelfia',
  tagline_de      TEXT, tagline_en TEXT, tagline_el TEXT
);
INSERT INTO site_settings (id) VALUES (1);

CREATE TABLE session (
  id          TEXT PRIMARY KEY,     -- 32 random bytes, base64url
  expires_at  INTEGER NOT NULL      -- unix ms
);
```

Rules:
- **Pragmas** on open: `journal_mode = WAL`, `foreign_keys = ON` (required for the cascades), `busy_timeout = 5000`.
- **Migrations:** numbered `.sql` files, applied in order at startup inside a transaction, tracked with `PRAGMA user_version`. Never edit an applied file; add a new one.
- **API shape:** the db module maps columns to the API shape `{ name: { de, en, el } }`, so the rest of the code never sees `name_de` and the like.
- **Deleting a group** deletes its items and options (cascade). Delete their image files as well. The admin UI confirms first and shows the item count.
- **Sort order:** `sort_order` is per group for items and global for groups. Reorder endpoints rewrite it as 0..n from the list of ids sent, in one transaction.
- **Validation** (JSON Schema): `name.de` is required (1–120 characters); descriptions max 600 characters; prices are integers from 0 to 100,000; at most 20 options per item.
- **Seed data:** seed the sample menu only when the database is empty **and** `SEED_SAMPLE_DATA=true` (development only). The sample data is in the prototype's `sampleData()`.

## 7. API

All JSON. The public endpoints need no auth; `/api/admin/*` requires the admin cookie and returns **401** (not a redirect) when it's missing.

### Public
| Method | Path | Returns |
|---|---|---|
| GET | `/api/menu` | `{ settings, groups:[{ id, name:{de,en,el}, items:[{ id, name, description, priceCents, imageUrl, isAvailable, options:[{ name, extraPriceCents }] }] }] }`. Only visible groups that have at least one item, in sort order. Unavailable items are included (shown greyed out). Send `Cache-Control: public, max-age=60`. |

### Auth
| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/login` | `{ username, password }` → 204 and sets the cookie, or 401. Rate limited to 5 attempts per minute per IP. |
| POST | `/api/auth/logout` | 204 |
| GET | `/api/auth/me` | 200 `{ username }` or 401. The admin page calls this on load to show the login form or the dashboard. |

### Admin
| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/menu` | Everything, including hidden groups and unavailable items |
| POST | `/api/admin/groups` | Create → 201 with the group |
| PUT | `/api/admin/groups/:id` | Update name and visibility |
| DELETE | `/api/admin/groups/:id` | Cascade, also removes image files |
| PUT | `/api/admin/groups/order` | `{ ids:[…] }` |
| POST | `/api/admin/items` | Create, with options in the body |
| PUT | `/api/admin/items/:id` | Update; **replaces** the options list (delete missing, upsert sent) |
| DELETE | `/api/admin/items/:id` | Also deletes the image file |
| PUT | `/api/admin/groups/:groupId/items/order` | `{ ids:[…] }` |
| POST | `/api/admin/items/:id/image` | `multipart/form-data`, field `file` → `{ imageUrl }`. Replaces and deletes the old file. |
| DELETE | `/api/admin/items/:id/image` | |
| GET/PUT | `/api/admin/settings` | Restaurant name and tagline |

Fastify returns 400 with a message when a request fails its JSON Schema. Add a custom error handler that returns `{ errors: { "name.de": "…" } }` keyed by field, so the admin JS can show each message next to its field. Return 404 for unknown ids.

## 8. Auth and security

- **One admin account** from environment variables: `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH`.
  - The hash is made with `crypto.scrypt`, stored as `scrypt$N$r$p$salt$hash` (base64), and checked with `crypto.timingSafeEqual`.
  - `npm run hash-password -- '<pwd>'` prints the hash for the `.env` file. Never store the plain password.
- **Sessions:** on login, create a random id (`crypto.randomBytes(32)`) and store it in the `session` table with a 12 h expiry, extended on use.
  - Set it as cookie `gsa_admin`: `HttpOnly`, `Secure` (behind the proxy), `SameSite=Strict`, `Path=/`.
  - Logout deletes the row.
  - Delete expired rows at startup and once an hour.
- **Protecting `/api/admin/*`:** an `onRequest` hook checks the session and returns **401** if it's missing or expired.
- **Login rate limit:** `@fastify/rate-limit`, 5 attempts per minute per IP.
- **CSRF:** `SameSite=Strict` plus accepting only `application/json` (and `multipart/form-data` for the upload endpoint) on mutating admin endpoints. Fastify rejects other content types by default.
- **Proxy:** set `trustProxy: 1` (one hop, nginx; or the proxy's IP) in Fastify, so `request.ip` and `request.protocol` come from nginx's X-Forwarded headers. Not `true`: that trusts every X-Forwarded-For entry, so clients could fake their IP and get around the login rate limit.
- **Escaping:** the prototype renders text with an `esc()` helper. Keep it, or use `textContent`. Never put stored text into `innerHTML` unescaped.
- **Security headers:** `@fastify/helmet` with a CSP allowing self, `fonts.googleapis.com` and `fonts.gstatic.com`, and `img-src 'self' data: blob:`. As built: `script-src 'self'` (no inline scripts); `style-src-attr 'unsafe-inline'` only for the prototype's `style="…"` attributes, while `<style>` blocks stay blocked; `frame-ancestors 'none'`; `upgrade-insecure-requests` in production only.

## 9. Images

- **Client side:** before upload, resize to at most 1200 px on the long side and convert to JPEG at quality 0.82 with a canvas. The prototype has `resizeImage()`. This keeps files around 100–250 KB.
- **Server side:**
  - `@fastify/multipart` with `limits: { fileSize: 5 MB, files: 1 }`.
  - Accept JPEG, PNG and WebP, checked by **magic bytes** in the first 12 bytes, not by file name or content type:
    - JPEG: `FF D8 FF`
    - PNG: `89 50 4E 47`
    - WebP: `RIFF....WEBP`
  - Save as `{randomUUID}.{ext}` in `{DATA_DIR}/uploads`.
  - Write to a temp name first, then rename, so a failed upload never leaves a half-written file.
- **Serving:** serve at `/uploads/` with a second `@fastify/static` registration (`decorateReply: false`), with `Cache-Control: public, max-age=31536000, immutable`. A new upload gets a new file name, so long caching is safe.
- **Cleanup:** `lib/images.js` exports `saveImage(fileStream) → fileName` and `deleteImage(fileName)`. Delete files when an image is replaced, or its item or group is deleted, after the database change succeeds.
- **Optional later:** re-encode and strip EXIF on the server with `sharp`.

## 10. Frontend (from the prototype)

Split `design/prototype.html` into the files under `public/` (section 5). Changes:
- Replace `load()`/`save()` (localStorage) with `fetch` calls to the API. Keep localStorage **only** for the chosen language.
- **Menu page:** fetch `/api/menu` once and render it with the existing `renderMenu()`. Prices come as cents, so the `money()` formatter divides by 100.
- **Admin page:** on load, call `/api/auth/me`. If it returns 401, show a login form styled like the prototype's sheets; otherwise show the dashboard.
  - Remove the "Static demo / Reset demo data" banner.
  - Add a Log out button in the top bar.
  - Disable the Save button while a request is in flight.
  - Show server validation errors.
- **Admin item form:**
  - On a new item, save first (POST), then upload the image to the new id.
  - On an existing item, upload the image right away when one is picked.
- Group names are shown in German in the admin lists; the other two languages are listed in grey underneath, as in the prototype.
- The menu stays fully usable at 360 px wide. Check the sticky category chips and the item detail sheet on a phone.
- **No-JS fallback:** not needed for v1.

## 11. Configuration

Environment variables (`.env` file; `.env.example` in the repo). `src/config.js` validates them at startup and exits with a clear message if one is missing:

```
NODE_ENV=production
PORT=8080
HOST=0.0.0.0
DATA_DIR=/data                    # menu.db and uploads/; ./data in development
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=<from npm run hash-password>
SEED_SAMPLE_DATA=false
TRUST_PROXY=1                     # proxy hops; "true" would let clients fake X-Forwarded-For
```

For local development, `npm run dev` uses `node --watch --env-file=.env src/server.js`. Node reads `.env` itself, so there's no dotenv package.

## 12. Docker and deployment

- **Dockerfile** (multi-stage):
  - **Build stage:** `node:26-slim` plus `python3 make g++`, in case better-sqlite3 has no prebuilt binary for this Node version. Run `npm ci --omit=dev`.
  - **Runtime stage:** `node:26-slim`. Copy `node_modules`, `src` and `public`, run as the `node` user, and expose 8080.
  - Make sure `/data` is writable by `node`.
  - `CMD ["node", "src/server.js"]`
- **docker-compose.yml:**
  - Service `gyros-menu`, `restart: unless-stopped`.
  - Volume `./data:/data`, `env_file: .env`, port `127.0.0.1:8085:8080` (nginx proxies to it).
- **nginx:**
  - Proxy to `127.0.0.1:8085`.
  - Pass `X-Forwarded-For` and `X-Forwarded-Proto`.
  - `client_max_body_size 6m`.
  - `gzip on;` with `gzip_types image/svg+xml text/css application/javascript application/json;`. The menu is used mostly on phones over mobile data. The logo SVG drops from 112 KB to ~43 KB, and CSS/JS/JSON to about a third. JPEG/PNG/WebP are already compressed, so leave them out.
  - HTTPS (Let's Encrypt) on the public domain.
- **Backup:** run `sqlite3 data/menu.db ".backup backup.db"` (safe while the app runs) and copy the `data/uploads` folder. A nightly cron is enough.
- **Health check:** `GET /healthz` → 200 after running `SELECT 1`.

## 13. Build order

1. ✅ **Scaffold.**
   - Write `package.json` (ESM, Node >= 26 in `engines`), install Fastify and its plugins plus better-sqlite3.
   - Add `config.js`, plus `app.js`/`server.js` with `/healthz`.
   - Create `DATA_DIR` and `uploads/` at startup.

   *Done when* `npm run dev` serves `/healthz`.
2. ✅ **Database.**
   - Add `db/index.js` with the pragmas and the migration runner (`user_version`).
   - Add `001_init.sql` and the `site_settings` row.

   *Done when* a fresh start creates `menu.db` with the expected tables, and a second start doesn't re-run the migration.
3. ✅ **Seed data.** Port `sampleData()` from the prototype (DE/EN/EL, prices in cents), development only. *Done when* a fresh dev start has 3 groups and 7 items.
4. ✅ **Public menu API.** Add `GET /api/menu` with ordering, visibility rules and the cache header, plus a test with `fastify.inject()`. *Done when* `npm test` passes.
5. ✅ **Menu page.** Move the prototype's menu view, CSS and i18n into `public/`, wire it to `/api/menu`, and swap in the logo file. *Done when* the menu renders from the database in all 3 languages on a phone-width browser.
6. ✅ **Admin auth.**
   - Add `hash-password`, the scrypt helpers and sessions.
   - Add the login/logout/me endpoints, the rate limiter and the 401 hook.
   - Add tests: wrong password, protected endpoint without a cookie, and expired session.

   *Done when* the tests pass.
7. ✅ **Admin CRUD API.** Add groups, items with options (in a transaction), reorder and settings, with JSON Schemas and tests. *Done when* the tests cover create, update (replacing options), delete (cascade) and reorder.
8. ✅ **Images.**
   - Add `lib/images.js`, the upload and delete endpoints, magic-byte checks and file cleanup.
   - Add the `/uploads` static route with cache headers.
   - Add tests: rejecting a non-image, and that replacing an image deletes the old file.

   *Done when* the tests pass.
9. ✅ **Admin page.** Move the prototype's admin view, add login and logout, wire every action to the API, and show errors. *Done when* you can do the full flow in a browser: log in, add a group, add an item with an image and 2 options, reorder, hide, and see it all on the menu.
10. ✅ **Hardening.** Add helmet/CSP, `trustProxy`, the custom error handler (no stack traces in production), the session cleanup timer, and graceful shutdown (close the server, then the db, on SIGTERM).
11. ✅ **Docker.** Add the Dockerfile, compose file, `.env.example` and README (setup, hashing a password, backup). *Done when* `docker compose up` works with a fresh `./data`, and data survives a restart.
12. **Deploy.** Add the nginx site and HTTPS, set the real admin password, enter the real menu, and print a QR code pointing at the menu URL.

## 14. Open questions for the owner

- **Allergens:** Austrian menus usually show allergen letter codes (A–R). If wanted, add a multi-select of allergen codes per item and a legend on the menu (v1.1, or v1 if required).
- ~~**Admin language:**~~ decided: the admin page has a DE/EN/EL switcher.
- **Public domain/URL**, for the QR code and HTTPS.
- **Extra info on the menu page:** address, opening hours, phone? These could go in `SiteSettings`.
- **Final logo SVG:** replace `public/img/logo.svg`.
