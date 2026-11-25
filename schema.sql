-- Myo Family Health — courses, shop, members and newsletter
--
-- Apply with:
--   npx wrangler d1 execute myo-courses --remote --file=schema.sql
--
-- Holds no card or payment data, ever. Payments happen on the
-- checkout provider's own pages; this database only records that
-- someone has access to a course.

CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS courses (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  slug             TEXT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  subtitle         TEXT NOT NULL DEFAULT '',
  description      TEXT NOT NULL DEFAULT '',      -- Markdown
  outcomes         TEXT NOT NULL DEFAULT '[]',    -- JSON array: "What you'll learn"
  category_id      INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  audience         TEXT NOT NULL DEFAULT 'families', -- adults | kids | families | professionals
  level            TEXT NOT NULL DEFAULT 'beginner', -- beginner | intermediate | advanced
  price_cents      INTEGER NOT NULL DEFAULT 0,    -- 0 = free course
  compare_at_cents INTEGER NOT NULL DEFAULT 0,    -- optional "was" price
  cover_url        TEXT NOT NULL DEFAULT '',
  accent           TEXT NOT NULL DEFAULT 'teal',  -- teal | sage | sand | slate | clay
  instructor       TEXT NOT NULL DEFAULT '',
  checkout_url     TEXT NOT NULL DEFAULT '',      -- SamCart checkout page URL
  samcart_product_id TEXT NOT NULL DEFAULT '',    -- SamCart product ID(s), comma-separated
  status           TEXT NOT NULL DEFAULT 'draft', -- draft | published
  featured         INTEGER NOT NULL DEFAULT 0,
  sort             INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_courses_status ON courses (status, sort);

CREATE TABLE IF NOT EXISTS lessons (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id      INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  section        TEXT NOT NULL DEFAULT '',        -- groups lessons into modules
  title          TEXT NOT NULL,
  summary        TEXT NOT NULL DEFAULT '',
  body           TEXT NOT NULL DEFAULT '',        -- Markdown
  video_url      TEXT NOT NULL DEFAULT '',        -- YouTube / Vimeo / Loom / .mp4
  download_url   TEXT NOT NULL DEFAULT '',
  download_label TEXT NOT NULL DEFAULT '',
  duration_min   INTEGER NOT NULL DEFAULT 0,
  is_preview     INTEGER NOT NULL DEFAULT 0,      -- 1 = free sample anyone can watch
  sort           INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_lessons_course ON lessons (course_id, sort);

CREATE TABLE IF NOT EXISTS products (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  tagline      TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL DEFAULT '',          -- Markdown
  kind         TEXT NOT NULL DEFAULT 'digital',   -- digital | physical | bundle | session
  price_cents  INTEGER NOT NULL DEFAULT 0,
  image_url    TEXT NOT NULL DEFAULT '',
  checkout_url TEXT NOT NULL DEFAULT '',          -- SamCart checkout page URL
  samcart_product_id TEXT NOT NULL DEFAULT '',    -- SamCart product ID(s), comma-separated
  course_ids   TEXT NOT NULL DEFAULT '[]',        -- JSON: courses a bundle unlocks
  status       TEXT NOT NULL DEFAULT 'draft',
  sort         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS enrollments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id  INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  course_id  INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  source     TEXT NOT NULL DEFAULT 'admin',       -- admin | purchase | free
  created_at TEXT NOT NULL,
  UNIQUE (member_id, course_id)
);

CREATE TABLE IF NOT EXISTS progress (
  member_id    INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  lesson_id    INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  completed_at TEXT NOT NULL,
  PRIMARY KEY (member_id, lesson_id)
);

-- One-time sign-in links. Only a SHA-256 of the token is stored,
-- so a leaked database cannot be used to sign in as anyone.
CREATE TABLE IF NOT EXISTS login_tokens (
  token_hash TEXT PRIMARY KEY,
  member_id  INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used_at    TEXT
);

-- Newsletter sign-ups collected on the site until the email
-- system is connected; then they sync across.
CREATE TABLE IF NOT EXISTS subscribers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL DEFAULT '',
  source     TEXT NOT NULL DEFAULT 'site',
  created_at TEXT NOT NULL,
  synced_at  TEXT
);

-- Failed logins (owner dashboard and sign-in links), for rate limits.
CREATE TABLE IF NOT EXISTS attempts (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,       -- admin_login | link_request
  key  TEXT NOT NULL DEFAULT '',
  at   TEXT NOT NULL,
  ok   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempts ON attempts (kind, at DESC);

-- Every SamCart notification received, so purchases can be audited and
-- the payload format checked. Card data is never sent by SamCart here.
CREATE TABLE IF NOT EXISTS payment_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT NOT NULL,
  provider    TEXT NOT NULL DEFAULT 'samcart',
  event_type  TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  product_ids TEXT NOT NULL DEFAULT '[]',
  result      TEXT NOT NULL DEFAULT '',   -- what the site did: granted / revoked / no match / ignored
  payload     TEXT NOT NULL DEFAULT ''    -- raw notification, trimmed
);
CREATE INDEX IF NOT EXISTS idx_payment_events ON payment_events (received_at DESC);
