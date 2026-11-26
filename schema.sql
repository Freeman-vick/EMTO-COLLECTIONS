CREATE TABLE IF NOT EXISTS emto_inventory (
  id integer PRIMARY KEY CHECK (id = 1),
  products jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO emto_inventory (id, products)
VALUES (1, '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS emto_admin_login_attempts (
  ip_hash text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0
);
