# Deploying the Gyros Sta Adelfia menu

This guide is for the person putting the menu site on a server. You don't need the source code
or Node.js: the app is a ready-made Docker image on Docker Hub,
**`skioulis/gyros-menu`**, and you only need the three files in the
[`deploy/`](deploy/) folder of this repository.

What you end up with:

- `https://<domain>/`: the public menu, opened by guests from a QR code on the table.
- `https://<domain>/admin`: the owner's page for editing the menu.
- Everything the owner enters (database and photos) in one folder on the server, `data/`.

## 1. What you need

- A Linux server (x86-64) with **Docker Engine** and the **Docker Compose plugin**
  (`docker compose version` should work).
- **nginx** on the same server, and **certbot** for the HTTPS certificate.
- A **domain or subdomain** (e.g. `menu.example.com`) whose DNS A/AAAA record points at the server.
- About 500 MB of disk for the image, plus room for the photos (roughly 200 KB each).

## 2. Get the files

```bash
sudo mkdir -p /srv/gyros-menu && sudo chown "$USER" /srv/gyros-menu
cd /srv/gyros-menu
curl -fsSLO https://raw.githubusercontent.com/Skioulis/StaAdelfia/main/deploy/docker-compose.yml
curl -fsSLO https://raw.githubusercontent.com/Skioulis/StaAdelfia/main/deploy/nginx-site.conf
curl -fsSL  https://raw.githubusercontent.com/Skioulis/StaAdelfia/main/deploy/.env.example -o .env.example
docker compose pull
```

## 3. Create the data folder

The app runs as user id 1000 inside the container and must be able to write here:

```bash
mkdir -p data
sudo chown 1000:1000 data
```

## 4. Set the admin password

Make a password for the owner (at least 10 characters) and turn it into a hash. The plain
password is never stored anywhere:

```bash
docker run --rm -it skioulis/gyros-menu:latest node src/scripts/hash-password.js
```

Type the password when asked. It prints a line starting with `ADMIN_PASSWORD_HASH='scrypt$…`.
Then create `.env` and paste that line in, replacing the empty `ADMIN_PASSWORD_HASH=`:

```bash
cp .env.example .env
nano .env
```

Keep the single quotes around the hash. The username is `ADMIN_USERNAME` (default `admin`).
Give the owner the username and password in person or by phone, not by email.

## 5. Start the app

```bash
docker compose up -d
docker compose ps                      # STATUS should become "healthy" within ~30 s
curl http://127.0.0.1:8085/healthz     # {"ok":true}
```

It only listens on `127.0.0.1:8085`, so it can't be reached from outside until nginx is set up.
`restart: unless-stopped` brings it back after a reboot.

If it doesn't start, see [Troubleshooting](#11-troubleshooting).

## 6. nginx and HTTPS

Edit `nginx-site.conf` and replace `menu.example.com` with the real domain (two places in the
comments, one in `server_name`). Then:

```bash
sudo cp nginx-site.conf /etc/nginx/sites-available/gyros-menu
sudo ln -s /etc/nginx/sites-available/gyros-menu /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d menu.example.com
```

certbot adds HTTPS and the redirect from http to https. Check:

- `https://menu.example.com/` shows the (empty) menu with the logo.
- `https://menu.example.com/admin` shows the login page.

**Important:** the admin login only works over **HTTPS**, because its cookie is marked Secure.
Over plain http the login seems to succeed but the page goes straight back to the login form.

## 7. Hand over to the owner

1. Log in at `https://<domain>/admin` (the language switcher DE / EN / ΕΛ is at the top).
2. **Kategorien / Groups**: create the menu sections (e.g. Gyros, Salads, Drinks).
3. **Artikel / Items**: add the dishes with name (German required, English and Greek optional),
   description, price, photo, options (e.g. "large portion +€2") and **allergens (A–R)**.
4. **Lokal / Restaurant**: restaurant name and tagline.

Changes appear on the public menu within a minute (the menu is cached for 60 s).

## 8. QR code

Make a QR code for `https://<domain>/` (any QR generator, or `qrencode -o menu-qr.png -s 12 https://<domain>/`)
and print it for the tables. To open the menu in a given language, use `https://<domain>/?lang=de`,
`?lang=en` or `?lang=el`; without it, the guest's phone language is used.

## 9. Backups

Everything is in `/srv/gyros-menu/data` (`menu.db` and `uploads/`). Back it up nightly. This copies
the database safely while the app is running (needs the `sqlite3` package):

```bash
sudo apt install sqlite3      # once
```

Add to `crontab -e`:

```cron
30 3 * * * cd /srv/gyros-menu && mkdir -p backup && sqlite3 data/menu.db ".backup backup/menu-$(date +\%F).db" && rsync -a data/uploads/ backup/uploads/ && find backup -name 'menu-*.db' -mtime +30 -delete
```

Keeps 30 days of database copies. Copy the `backup/` folder off the server too (another machine or
cloud storage).

**Restore:** `docker compose down`, put `menu.db` and `uploads/` back into `data/`, then
`docker compose up -d`.

## 10. Updates

When a new version is published:

```bash
cd /srv/gyros-menu
docker compose pull
docker compose up -d
```

Database changes are applied automatically when the app starts, and the data stays in `data/`.
Take a backup first (see above).

To pin a version, or go back to an older one, set it in `.env` and run `docker compose up -d`:

```
GYROS_IMAGE=skioulis/gyros-menu:1.0.0
```

Available versions: https://hub.docker.com/r/skioulis/gyros-menu/tags

## 11. Troubleshooting

| Problem | Cause and fix |
|---|---|
| Container stops right away | `docker compose logs`. The message says what is wrong, e.g. `ADMIN_PASSWORD_HASH is required in production` (step 4). |
| `Cannot use DATA_DIR /data: EACCES` | The data folder isn't writable by uid 1000: `sudo chown 1000:1000 data`. |
| `ADMIN_PASSWORD_HASH is not a valid scrypt hash` | The line was cut or the quotes are missing. Paste the whole line, with single quotes. |
| 502 Bad Gateway in the browser | The app isn't running (`docker compose ps`) or nginx points at the wrong port (must be `127.0.0.1:8085`). |
| Login form comes back after logging in | The site is opened over http, not https (step 6). |
| "Too many attempts" at login | 5 wrong passwords in a minute; wait one minute. |
| Photo upload fails with 413 | `client_max_body_size 6m;` is missing in the nginx site. |
| Forgot the admin password | Make a new hash (step 4), replace it in `.env`, then `docker compose up -d`. |

Logs: `docker compose logs -f` (one JSON line per request). Health: `curl http://127.0.0.1:8085/healthz`.
