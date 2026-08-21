import type { Context, MiddlewareHandler } from 'hono';
import type { Db, User } from './db';
import type { Env } from './env';

/**
 * Email and password against the `users` table, ported from server/auth.mjs.
 *
 * The scheme is the original's and the shape of it is unchanged: a per-user
 * salt, a slow hash compared in constant time, and a session token of 32 random
 * bytes in an HttpOnly cookie stored server-side, so signing out is a delete
 * rather than a hope. Still no password reset, no lockout, no email
 * verification — accounts are made by an administrator, which is how DSAC
 * works, and each of those features needs a mail path this app does not have.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE ONE THING THAT DID NOT SURVIVE THE PORT: password hashes
 *
 * `crypto.scryptSync` is a node:crypto exclusive. It is not in WebCrypto, it is
 * not polyfilled by nodejs_compat, and there is no way to compute an scrypt
 * digest inside a Worker without shipping a WASM implementation. So this build
 * derives keys with PBKDF2-SHA-256 over WebCrypto instead.
 *
 * The consequence, plainly: **password hashes are not portable between the two
 * builds.** An account seeded by `npm run seed` locally holds an scrypt digest
 * that this file cannot recompute, so that user cannot sign in on the Worker —
 * and an account created through POST /api/setup on the Worker holds a PBKDF2
 * digest that server/auth.mjs cannot recompute either. Copying a local .db into
 * D1 carries the projects and the interests across intact; it does not carry
 * the logins. Each deployment seeds its own accounts. This is stated again in
 * the README, because it is the kind of thing that is only ever discovered at
 * the worst moment.
 *
 * It is at least a loud failure rather than a silent one. The stored hash is
 * self-describing — `pbkdf2-sha256$<iterations>$<hex>` — so a bare hex digest
 * is recognisably an scrypt hash from the other build, and `verify` says so in
 * the log instead of leaving an operator staring at "those details do not match
 * an account" for a password they know is right. The response stays generic;
 * see `login`.
 *
 * When SP SSO arrives, the swap is `verify()` and `login()`; sessions, cookies
 * and every route guard stay as they are — which is as true here as it was in
 * the original.
 */

const COOKIE = 'dsac_portal';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * OWASP's floor for PBKDF2-SHA-256 is 600k iterations. This sits well under it
 * deliberately: a Worker gets a small slice of CPU per request, and a login is
 * expected to answer inside it. 150k is roughly a tenth of a second of
 * WebCrypto here — slow enough to make an offline attack on a leaked digest
 * expensive, fast enough that a lecturer signing in on a phone does not think
 * the button is broken. It is recorded in the stored hash, so raising it later
 * costs nothing: old rows keep verifying at their own cost until they are
 * rewritten.
 */
const PBKDF2_ITERATIONS = 150_000;
const KEY_BYTES = 32;
const SCHEME = 'pbkdf2-sha256';

/** The delay served on a wrong password — brute force without a rate limiter. */
const WRONG_PASSWORD_DELAY_MS = 300;

/** Hono's context, typed once so every handler in index.ts stays checked. */
export type Ctx = { Bindings: Env; Variables: { user: User } };

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

function fromHex(hex: string): Uint8Array {
  const clean = hex.length % 2 === 0 ? hex : '';
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function derive(password: string, salt: string, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: fromHex(salt) as BufferSource, iterations, hash: 'SHA-256' },
    key,
    KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

/**
 * Compare over the whole buffer regardless of where it first differs. There is
 * no `crypto.timingSafeEqual` here, so it is written out: no early return, one
 * XOR accumulator, length folded in at the end.
 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/**
 * Hash a new password. Exported because worker/seed.ts is the only other
 * caller — there is no route that sets a password after the account exists.
 */
export async function hashPassword(
  password: string,
  salt: string = toHex(crypto.getRandomValues(new Uint8Array(16))),
): Promise<{ salt: string; hash: string }> {
  const derived = await derive(password, salt, PBKDF2_ITERATIONS);
  return { salt, hash: `${SCHEME}$${PBKDF2_ITERATIONS}$${toHex(derived)}` };
}

type VerifyResult = 'ok' | 'wrong' | 'foreign-scheme';

/**
 * `foreign-scheme` is its own answer rather than folded into `wrong`, so that
 * the log can tell an operator the truth: this row was written by the Express
 * build and no password will ever open it here.
 */
async function verify(stored: { salt: string; hash: string }, password: string): Promise<VerifyResult> {
  if (!stored.salt || !stored.hash) return 'wrong';

  const parts = stored.hash.split('$');
  if (parts.length !== 3 || parts[0] !== SCHEME) return 'foreign-scheme';

  const iterations = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations <= 0) return 'foreign-scheme';

  const candidate = await derive(password, stored.salt, iterations);
  return timingSafeEqual(candidate, fromHex(parts[2])) ? 'ok' : 'wrong';
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of String(header ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}

export function createAuth(db: Db, _env: Env) {
  /**
   * Sign in, or null. One answer for every kind of failure — see the route.
   *
   * The original hashes even when the email is unknown, so that a missing
   * account and a wrong password take the same time to answer. That still
   * matters here, and matters more: PBKDF2 is the dominant cost of this
   * request, so skipping it on an unknown email would be trivially measurable
   * from outside and would turn the login form into an account enumerator.
   */
  async function login({
    email,
    password,
  }: {
    email: string;
    password: string;
  }): Promise<{ token: string; user: User | null } | null> {
    const row = await db.users.findByEmailWithSecret(email);

    const stored = row
      ? { salt: row.password_salt, hash: row.password_hash }
      : { salt: 'absent', hash: `${SCHEME}$${PBKDF2_ITERATIONS}$` };

    const result = await verify(stored, String(password ?? ''));

    if (result === 'foreign-scheme') {
      // Loud in the log, generic in the response. Telling the caller that this
      // account exists but was made elsewhere is still telling them it exists.
      console.warn(
        `Account ${row?.email ?? '(unknown)'} holds a password hash this build cannot verify — ` +
          'it was created by the Express build, whose scrypt hashes are not portable to Workers. ' +
          'Seed the account again against D1 (see README, "Passwords do not travel").',
      );
    }

    if (!row || result !== 'ok') {
      // A beat of delay blunts brute force without a rate-limiter dependency.
      await new Promise((r) => setTimeout(r, WRONG_PASSWORD_DELAY_MS));
      return null;
    }

    const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
    await db.sessions.create({ userId: row.id, token, ttlMs: TOKEN_TTL_MS });
    return { token, user: await db.users.get(row.id) };
  }

  /** The signed-in user, or null. Never throws — route guards decide the code. */
  async function userFor(c: Context<Ctx>): Promise<User | null> {
    const token = parseCookies(c.req.header('Cookie'))[COOKIE];
    if (!token) return null;
    const session = await db.sessions.get(token);
    if (!session) return null;
    return db.users.get(session.userId);
  }

  async function logout(c: Context<Ctx>): Promise<void> {
    const token = parseCookies(c.req.header('Cookie'))[COOKIE];
    if (token) await db.sessions.destroy(token);
  }

  /**
   * Hono has no `res.cookie`, so the header is written out.
   *
   * `Secure` is set here and is deliberately off in server/auth.mjs: that build
   * serves plain http://localhost in development, where a Secure cookie would
   * never be stored at all. A Worker origin — workers.dev or a custom domain —
   * is always https, including under `wrangler dev`, so there is no case in
   * which withholding it helps.
   */
  function setCookie(c: Context<Ctx>, token: string): void {
    c.header(
      'Set-Cookie',
      `${COOKIE}=${token}; Path=/; Max-Age=${Math.floor(TOKEN_TTL_MS / 1000)}; ` +
        'HttpOnly; SameSite=Lax; Secure',
    );
  }

  function clearCookie(c: Context<Ctx>): void {
    c.header('Set-Cookie', `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`);
  }

  /** Route guards. `requireAdmin` implies `requireUser`. */
  const requireUser: MiddlewareHandler<Ctx> = async (c, next) => {
    const user = await userFor(c);
    if (!user) return c.json({ error: 'Not signed in.' }, 401);
    c.set('user', user);
    return next();
  };

  const requireAdmin: MiddlewareHandler<Ctx> = async (c, next) => {
    const user = await userFor(c);
    if (!user) return c.json({ error: 'Not signed in.' }, 401);
    if (user.role !== 'admin') {
      return c.json({ error: 'Administrator access required.' }, 403);
    }
    c.set('user', user);
    return next();
  };

  /**
   * Housekeeping, not enforcement — `sessions.get` already refuses an expired
   * row in SQL. It was a `setInterval` in the Express build; there is no
   * long-lived process here, so it hangs off the cron trigger instead.
   */
  const sweepSessions = () => db.sessions.sweep();

  return { login, logout, userFor, setCookie, clearCookie, requireUser, requireAdmin, sweepSessions, COOKIE };
}

export type Auth = ReturnType<typeof createAuth>;
