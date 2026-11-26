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
  image_file      TEXT,
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
  extra_price_cents  INTEGER NOT NULL DEFAULT 0,
  sort_order         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE site_settings (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  restaurant_name TEXT NOT NULL DEFAULT 'Gyros Sta Adelfia',
  tagline_de      TEXT, tagline_en TEXT, tagline_el TEXT
);
INSERT INTO site_settings (id) VALUES (1);

CREATE TABLE session (
  id          TEXT PRIMARY KEY,
  expires_at  INTEGER NOT NULL
);
