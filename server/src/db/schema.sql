-- Core relational data lives in PostgreSQL.
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('cashier', 'barista', 'manager')),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS menu_items (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  category    TEXT NOT NULL DEFAULT 'coffee',
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  active      BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS orders (
  id            SERIAL PRIMARY KEY,
  customer_name TEXT NOT NULL,
  notes         TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  total_cents   INTEGER NOT NULL CHECK (total_cents >= 0),
  created_by    INTEGER NOT NULL REFERENCES users(id),
  -- The barista who picked the order up, and the one who finished it.
  started_by    INTEGER REFERENCES users(id),
  completed_by  INTEGER REFERENCES users(id),
  cancelled_by  INTEGER REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  cancelled_at  TIMESTAMPTZ,
  CONSTRAINT completed_has_barista CHECK (status <> 'completed' OR (completed_by IS NOT NULL AND completed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status, created_at);
CREATE INDEX IF NOT EXISTS orders_completed_by_idx ON orders(completed_by);

CREATE TABLE IF NOT EXISTS order_items (
  id               SERIAL PRIMARY KEY,
  order_id         INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id     INTEGER NOT NULL REFERENCES menu_items(id),
  name             TEXT NOT NULL,
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  notes            TEXT
);

CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id);
