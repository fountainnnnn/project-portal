# Worker module contracts

The Cloudflare port of `server/`. Each module below is written against these
signatures; `worker/index.ts` wires them together and owns every route.

The behaviour being ported is specified by the Express originals in `server/`,
whose comments explain *why* each rule exists. Read the original before
rewriting a piece of it — the reasoning still applies even though the runtime
does not. `server/*.mjs` is frozen; this side adapts to it, never the reverse.

The binding contract with the frontend is stricter than any of the signatures
here: the deployed Worker must be indistinguishable from the Express server to
`src/lib/api.ts` — same paths, same status codes, same JSON, same `dsac_portal`
cookie. See `docs/FRONTEND_CONTRACTS.md` §4.

---

## What had to change, and why

| Express | Worker | Because |
|---|---|---|
| `node:sqlite`, synchronous | D1, every call async | D1 is a network round trip |
| `openDatabase(dir)` creates a file, applies PRAGMAs | `createDb(env.DB)` | D1 has no file and rejects `PRAGMA`; the schema is applied out of band by `npm run cf:schema` |
| `crypto.scryptSync` | PBKDF2-SHA-256 over WebCrypto | scrypt is node-only and nodejs_compat does not supply it. **Hashes are not portable between the builds** — see `worker/auth.ts` |
| Cookie `secure: false` | `Secure` set | a Worker origin is always https; localhost is not |
| `ensureSeedAccounts` at boot | `POST /api/setup` | there is no boot |
| `setInterval` session sweep | cron trigger, hourly | there is no long-lived process |
| `express.static` + catch-all `sendFile` | `ASSETS` binding, SPA fallback in `wrangler.jsonc` | there is no filesystem |
| `process.env`, `.env` parsed by hand | `Env` bindings and secrets | there is no `process` |

Everything else — validation, status codes, error strings, role shaping — is the
original's, deliberately unchanged.

---

## `worker/env.ts`

```ts
export interface Env {
  DB: D1Database;        // users, projects, interests, sessions
  ASSETS: Fetcher;       // the built SPA in dist/

  AI_PROVIDER?: string;  // 'deepseek' (default) | 'openai'
  AI_MODEL?: string;
  AI_BASE_URL?: string;
  DEEPSEEK_API_KEY?: string;   // secret
  OPENAI_API_KEY?: string;     // secret

  SEED_ADMIN_EMAIL?: string;
  SEED_ADMIN_PASSWORD?: string;   // secret; no default — setup refuses without it
  SEED_STAFF_EMAIL?: string;
  SEED_STAFF_PASSWORD?: string;   // secret
}
```

## `worker/constants.ts`

A typed copy of `server/constants.mjs` — `SP_SCHOOLS`, `PROJECT_STATUSES`,
`INTEREST_STATUSES`, `ROLES`, `UNDISCLOSED_CLIENT`, plus the string-union types
derived from them. A copy rather than an import, because `server/` is a frozen
untyped ESM tree that has no business in the Worker bundle; that makes it a file
that can drift, so change both in the same commit.

## `worker/db.ts`

Ports `server/db.mjs`. Same method names, same column names, same JSON columns.
Every method is async — the single biggest difference from the original.

```ts
export function createDb(d1: D1Database): {
  users: {
    /** The row with hash and salt. Only `auth.login` may call this. */
    findByEmailWithSecret(email: string): Promise<UserSecretRow | null>;
    get(id: string): Promise<User | null>;
    list(): Promise<User[]>;                                   // ordered by name, NOCASE
    create(input: NewUser): Promise<User | null>;
    /** Profile fields only. Role and email are not patchable here. */
    updateProfile(id: string, patch: ProfilePatch): Promise<User | null>;
    count(): Promise<number>;
  };
  projects: {
    list(): Promise<Project[]>;                                // newest first
    get(id: string): Promise<Project | null>;
    create(input: ProjectInput): Promise<Project | null>;
    update(id: string, patch: ProjectPatch): Promise<Project | null>;
    /** Deletes the project's interests too, in one batch. No cascade on D1. */
    remove(id: string): Promise<boolean>;
    count(): Promise<number>;
  };
  interests: {
    list(): Promise<Interest[]>;
    listForProject(projectId: string): Promise<Interest[]>;
    listForUser(userId: string): Promise<Interest[]>;
    /** Idempotent — one row per (project, user), message updated in place. */
    express(input: { projectId: string; userId: string; message?: string }): Promise<Interest>;
    withdraw(input: { projectId: string; userId: string }): Promise<boolean>;
    setStatus(id: string, status: InterestStatus): Promise<Interest | null>;
  };
  sessions: {
    create(input: { userId: string; token: string; ttlMs: number }): Promise<Session>;
    /** Null for both "no such token" and "expired". Never writes. */
    get(token: string): Promise<Session | null>;
    destroy(token: string): Promise<void>;
    sweep(): Promise<void>;                                    // called from cron
  };
};
```

`User` never carries password material — `USER_COLS` names its columns so the
one query that can leak it has to ask out loud.

## `worker/auth.ts`

Ports `server/auth.mjs`. Per-user email and password, sessions in D1, token in
an HttpOnly cookie named `dsac_portal` with a 7-day life.

```ts
export type Ctx = { Bindings: Env; Variables: { user: User } };   // hono

/** PBKDF2-SHA-256, 150k iterations. Returns `pbkdf2-sha256$<iterations>$<hex>`. */
export function hashPassword(password: string, salt?: string):
  Promise<{ salt: string; hash: string }>;

export function createAuth(db: Db, env: Env): {
  /** Null on any failure — one answer for wrong password, unknown email, and
   *  a hash this build cannot verify. The third is logged, never returned. */
  login(input: { email: string; password: string }): Promise<{ token: string; user: User | null } | null>;
  logout(c: Context<Ctx>): Promise<void>;
  userFor(c: Context<Ctx>): Promise<User | null>;
  setCookie(c: Context<Ctx>, token: string): void;    // HttpOnly; SameSite=Lax; Secure
  clearCookie(c: Context<Ctx>): void;
  requireUser: MiddlewareHandler<Ctx>;                // 401, then c.set('user', …)
  requireAdmin: MiddlewareHandler<Ctx>;               // 401 / 403
  sweepSessions(): Promise<void>;
  COOKIE: string;
};
```

**Password hashes are not portable between the two builds.** scrypt does not
exist on Workers, so this side uses PBKDF2 and an account seeded locally cannot
sign in here (or the reverse). The stored hash is self-describing, so the
mismatch is logged as itself rather than reported as a wrong password. The
module header and the README say the same thing at more length.

## `worker/ai.ts`

Ports `server/ai.mjs`. One `/chat/completions` call and a table of provider
differences; `AI_PROVIDER` picks a row. Built per request from `Env`, so a new
secret takes effect without a redeploy.

```ts
export function createSkillSuggester(env: Env): {
  /** Never throws. `ok: false` carries a message the form can show. */
  suggest(description: unknown, opts?: { signal?: AbortSignal }): Promise<SuggestResult>;
  /** { provider, model, configured } — what /api/meta reports. */
  describe(): AiDescription;
};

/** Exported for the same reason the original exported it: model output is
 *  untrusted and the parser is the interesting part. */
export function parseTags(raw: unknown): string[];
```

## `worker/seed.ts`

Ports `server/seed.mjs`, moved behind `POST /api/setup`.

```ts
export function runSetup(db: Db, env: Env): Promise<
  | { ok: true; created: { role: Role; email: string }[]; projects: number }
  | { ok: false; status: 403 | 409; error: string }
>;
```

403 when `SEED_ADMIN_PASSWORD` is unset (there is no default on this build);
409 once any user exists. Passwords are never echoed in the response. Sample
projects are added only when the project table is completely empty.

## `worker/index.ts`

The Hono app and the default export (`fetch` + `scheduled`). Every route in
`docs/FRONTEND_CONTRACTS.md` §4, plus `POST /api/setup`. An unmatched `/api/*`
is a JSON 404; everything else goes to `ASSETS`.
