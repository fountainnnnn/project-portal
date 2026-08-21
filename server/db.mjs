import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Everything the portal persists, in one SQLite file.
 *
 * node:sqlite ships with Node, so the local install stays dependency-free —
 * the same choice the photo booth made, and for the same reason.
 *
 * Two shapes here exist because of where this is going. Cloudflare D1 is
 * SQLite too, but it has no PRAGMA support and every call is async, so:
 *
 *  - The schema below is kept free of anything D1 cannot express. The pragmas
 *    are applied separately, not as part of the table definitions.
 *  - List-shaped fields (a project's skill tags, a lecturer's past projects)
 *    are JSON text in one column rather than child tables. D1 charges per
 *    round trip and a join to read five tags is a poor trade; nothing in the
 *    portal ever queries "all projects with tag X" in SQL — that filter runs
 *    client-side over an already-loaded list.
 *
 * The store API is synchronous here. `worker/db.ts` presents the same method
 * names returning promises; `worker/CONTRACTS.md` is the agreement between
 * them.
 */

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    role          TEXT NOT NULL,
    name          TEXT NOT NULL,
    title         TEXT NOT NULL DEFAULT '',
    school        TEXT NOT NULL DEFAULT '',
    teaches       TEXT NOT NULL DEFAULT '',
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

  -- Sessions live in the database, not in module memory as the booth's did.
  -- The booth restarted between events and nobody minded re-entering a shared
  -- password; here a restart would sign out every lecturer mid-browse, and on
  -- Workers there is no module memory to hold them in anyway.
  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS sessions_expires ON sessions (expires_at);
`;

const nowIso = () => new Date().toISOString();
const newId = () => crypto.randomUUID();

/** JSON columns are parsed defensively: a malformed cell degrades to empty
 *  rather than taking down the request that happened to read it. */
function parseList(value) {
  try {
    const parsed = JSON.parse(value ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    name: row.name,
    title: row.title,
    school: row.school,
    teaches: row.teaches,
    skills: parseList(row.skills),
    background: row.background,
    pastProjects: parseList(row.past_projects),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToProject(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    client: row.client,
    ndaRequired: row.nda_required === 1,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    durationNote: row.duration_note,
    status: row.status,
    skills: parseList(row.skills),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToInterest(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function openDatabase(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'project-portal.db');
  const db = new DatabaseSync(file);
  // Applied apart from SCHEMA so that the schema string stays portable to D1,
  // which rejects PRAGMA outright.
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);

  const users = {
    /** The full row, password material included. Only `auth` should call this. */
    findByEmailWithSecret(email) {
      return db
        .prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE')
        .get(String(email ?? '').trim());
    },

    get(id) {
      return rowToUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
    },

    list() {
      return db
        .prepare('SELECT * FROM users ORDER BY name COLLATE NOCASE')
        .all()
        .map(rowToUser);
    },

    create({ email, passwordHash, passwordSalt, role, name, ...profile }) {
      const stamp = nowIso();
      const user = {
        id: newId(),
        email: String(email).trim(),
        passwordHash,
        passwordSalt,
        role,
        name,
        title: profile.title ?? '',
        school: profile.school ?? '',
        teaches: profile.teaches ?? '',
        skills: profile.skills ?? [],
        background: profile.background ?? '',
        pastProjects: profile.pastProjects ?? [],
      };

      db.prepare(`
        INSERT INTO users (
          id, email, password_hash, password_salt, role, name, title, school,
          teaches, skills, background, past_projects, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        user.id, user.email, user.passwordHash, user.passwordSalt, user.role,
        user.name, user.title, user.school, user.teaches,
        JSON.stringify(user.skills), user.background,
        JSON.stringify(user.pastProjects), stamp, stamp,
      );

      return users.get(user.id);
    },

    /**
     * Profile fields only. Role and email are deliberately not patchable here:
     * one is a privilege boundary and the other is the login identity, and
     * neither belongs on the form a lecturer fills in about themselves.
     */
    updateProfile(id, patch) {
      const current = users.get(id);
      if (!current) return null;

      const next = {
        name: patch.name ?? current.name,
        title: patch.title ?? current.title,
        school: patch.school ?? current.school,
        teaches: patch.teaches ?? current.teaches,
        skills: patch.skills ?? current.skills,
        background: patch.background ?? current.background,
        pastProjects: patch.pastProjects ?? current.pastProjects,
      };

      db.prepare(`
        UPDATE users SET
          name = ?, title = ?, school = ?, teaches = ?, skills = ?,
          background = ?, past_projects = ?, updated_at = ?
        WHERE id = ?
      `).run(
        next.name, next.title, next.school, next.teaches,
        JSON.stringify(next.skills), next.background,
        JSON.stringify(next.pastProjects), nowIso(), id,
      );

      return users.get(id);
    },

    count() {
      return db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    },
  };

  const projects = {
    list() {
      return db
        .prepare('SELECT * FROM projects ORDER BY created_at DESC')
        .all()
        .map(rowToProject);
    },

    get(id) {
      return rowToProject(db.prepare('SELECT * FROM projects WHERE id = ?').get(id));
    },

    create(input) {
      const stamp = nowIso();
      const id = newId();

      db.prepare(`
        INSERT INTO projects (
          id, title, description, client, nda_required, starts_on, ends_on,
          duration_note, status, skills, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        input.title,
        input.description ?? '',
        input.client ?? '',
        input.ndaRequired ? 1 : 0,
        input.startsOn ?? '',
        input.endsOn ?? '',
        input.durationNote ?? '',
        input.status ?? 'available',
        JSON.stringify(input.skills ?? []),
        input.createdBy ?? '',
        stamp,
        stamp,
      );

      return projects.get(id);
    },

    update(id, patch) {
      const current = projects.get(id);
      if (!current) return null;

      const next = { ...current, ...patch };

      db.prepare(`
        UPDATE projects SET
          title = ?, description = ?, client = ?, nda_required = ?,
          starts_on = ?, ends_on = ?, duration_note = ?, status = ?,
          skills = ?, updated_at = ?
        WHERE id = ?
      `).run(
        next.title,
        next.description,
        next.client,
        next.ndaRequired ? 1 : 0,
        next.startsOn,
        next.endsOn,
        next.durationNote,
        next.status,
        JSON.stringify(next.skills ?? []),
        nowIso(),
        id,
      );

      return projects.get(id);
    },

    remove(id) {
      // The interests go with it. Without foreign keys on D1 this has to be
      // explicit, so it is explicit here too rather than relying on a cascade
      // that only one of the two runtimes would honour.
      db.prepare('DELETE FROM interests WHERE project_id = ?').run(id);
      const info = db.prepare('DELETE FROM projects WHERE id = ?').run(id);
      return info.changes > 0;
    },

    count() {
      return db.prepare('SELECT COUNT(*) AS n FROM projects').get().n;
    },
  };

  const interests = {
    /** Every row, for the admin's roster. Joined to the project list in the route. */
    list() {
      return db
        .prepare('SELECT * FROM interests ORDER BY created_at DESC')
        .all()
        .map(rowToInterest);
    },

    listForProject(projectId) {
      return db
        .prepare('SELECT * FROM interests WHERE project_id = ? ORDER BY created_at DESC')
        .all(projectId)
        .map(rowToInterest);
    },

    listForUser(userId) {
      return db
        .prepare('SELECT * FROM interests WHERE user_id = ? ORDER BY created_at DESC')
        .all(userId)
        .map(rowToInterest);
    },

    /**
     * Idempotent: expressing interest twice is the same single row, which is
     * what the unique index says and what a double-clicked button means.
     */
    express({ projectId, userId, message }) {
      const existing = db
        .prepare('SELECT * FROM interests WHERE project_id = ? AND user_id = ?')
        .get(projectId, userId);

      if (existing) {
        if (message != null && message !== existing.message) {
          db.prepare('UPDATE interests SET message = ? WHERE id = ?').run(message, existing.id);
        }
        return rowToInterest(
          db.prepare('SELECT * FROM interests WHERE id = ?').get(existing.id),
        );
      }

      const id = newId();
      db.prepare(`
        INSERT INTO interests (id, project_id, user_id, message, status, created_at)
        VALUES (?, ?, ?, ?, 'pending', ?)
      `).run(id, projectId, userId, message ?? '', nowIso());

      return rowToInterest(db.prepare('SELECT * FROM interests WHERE id = ?').get(id));
    },

    withdraw({ projectId, userId }) {
      const info = db
        .prepare('DELETE FROM interests WHERE project_id = ? AND user_id = ?')
        .run(projectId, userId);
      return info.changes > 0;
    },

    setStatus(id, status) {
      const info = db.prepare('UPDATE interests SET status = ? WHERE id = ?').run(status, id);
      if (info.changes === 0) return null;
      return rowToInterest(db.prepare('SELECT * FROM interests WHERE id = ?').get(id));
    },
  };

  const sessions = {
    create({ userId, token, ttlMs }) {
      const stamp = nowIso();
      const expiresAt = new Date(Date.now() + ttlMs).toISOString();
      db.prepare(`
        INSERT INTO sessions (token, user_id, created_at, expires_at)
        VALUES (?, ?, ?, ?)
      `).run(token, userId, stamp, expiresAt);
      return { token, userId, createdAt: stamp, expiresAt };
    },

    /** Null for both "no such token" and "expired", because a caller can do
     *  nothing different about the two. */
    get(token) {
      const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
      if (!row) return null;
      if (Date.now() > new Date(row.expires_at).getTime()) {
        db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
        return null;
      }
      return { token: row.token, userId: row.user_id, expiresAt: row.expires_at };
    },

    destroy(token) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    },

    sweep() {
      db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(nowIso());
    },
  };

  return { db, users, projects, interests, sessions };
}
