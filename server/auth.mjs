import crypto from 'node:crypto';

/**
 * Email and password against the local `users` table.
 *
 * This is a real per-user login, unlike the booth's two shared passwords: the
 * portal has to know *which* lecturer expressed interest, so identity is the
 * point rather than a gate.
 *
 * It is still deliberately modest. Passwords are scrypt-hashed with a per-user
 * salt and compared in constant time; sessions are 32 random bytes in an
 * HttpOnly cookie, stored server-side so signing out is a delete rather than a
 * hope. There is no password reset, no lockout, and no email verification —
 * accounts are created by an administrator, which is how DSAC works, and every
 * one of those features needs a mail path this app does not have.
 *
 * When SP SSO arrives, the swap is `verify()` and `login()`; sessions, cookies
 * and every route guard stay as they are.
 */

const COOKIE = 'dsac_portal';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return { salt, hash };
}

function verifyAgainst(stored, password) {
  if (!stored?.salt || !stored?.hash) return false;
  const candidate = crypto.scryptSync(password, stored.salt, 32).toString('hex');
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(stored.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}

export function createAuth(store) {
  /** Sweep on boot, then hourly. Expired rows are harmless — `sessions.get`
   *  rejects them regardless — so this is housekeeping, not correctness. */
  store.sessions.sweep();
  const timer = setInterval(() => store.sessions.sweep(), 60 * 60 * 1000);
  timer.unref?.();

  function login({ email, password }) {
    const row = store.users.findByEmailWithSecret(email);

    // Hash even when the email is unknown, so a missing account and a wrong
    // password take the same time to answer. scrypt is slow enough that
    // skipping it here would be measurable from outside.
    const stored = row
      ? { salt: row.password_salt, hash: row.password_hash }
      : { salt: 'absent', hash: crypto.scryptSync('absent', 'absent', 32).toString('hex') };

    const ok = verifyAgainst(stored, String(password ?? ''));
    if (!row || !ok) return null;

    const token = crypto.randomBytes(32).toString('hex');
    store.sessions.create({ userId: row.id, token, ttlMs: TOKEN_TTL_MS });
    return { token, user: store.users.get(row.id) };
  }

  /** The signed-in user, or null. Never throws — route guards decide the code. */
  function userFor(req) {
    const token = parseCookies(req.headers?.cookie)[COOKIE];
    if (!token) return null;
    const session = store.sessions.get(token);
    if (!session) return null;
    return store.users.get(session.userId);
  }

  function logout(req) {
    const token = parseCookies(req.headers?.cookie)[COOKIE];
    if (token) store.sessions.destroy(token);
  }

  function setCookie(res, token) {
    res.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: TOKEN_TTL_MS,
      // Left off deliberately: the portal runs on plain http://localhost in
      // development, and a Secure cookie would simply never be stored there.
      // The Worker build sets it, because that origin is always https.
      secure: false,
      path: '/',
    });
  }

  function clearCookie(res) {
    res.clearCookie(COOKIE, { path: '/' });
  }

  /** Express guards. `requireAdmin` implies `requireUser`. */
  const requireUser = (req, res, next) => {
    const user = userFor(req);
    if (!user) return res.status(401).json({ error: 'Not signed in.' });
    req.user = user;
    next();
  };

  const requireAdmin = (req, res, next) => {
    const user = userFor(req);
    if (!user) return res.status(401).json({ error: 'Not signed in.' });
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Administrator access required.' });
    }
    req.user = user;
    next();
  };

  return { login, logout, userFor, setCookie, clearCookie, requireUser, requireAdmin, COOKIE };
}
