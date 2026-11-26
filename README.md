# Gyros Sta Adelfia: menu website

A small menu site with two pages:

- **`/`**: the public menu for guests (mostly on phones, via a QR code), in German, English and Greek.
- **`/admin`**: a password-protected page where the owner manages groups, items, options, photos and the tagline.

Node.js 26 + Fastify 5 + SQLite (better-sqlite3). Plain HTML/CSS/JS, no build step. The full spec is in `CLAUDE.md`.

## Run it with Docker (production)

You need Docker with the Compose plugin.

1. **Create the data folder.** It holds the database and the uploaded photos. The container runs as uid 1000, so the folder must be writable by that user:

   ```bash
   mkdir -p data
   sudo chown 1000:1000 data    # only needed if your own uid is not 1000 (check with: id -u)
   ```

2. **Create `.env`** and set the admin password (see [Admin password](#admin-password)):

   ```bash
   cp .env.example .env
   ```

3. **Start it:**

   ```bash
   docker compose up -d --build
   ```

   The app listens on `127.0.0.1:8085` only, so put nginx in front of it ([nginx](#nginx)). Check it with `curl http://127.0.0.1:8085/healthz`.

Useful commands:

```bash
docker compose logs -f          # follow the logs
docker compose restart          # restart (data in ./data is kept)
docker compose down             # stop and remove the container (data in ./data is kept)
docker compose up -d --build    # rebuild after an update
```

In production the database starts empty. Log in at `/admin` and enter the menu.

## Admin password

The password itself is never stored; only a scrypt hash goes in `.env`.

```bash
npm run hash-password
```

Type the password when asked (at least 10 characters). It prints a line like
`ADMIN_PASSWORD_HASH='scrypt$131072$8$1$…'`. Paste that line into `.env`, keeping the single
quotes because the hash contains `$` signs. Then restart: `docker compose up -d`.

You can also pass the password as an argument, `npm run hash-password -- 'my password'`, but then it
ends up in your shell history. Without Node on the server, run it in the image:

```bash
docker compose run --rm --no-deps gyros-menu node src/scripts/hash-password.js
```

The username is `ADMIN_USERNAME` in `.env` (default `admin`). Five wrong logins within a minute
block further attempts from that IP for the rest of the minute.

## Configuration (`.env`)

| Variable | Default | Meaning |
|---|---|---|
| `ADMIN_USERNAME` | `admin` | Admin login name |
| `ADMIN_PASSWORD_HASH` | (none) | From `npm run hash-password`. Required in production; without it, login is disabled |
| `TRUST_PROXY` | `1` | Number of proxies in front (nginx = 1). Don't use `true`: it lets clients fake their IP |
| `SEED_SAMPLE_DATA` | `false` | Sample menu on an empty database, development only |
| `NODE_ENV`, `PORT`, `HOST`, `DATA_DIR` | | Fixed by `docker-compose.yml` in Docker; set them for local development |

The server checks these at startup and exits with a clear message if something is wrong.

## nginx

Proxy the public domain to the container, with HTTPS (Let's Encrypt):

```nginx
server {
    server_name menu.example.com;

    client_max_body_size 6m;   # photo uploads (the app accepts up to 5 MB)

    gzip on;
    gzip_types image/svg+xml text/css application/javascript application/json;

    location / {
        proxy_pass http://127.0.0.1:8085;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # listen 443 ssl; ... (added by certbot)
}
```

## Backup

Everything is in the data folder: `data/menu.db` and `data/uploads/`. To make a consistent copy
of the database while the app is running:

```bash
sqlite3 data/menu.db ".backup backup/menu-$(date +%F).db"
cp -r data/uploads backup/
```

A nightly cron job is enough, for example (`crontab -e`):

```cron
30 3 * * * cd /srv/gyros-menu && mkdir -p backup && sqlite3 data/menu.db ".backup backup/menu-$(date +\%F).db" && rsync -a data/uploads/ backup/uploads/
```

To restore, stop the app, put `menu.db` and `uploads/` back into `data/`, and start it again.

## Local development

Needs Node.js 26 (for example via nvm).

```bash
npm install
cp .env.example .env
```

In `.env` set `NODE_ENV=development`, `DATA_DIR=./data`, `SEED_SAMPLE_DATA=true` and an
`ADMIN_PASSWORD_HASH`. Then:

```bash
npm run dev     # http://localhost:8080 and http://localhost:8080/admin, restarts on changes
npm test        # node --test, about 55 tests
```

npm 11 blocks dependency install scripts unless they are allowed. better-sqlite3 needs its install
script (it builds the SQLite binding), so it is listed under `allowScripts` in `package.json`.
After upgrading better-sqlite3, allow the new version: `npm install-scripts approve better-sqlite3`.

## Project layout

```
src/server.js        entry point: config, database, graceful shutdown
src/app.js           buildApp(): plugins, security headers, routes (used by the tests)
src/config.js        environment variables, validated at startup
src/db/              SQLite: migrations, queries, sessions, sample data
src/routes/          menu (public), auth, admin
src/lib/             password hashing, image upload checks, schemas, errors
public/              menu page, admin page, CSS, JS, logo (img/logo.svg)
test/                node --test with fastify.inject()
```

The logo is `public/img/logo.svg`. Replacing that file changes it on both pages.
