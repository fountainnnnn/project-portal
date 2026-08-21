import { Hono } from 'hono';
import type { Context, MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import { createDb } from './db';
import type { Project, ProjectPatch, User } from './db';
import { createAuth } from './auth';
import type { Ctx } from './auth';
import { createSkillSuggester } from './ai';
import { runSetup } from './seed';
import type { Env } from './env';
import {
  SP_SCHOOLS,
  PROJECT_STATUSES,
  INTEREST_STATUSES,
  UNDISCLOSED_CLIENT,
} from './constants';
import type { InterestStatus, ProjectStatus } from './constants';

/**
 * The portal, as a Cloudflare Worker.
 *
 * A port of server/index.mjs, route for route: same paths, same status codes,
 * same JSON, same `dsac_portal` cookie. The frontend cannot tell which of the
 * two it is talking to, and that is the contract — see docs/FRONTEND_CONTRACTS.md.
 * The behaviour is specified over in the Express file and its comments explain
 * why each rule exists; this one says only what had to change to live without a
 * process, a filesystem or a port.
 *
 * What genuinely differs:
 *
 *  - Nothing is built at boot, because there is no boot. The store, the auth
 *    helpers and the AI client are constructed per request from `c.env`. They
 *    are closures over a binding, so this costs approximately nothing, and it
 *    means a `wrangler secret put` takes effect on the next request.
 *  - Seeding is a route rather than a boot step — POST /api/setup, which
 *    refuses once any account exists. See worker/seed.ts.
 *  - The hourly session sweep is a cron trigger rather than a setInterval.
 *  - `dist/` is served by the ASSETS binding rather than express.static, and
 *    the SPA fallback is configured in wrangler.jsonc rather than coded here.
 */

const app = new Hono<Ctx>();

/* ── Per-request wiring ──────────────────────────────────────────────────── */

const store = (c: Context<Ctx>) => createDb(c.env.DB);
const auth = (c: Context<Ctx>) => createAuth(store(c), c.env);

/**
 * The guards have to be built per request too, since they close over the D1
 * binding — so each is a thin wrapper that constructs and immediately delegates.
 */
const requireUser: MiddlewareHandler<Ctx> = (c, next) => auth(c).requireUser(c, next);
const requireAdmin: MiddlewareHandler<Ctx> = (c, next) => auth(c).requireAdmin(c, next);

/**
 * In production the SPA is same-origin and none of this applies. It exists for
 * `wrangler dev` alongside `vite`, which is a cross-origin pair.
 *
 * The allowed origins are named rather than reflected. Reflecting whatever
 * Origin arrives, with credentials on, would let any page on the internet make
 * authenticated requests to this portal using a signed-in lecturer's cookie —
 * SameSite=Lax blocks the plain cases but is not something to lean on alone.
 */
const DEV_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

app.use(
  '/api/*',
  cors({
    origin: (origin) => (DEV_ORIGINS.includes(origin) ? origin : ''),
    credentials: true,
  }),
);

/**
 * express.json's 256kb limit, restated. A project description is capped at 8000
 * characters downstream, so anything approaching this is a mistake or an
 * attempt, and refusing it before the body is read costs nothing.
 */
app.use('/api/*', async (c, next) => {
  const declared = Number.parseInt(c.req.header('Content-Length') ?? '0', 10);
  if (Number.isFinite(declared) && declared > 256 * 1024) {
    return c.json({ error: 'That request is too large.' }, 413);
  }
  return next();
});

/** Hono throws on a malformed body; every route reads it through this instead. */
async function body(c: Context<Ctx>): Promise<Record<string, unknown>> {
  const parsed = await c.req.json().catch(() => ({}));
  return (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
}

/* ── Validation ──────────────────────────────────────────────────────────────
   Small hand-written coercions rather than a schema library, exactly as in the
   Express build. There are six shapes in this app and every one of them is a
   flat object of strings. */

const asText = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);

/** Tags arrive from three places — the model, the admin's typing, and an edit
 *  of an existing project — so they are cleaned in exactly one. */
function asTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const tag = asText(item, 40).replace(/\s+/g, ' ');
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length === 20) break;
  }
  return out;
}

/** ISO dates or empty. An unparseable date becomes empty rather than an error:
 *  the duration note carries the meaning when the dates are soft. */
function asDate(value: unknown): string {
  const text = asText(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

const isProjectStatus = (v: unknown): v is ProjectStatus =>
  PROJECT_STATUSES.includes(v as ProjectStatus);
const isInterestStatus = (v: unknown): v is InterestStatus =>
  INTEREST_STATUSES.includes(v as InterestStatus);

function projectFromBody(b: Record<string, unknown>) {
  const title = asText(b.title, 140);
  if (!title) return { error: 'A project needs a title.' as const };

  return {
    value: {
      title,
      description: asText(b.description, 8000),
      client: asText(b.client, 120) || UNDISCLOSED_CLIENT,
      ndaRequired: Boolean(b.ndaRequired),
      startsOn: asDate(b.startsOn),
      endsOn: asDate(b.endsOn),
      durationNote: asText(b.durationNote, 120),
      status: isProjectStatus(b.status) ? b.status : ('available' as ProjectStatus),
      skills: asTags(b.skills),
    },
  };
}

/* ── Shaping ─────────────────────────────────────────────────────────────────
   What each role is allowed to see of a user. `db.users.get` has already
   dropped the password material, so a lecturer's own record and an admin's view
   of one are the same object.

   Staff browsing projects never receive other lecturers' profiles at all, so
   there is no public shape to define. The only cross-user data a staff member
   gets is a count, and that is computed in the route. */
const fullProfile = (user: User) => user;

/* ── Meta ─────────────────────────────────────────────────────────────────── */

app.get('/api/meta', (c) =>
  c.json({
    schools: SP_SCHOOLS,
    projectStatuses: PROJECT_STATUSES,
    interestStatuses: INTEREST_STATUSES,
    undisclosedClient: UNDISCLOSED_CLIENT,
    ai: createSkillSuggester(c.env).describe(),
  }),
);

/* ── Auth ─────────────────────────────────────────────────────────────────── */

app.post('/api/auth/login', async (c) => {
  const b = await body(c);
  const email = asText(b.email, 160);
  const password = String(b.password ?? '');

  if (!email || !password) {
    return c.json({ error: 'Enter an email and a password.' }, 400);
  }

  const a = auth(c);
  const result = await a.login({ email, password });
  if (!result || !result.user) {
    // One message for both causes. Telling an unauthenticated caller which
    // half was wrong tells them which emails exist. (A third cause exists on
    // this build — a password hash written by the Express build, which cannot
    // be checked here — and it gets the same answer, loudly logged. See
    // worker/auth.ts.)
    return c.json({ error: 'Those details do not match an account.' }, 401);
  }

  a.setCookie(c, result.token);
  return c.json({ user: fullProfile(result.user) });
});

app.post('/api/auth/logout', async (c) => {
  const a = auth(c);
  await a.logout(c);
  a.clearCookie(c);
  return c.json({ ok: true });
});

/** The client calls this on boot to find out who, if anyone, it is. 200 with a
 *  null user rather than 401, because "signed out" is the expected answer here
 *  and not an error worth a console entry. */
app.get('/api/auth/me', async (c) => {
  const user = await auth(c).userFor(c);
  return c.json({ user: user ? fullProfile(user) : null });
});

/* ── Profile ──────────────────────────────────────────────────────────────── */

app.put('/api/profile', requireUser, async (c) => {
  const b = await body(c);
  const me = c.get('user');
  const school = asText(b.school, 120);

  // An unrecognised school is rejected rather than stored. The dropdown is the
  // only way in through the UI, so this only fires on a hand-made request —
  // but a free-text school would quietly break every school filter.
  if (school && !SP_SCHOOLS.includes(school as (typeof SP_SCHOOLS)[number])) {
    return c.json({ error: 'Unknown school.' }, 400);
  }

  const pastProjects = Array.isArray(b.pastProjects)
    ? b.pastProjects.map((entry) => asText(entry, 200)).filter(Boolean).slice(0, 30)
    : undefined;

  const updated = await store(c).users.updateProfile(me.id, {
    name: b.name === undefined ? undefined : asText(b.name, 120) || me.name,
    title: b.title === undefined ? undefined : asText(b.title, 120),
    school: b.school === undefined ? undefined : school,
    teaches: b.teaches === undefined ? undefined : asText(b.teaches, 400),
    skills: b.skills === undefined ? undefined : asTags(b.skills),
    background: b.background === undefined ? undefined : asText(b.background, 4000),
    pastProjects,
  });

  // Null only if the account vanished between the guard and this line, which
  // the Express build did not have to consider either. 401 is the honest code:
  // the session no longer names anyone.
  if (!updated) return c.json({ error: 'Not signed in.' }, 401);
  return c.json({ user: fullProfile(updated) });
});

/* ── Projects ─────────────────────────────────────────────────────────────── */

/**
 * Both dashboards read this one route, shaped by role.
 *
 * A lecturer gets every project plus whether *they* expressed interest. An
 * admin additionally gets the headcount per project, which is the number they
 * actually scan the list for.
 */
app.get('/api/projects', requireUser, async (c) => {
  const s = store(c);
  const me = c.get('user');

  if (me.role === 'admin') {
    // Two full-table reads rather than a GROUP BY join. The counts are needed
    // for every project including the ones with none, the tables are small, and
    // this is the shape the Express build has — keeping them identical is worth
    // more than one saved query.
    const [projects, all] = await Promise.all([s.projects.list(), s.interests.list()]);
    const counts = new Map<string, number>();
    for (const interest of all) {
      counts.set(interest.projectId, (counts.get(interest.projectId) ?? 0) + 1);
    }
    return c.json({
      projects: projects.map((project) => ({
        ...project,
        interestCount: counts.get(project.id) ?? 0,
      })),
    });
  }

  const [projects, mineRows] = await Promise.all([
    s.projects.list(),
    s.interests.listForUser(me.id),
  ]);
  const mine = new Map(mineRows.map((interest) => [interest.projectId, interest]));

  return c.json({
    projects: projects.map((project) => {
      const interest = mine.get(project.id);
      return {
        ...project,
        myInterest: interest ? { status: interest.status, message: interest.message } : null,
      };
    }),
  });
});

app.post('/api/projects', requireAdmin, async (c) => {
  const { value, error } = projectFromBody(await body(c));
  if (error) return c.json({ error }, 400);

  const project = await store(c).projects.create({ ...value, createdBy: c.get('user').id });
  return c.json({ project: { ...(project as Project), interestCount: 0 } }, 201);
});

app.patch('/api/projects/:id', requireAdmin, async (c) => {
  const s = store(c);
  const id = c.req.param('id');
  const existing = await s.projects.get(id);
  if (!existing) return c.json({ error: 'No such project.' }, 404);

  const b = await body(c);

  // A patch of status alone is the common case — the toggle on the card — so
  // every field is optional and absent means unchanged.
  const patch: ProjectPatch = {};
  if (b.title !== undefined) {
    const title = asText(b.title, 140);
    if (!title) return c.json({ error: 'A project needs a title.' }, 400);
    patch.title = title;
  }
  if (b.description !== undefined) patch.description = asText(b.description, 8000);
  if (b.client !== undefined) patch.client = asText(b.client, 120) || UNDISCLOSED_CLIENT;
  if (b.ndaRequired !== undefined) patch.ndaRequired = Boolean(b.ndaRequired);
  if (b.startsOn !== undefined) patch.startsOn = asDate(b.startsOn);
  if (b.endsOn !== undefined) patch.endsOn = asDate(b.endsOn);
  if (b.durationNote !== undefined) patch.durationNote = asText(b.durationNote, 120);
  if (b.skills !== undefined) patch.skills = asTags(b.skills);
  if (b.status !== undefined) {
    if (!isProjectStatus(b.status)) return c.json({ error: 'Unknown status.' }, 400);
    patch.status = b.status;
  }

  const project = await s.projects.update(id, patch);
  if (!project) return c.json({ error: 'No such project.' }, 404);

  const interestCount = (await s.interests.listForProject(project.id)).length;
  return c.json({ project: { ...project, interestCount } });
});

app.delete('/api/projects/:id', requireAdmin, async (c) => {
  const removed = await store(c).projects.remove(c.req.param('id'));
  if (!removed) return c.json({ error: 'No such project.' }, 404);
  return c.json({ ok: true });
});

/* ── Interest ─────────────────────────────────────────────────────────────── */

app.post('/api/projects/:id/interest', requireUser, async (c) => {
  const s = store(c);
  const project = await s.projects.get(c.req.param('id'));
  if (!project) return c.json({ error: 'No such project.' }, 404);

  // Closed means closed. The card hides the button, but the route is the thing
  // that actually enforces it.
  if (project.status !== 'available') {
    return c.json({ error: 'This project is closed to new interest.' }, 409);
  }

  const interest = await s.interests.express({
    projectId: project.id,
    userId: c.get('user').id,
    message: asText((await body(c)).message, 1000),
  });

  return c.json({ interest: { status: interest.status, message: interest.message } });
});

app.delete('/api/projects/:id/interest', requireUser, async (c) => {
  await store(c).interests.withdraw({
    projectId: c.req.param('id'),
    userId: c.get('user').id,
  });
  // Withdrawing something you never expressed is not an error — the caller
  // wanted no interest recorded, and there is none.
  return c.json({ ok: true });
});

/**
 * The roster: who raised their hand, and everything the admin needs to judge
 * the fit without leaving the page.
 */
app.get('/api/projects/:id/interests', requireAdmin, async (c) => {
  const s = store(c);
  const project = await s.projects.get(c.req.param('id'));
  if (!project) return c.json({ error: 'No such project.' }, 404);

  const rows = await s.interests.listForProject(project.id);

  // The Express build reads each user inside the map, which is free on
  // node:sqlite and a serial round trip each here. The roster is a handful of
  // rows, so they go out together instead of one after another.
  const users = await Promise.all(rows.map((interest) => s.users.get(interest.userId)));

  const interests = rows
    .map((interest, i) => {
      const user = users[i];
      // A deleted account leaves an orphan row. Drop it from the roster rather
      // than rendering a card with no name on it.
      if (!user) return null;
      return { ...interest, user: fullProfile(user) };
    })
    .filter((entry) => entry !== null);

  return c.json({ interests });
});

app.patch('/api/interests/:id', requireAdmin, async (c) => {
  const status = (await body(c)).status;
  if (!isInterestStatus(status)) {
    return c.json({ error: 'Unknown interest status.' }, 400);
  }
  const interest = await store(c).interests.setStatus(c.req.param('id'), status);
  if (!interest) return c.json({ error: 'No such expression of interest.' }, 404);
  return c.json({ interest });
});

/** Every lecturer on the portal, for the admin's directory tab. */
app.get('/api/staff', requireAdmin, async (c) => {
  const s = store(c);
  const [all, interests] = await Promise.all([s.users.list(), s.interests.list()]);
  const counts = new Map<string, number>();
  for (const interest of interests) {
    counts.set(interest.userId, (counts.get(interest.userId) ?? 0) + 1);
  }
  return c.json({
    staff: all
      .filter((user) => user.role === 'staff')
      .map((user) => ({ ...user, interestCount: counts.get(user.id) ?? 0 })),
  });
});

/* ── Skill suggestion ─────────────────────────────────────────────────────── */

app.post('/api/skills/suggest', requireAdmin, async (c) => {
  const result = await createSkillSuggester(c.env).suggest((await body(c)).description);
  if (!result.ok) {
    // 200 with an error string, not a 4xx. The form treats this as "generation
    // did not work, carry on typing" rather than as a failed save, and giving
    // it an error status makes every client fetch wrapper shout about it.
    return c.json({ ok: false, error: result.error, tags: [] });
  }
  return c.json(result);
});

/* ── First run ───────────────────────────────────────────────────────────── */

/**
 * The seed the Express build runs at boot. A Worker has no boot, so it is a
 * route — unauthenticated of necessity, since on an empty database there is no
 * account to authenticate as. worker/seed.ts holds the two locks that make that
 * safe and explains them.
 */
app.post('/api/setup', async (c) => {
  const result = await runSetup(store(c), c.env);
  if (!result.ok) return c.json({ error: result.error }, result.status);
  return c.json({ ok: true, created: result.created, projects: result.projects });
});

/* ── Static build ─────────────────────────────────────────────────────────── */

/**
 * An unmatched /api path is a 404 in JSON, not the SPA.
 *
 * The assets binding is configured with `not_found_handling:
 * single-page-application`, so anything it cannot find comes back as
 * index.html. That is right for /staff/projects and wrong for a mistyped API
 * call, where a client expecting JSON would be handed a page of HTML and report
 * a parse error instead of a 404.
 */
app.all('/api/*', (c) => c.json({ error: 'No such endpoint.' }, 404));

/** Everything else is the SPA: real files where they exist, index.html where
 *  they do not, both from the assets binding. */
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: app.fetch,

  /**
   * Hourly housekeeping: expired session rows.
   *
   * This was a `setInterval` in the Express build, which is not available to a
   * Worker that only exists while a request is in flight. Nothing depends on it
   * for correctness — `sessions.get` refuses an expired row in SQL — so it is
   * purely there to stop the table growing without bound.
   */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    const db = createDb(env.DB);
    ctx.waitUntil(createAuth(db, env).sweepSessions());
  },
} satisfies ExportedHandler<Env>;
