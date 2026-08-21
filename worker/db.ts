/**
 * Everything the portal persists, ported from server/db.mjs to D1.
 *
 * The rules are the original's — read its comments for why each one exists;
 * only the runtime moved. What changed:
 *
 *  - Every method is async. node:sqlite was synchronous, so an Express route
 *    could treat a read as free and call three of them in a row without
 *    thinking. Here each one is a network round trip, which is why a few
 *    routes in index.ts batch or reuse a result the original re-read.
 *  - There is no `openDatabase(dir)`. D1 is a binding, already open, with no
 *    file to create and no PRAGMAs to apply — `createDb(env.DB)` is the whole
 *    of it, and the schema is applied out of band by `npm run cf:schema`.
 *
 * Everything else is deliberately identical, down to the column names, so that
 * a database dumped from one build restores into the other. The one exception
 * is password_hash, whose format differs by build; see worker/auth.ts.
 */

import type { InterestStatus, ProjectStatus, Role } from './constants';

/* ── Shapes handed out ─────────────────────────────────────────────────── */

export interface User {
  id: string;
  email: string;
  role: Role;
  name: string;
  title: string;
  school: string;
  teaches: string;
  skills: string[];
  background: string;
  pastProjects: string[];
  createdAt: string;
  updatedAt: string;
}

/** The raw row, password material included. Only `auth` should ever see this. */
export interface UserSecretRow {
  id: string;
  email: string;
  password_hash: string;
  password_salt: string;
  role: Role;
  name: string;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  client: string;
  ndaRequired: boolean;
  startsOn: string;
  endsOn: string;
  durationNote: string;
  status: ProjectStatus;
  skills: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Interest {
  id: string;
  projectId: string;
  userId: string;
  message: string;
  status: InterestStatus;
  createdAt: string;
}

export interface Session {
  token: string;
  userId: string;
  createdAt?: string;
  expiresAt: string;
}

export interface NewUser {
  email: string;
  passwordHash: string;
  passwordSalt: string;
  role: Role;
  name: string;
  title?: string;
  school?: string;
  teaches?: string;
  skills?: string[];
  background?: string;
  pastProjects?: string[];
}

export interface ProfilePatch {
  name?: string;
  title?: string;
  school?: string;
  teaches?: string;
  skills?: string[];
  background?: string;
  pastProjects?: string[];
}

export interface ProjectInput {
  title: string;
  description?: string;
  client?: string;
  ndaRequired?: boolean;
  startsOn?: string;
  endsOn?: string;
  durationNote?: string;
  status?: ProjectStatus;
  skills?: string[];
  createdBy?: string;
}

export type ProjectPatch = Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>>;

/* ── Rows as they come back ────────────────────────────────────────────── */

interface UserRow {
  id: string;
  email: string;
  role: Role;
  name: string;
  title: string;
  school: string;
  teaches: string;
  skills: string;
  background: string;
  past_projects: string;
  created_at: string;
  updated_at: string;
}

interface ProjectRow {
  id: string;
  title: string;
  description: string;
  client: string;
  nda_required: number;
  starts_on: string;
  ends_on: string;
  duration_note: string;
  status: ProjectStatus;
  skills: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface InterestRow {
  id: string;
  project_id: string;
  user_id: string;
  message: string;
  status: InterestStatus;
  created_at: string;
}

const nowIso = () => new Date().toISOString();
const newId = () => crypto.randomUUID();

/** JSON columns are parsed defensively: a malformed cell degrades to empty
 *  rather than taking down the request that happened to read it. */
function parseList(value: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(value ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function rowToUser(row: UserRow | null): User | null {
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

function rowToProject(row: ProjectRow | null): Project | null {
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

function rowToInterest(row: InterestRow | null): Interest | null {
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

/** Every user column except the password material — the shape `rowToUser` wants. */
const USER_COLS =
  'id, email, role, name, title, school, teaches, skills, background, past_projects, created_at, updated_at';

export function createDb(d1: D1Database) {
  const users = {
    /**
     * The row with its hash and salt, for `auth.login` and nothing else.
     *
     * Selected column by column rather than `SELECT *`, so that the one query
     * in the app that can leak password material has to name it out loud.
     */
    async findByEmailWithSecret(email: string): Promise<UserSecretRow | null> {
      return d1
        .prepare(
          'SELECT id, email, password_hash, password_salt, role, name FROM users WHERE email = ? COLLATE NOCASE',
        )
        .bind(String(email ?? '').trim())
        .first<UserSecretRow>();
    },

    async get(id: string): Promise<User | null> {
      const row = await d1
        .prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`)
        .bind(id)
        .first<UserRow>();
      return rowToUser(row);
    },

    async list(): Promise<User[]> {
      const { results } = await d1
        .prepare(`SELECT ${USER_COLS} FROM users ORDER BY name COLLATE NOCASE`)
        .all<UserRow>();
      return (results ?? []).map(rowToUser).filter((u): u is User => u !== null);
    },

    async create(input: NewUser): Promise<User | null> {
      const stamp = nowIso();
      const id = newId();

      await d1
        .prepare(
          `INSERT INTO users (
             id, email, password_hash, password_salt, role, name, title, school,
             teaches, skills, background, past_projects, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          String(input.email).trim(),
          input.passwordHash,
          input.passwordSalt,
          input.role,
          input.name,
          input.title ?? '',
          input.school ?? '',
          input.teaches ?? '',
          JSON.stringify(input.skills ?? []),
          input.background ?? '',
          JSON.stringify(input.pastProjects ?? []),
          stamp,
          stamp,
        )
        .run();

      return users.get(id);
    },

    /**
     * Profile fields only. Role and email are deliberately not patchable here:
     * one is a privilege boundary and the other is the login identity, and
     * neither belongs on the form a lecturer fills in about themselves.
     */
    async updateProfile(id: string, patch: ProfilePatch): Promise<User | null> {
      const current = await users.get(id);
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

      await d1
        .prepare(
          `UPDATE users SET
             name = ?, title = ?, school = ?, teaches = ?, skills = ?,
             background = ?, past_projects = ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(
          next.name,
          next.title,
          next.school,
          next.teaches,
          JSON.stringify(next.skills),
          next.background,
          JSON.stringify(next.pastProjects),
          nowIso(),
          id,
        )
        .run();

      return users.get(id);
    },

    async count(): Promise<number> {
      const row = await d1.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
      return row?.n ?? 0;
    },
  };

  const projects = {
    async list(): Promise<Project[]> {
      const { results } = await d1
        .prepare('SELECT * FROM projects ORDER BY created_at DESC')
        .all<ProjectRow>();
      return (results ?? []).map(rowToProject).filter((p): p is Project => p !== null);
    },

    async get(id: string): Promise<Project | null> {
      const row = await d1
        .prepare('SELECT * FROM projects WHERE id = ?')
        .bind(id)
        .first<ProjectRow>();
      return rowToProject(row);
    },

    async create(input: ProjectInput): Promise<Project | null> {
      const stamp = nowIso();
      const id = newId();

      await d1
        .prepare(
          `INSERT INTO projects (
             id, title, description, client, nda_required, starts_on, ends_on,
             duration_note, status, skills, created_by, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
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
        )
        .run();

      return projects.get(id);
    },

    async update(id: string, patch: ProjectPatch): Promise<Project | null> {
      const current = await projects.get(id);
      if (!current) return null;

      const next = { ...current, ...patch };

      await d1
        .prepare(
          `UPDATE projects SET
             title = ?, description = ?, client = ?, nda_required = ?,
             starts_on = ?, ends_on = ?, duration_note = ?, status = ?,
             skills = ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(
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
        )
        .run();

      return projects.get(id);
    },

    /**
     * The interests go with it, deleted explicitly.
     *
     * The local build does the same, and says why: D1 declares no foreign keys
     * and has no `PRAGMA foreign_keys = ON` to turn them on with, so a cascade
     * would be honoured by exactly one of the two runtimes. Batched here so the
     * pair is one round trip and cannot half-succeed.
     */
    async remove(id: string): Promise<boolean> {
      const [, deleted] = await d1.batch([
        d1.prepare('DELETE FROM interests WHERE project_id = ?').bind(id),
        d1.prepare('DELETE FROM projects WHERE id = ?').bind(id),
      ]);
      return (deleted.meta?.changes ?? 0) > 0;
    },

    async count(): Promise<number> {
      const row = await d1.prepare('SELECT COUNT(*) AS n FROM projects').first<{ n: number }>();
      return row?.n ?? 0;
    },
  };

  const interests = {
    /** Every row, for the admin's counts. Joined to projects/staff in the route. */
    async list(): Promise<Interest[]> {
      const { results } = await d1
        .prepare('SELECT * FROM interests ORDER BY created_at DESC')
        .all<InterestRow>();
      return (results ?? []).map(rowToInterest).filter((i): i is Interest => i !== null);
    },

    async listForProject(projectId: string): Promise<Interest[]> {
      const { results } = await d1
        .prepare('SELECT * FROM interests WHERE project_id = ? ORDER BY created_at DESC')
        .bind(projectId)
        .all<InterestRow>();
      return (results ?? []).map(rowToInterest).filter((i): i is Interest => i !== null);
    },

    async listForUser(userId: string): Promise<Interest[]> {
      const { results } = await d1
        .prepare('SELECT * FROM interests WHERE user_id = ? ORDER BY created_at DESC')
        .bind(userId)
        .all<InterestRow>();
      return (results ?? []).map(rowToInterest).filter((i): i is Interest => i !== null);
    },

    /**
     * Idempotent: expressing interest twice is the same single row, which is
     * what the unique index says and what a double-clicked button means.
     */
    async express({
      projectId,
      userId,
      message,
    }: {
      projectId: string;
      userId: string;
      message?: string;
    }): Promise<Interest> {
      const existing = await d1
        .prepare('SELECT * FROM interests WHERE project_id = ? AND user_id = ?')
        .bind(projectId, userId)
        .first<InterestRow>();

      if (existing) {
        if (message != null && message !== existing.message) {
          await d1
            .prepare('UPDATE interests SET message = ? WHERE id = ?')
            .bind(message, existing.id)
            .run();
          // The row is otherwise unchanged, so patch it in hand rather than
          // spending a round trip re-reading what we just wrote.
          return rowToInterest({ ...existing, message })!;
        }
        return rowToInterest(existing)!;
      }

      const row: InterestRow = {
        id: newId(),
        project_id: projectId,
        user_id: userId,
        message: message ?? '',
        status: 'pending',
        created_at: nowIso(),
      };

      await d1
        .prepare(
          `INSERT INTO interests (id, project_id, user_id, message, status, created_at)
           VALUES (?, ?, ?, ?, 'pending', ?)`,
        )
        .bind(row.id, row.project_id, row.user_id, row.message, row.created_at)
        .run();

      return rowToInterest(row)!;
    },

    async withdraw({
      projectId,
      userId,
    }: {
      projectId: string;
      userId: string;
    }): Promise<boolean> {
      const res = await d1
        .prepare('DELETE FROM interests WHERE project_id = ? AND user_id = ?')
        .bind(projectId, userId)
        .run();
      return (res.meta?.changes ?? 0) > 0;
    },

    async setStatus(id: string, status: InterestStatus): Promise<Interest | null> {
      const res = await d1
        .prepare('UPDATE interests SET status = ? WHERE id = ?')
        .bind(status, id)
        .run();
      if ((res.meta?.changes ?? 0) === 0) return null;

      const row = await d1
        .prepare('SELECT * FROM interests WHERE id = ?')
        .bind(id)
        .first<InterestRow>();
      return rowToInterest(row);
    },
  };

  const sessions = {
    async create({
      userId,
      token,
      ttlMs,
    }: {
      userId: string;
      token: string;
      ttlMs: number;
    }): Promise<Session> {
      const createdAt = nowIso();
      const expiresAt = new Date(Date.now() + ttlMs).toISOString();
      await d1
        .prepare(
          `INSERT INTO sessions (token, user_id, created_at, expires_at)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(token, userId, createdAt, expiresAt)
        .run();
      return { token, userId, createdAt, expiresAt };
    },

    /**
     * Null for both "no such token" and "expired", because a caller can do
     * nothing different about the two.
     *
     * The local build deletes the expired row on its way out. This one does
     * not: that would turn every authenticated request into a potential write,
     * and D1 sends writes to the primary. The hourly cron sweep collects them
     * instead — nothing reads an expired row in the meantime, since the query
     * below refuses it in SQL.
     */
    async get(token: string): Promise<Session | null> {
      const row = await d1
        .prepare('SELECT token, user_id, expires_at FROM sessions WHERE token = ? AND expires_at > ?')
        .bind(token, nowIso())
        .first<{ token: string; user_id: string; expires_at: string }>();
      if (!row) return null;
      return { token: row.token, userId: row.user_id, expiresAt: row.expires_at };
    },

    async destroy(token: string): Promise<void> {
      await d1.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    },

    async sweep(): Promise<void> {
      await d1.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(nowIso()).run();
    },
  };

  return { d1, users, projects, interests, sessions };
}

export type Db = ReturnType<typeof createDb>;
