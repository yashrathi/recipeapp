CREATE TABLE shopping_lists (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX shopping_lists_household_unique
  ON shopping_lists(household_id);

CREATE TABLE shopping_list_items (
  id TEXT PRIMARY KEY,
  shopping_list_id TEXT NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  quantity_note TEXT,
  price_status TEXT NOT NULL DEFAULT 'unchecked',
  provider_product_id TEXT,
  provider_spin_id TEXT,
  product_name TEXT,
  brand_name TEXT,
  pack_size TEXT,
  mrp REAL,
  offer_price REAL,
  available INTEGER,
  price_checked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX shopping_list_items_name_unique
  ON shopping_list_items(shopping_list_id, normalized_name);
