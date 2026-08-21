-- The portal's D1 schema.
--
-- A straight lift of the SCHEMA string in server/db.mjs. It transfers without
-- edits because that string was written to be transferable: the two PRAGMAs the
-- local build wants (journal_mode, foreign_keys) are applied separately over
-- there, precisely so this file never has to carry a statement D1 rejects.
-- Keep it that way — anything added here must be plain SQLite DDL.
--
-- Every statement is IF NOT EXISTS, so re-applying the file against a live
-- database is a no-op rather than an error. That matters more here than it does
-- locally: `wrangler d1 execute --file=worker/schema.sql` is the only migration
-- path this project has, and it will be run again on databases that already
-- hold real projects.
--
-- Applied with:
--   npm run cf:schema                       (remote)
--   wrangler d1 execute project-portal --local --file=worker/schema.sql

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  -- Written by whichever build created the account, and the two do not agree.
  -- The Express build stores a bare scrypt hex digest; the Worker stores
  -- `pbkdf2-sha256$<iterations>$<hex>`, because scrypt does not exist on
  -- Workers. See worker/auth.ts — the self-describing prefix is what lets the
  -- Worker recognise a local hash and say so instead of reporting a wrong
  -- password for an account it simply cannot check.
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role          TEXT NOT NULL,
  name          TEXT NOT NULL,
  title         TEXT NOT NULL DEFAULT '',
  school        TEXT NOT NULL DEFAULT '',
  teaches       TEXT NOT NULL DEFAULT '',
  -- JSON text, not a child table. D1 charges per round trip and a join to read
  -- five tags is a poor trade; nothing ever filters on a tag in SQL.
  skills        TEXT NOT NULL DEFAULT '[]',
  background    TEXT NOT NULL DEFAULT '',
  past_projects TEXT NOT NULL DEFAULT '[]',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  client        TEXT NOT NULL DEFAULT '',
  nda_required  INTEGER NOT NULL DEFAULT 0,
  starts_on     TEXT NOT NULL DEFAULT '',
  ends_on       TEXT NOT NULL DEFAULT '',
  duration_note TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'available',
  skills        TEXT NOT NULL DEFAULT '[]',
  created_by    TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS projects_status ON projects (status);

CREATE TABLE IF NOT EXISTS interests (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  message    TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);

-- One lecturer, one expression of interest per project. Withdrawing deletes
-- the row, so re-expressing is an insert again rather than a state flip.
CREATE UNIQUE INDEX IF NOT EXISTS interests_unique
  ON interests (project_id, user_id);

CREATE INDEX IF NOT EXISTS interests_project ON interests (project_id);
CREATE INDEX IF NOT EXISTS interests_user ON interests (user_id);

-- Sessions were already a table rather than module memory in the Express build,
-- which is the one piece of the port that needed no thought at all: isolates
-- share no memory, so a login handled by one of them has to be visible to every
-- other, and it already was.
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_expires ON sessions (expires_at);
