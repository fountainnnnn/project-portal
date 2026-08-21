import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { openDatabase } from './db.mjs';
import { createAuth } from './auth.mjs';
import { createSkillSuggester } from './ai.mjs';
import { ensureSeedAccounts } from './seed.mjs';
import {
  SP_SCHOOLS,
  PROJECT_STATUSES,
  INTEREST_STATUSES,
  UNDISCLOSED_CLIENT,
} from './constants.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');

/** Same .env reader as the booth: enough for KEY=value, no dependency. */
function loadLocalEnv() {
  const envPath = path.join(ROOT_DIR, '.env');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalsAt = trimmed.indexOf('=');
    if (equalsAt <= 0) continue;

    const key = trimmed.slice(0, equalsAt).trim();
    let value = trimmed.slice(equalsAt + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadLocalEnv();

const app = express();
const port = Number.parseInt(process.env.PORT ?? '3001', 10);
const frontendPort = Number.parseInt(process.env.FRONTEND_PORT ?? '5173', 10);

const DATA_DIR = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : path.join(ROOT_DIR, 'data');

const store = openDatabase(DATA_DIR);
const auth = createAuth(store);
const ai = createSkillSuggester();

// The two accounts that make a fresh checkout usable. Idempotent — an existing
// database is left exactly as it is.
const seeded = ensureSeedAccounts(store);

app.use(
  cors({
    // Credentials means the browser refuses a wildcard origin, so name the dev
    // server explicitly. In production the SPA is same-origin and none of this
    // applies.
    origin: [`http://localhost:${frontendPort}`, `http://127.0.0.1:${frontendPort}`],
    credentials: true,
  }),
);
app.use(express.json({ limit: '256kb' }));

/* ── Validation ──────────────────────────────────────────────────────────────
   Small hand-written coercions rather than a schema library. There are six
   shapes in this app and every one of them is a flat object of strings. */

const asText = (value, max) => String(value ?? '').trim().slice(0, max);

/** Tags arrive from three places — the model, the admin's typing, and an edit
 *  of an existing project — so they are cleaned in exactly one. */
function asTags(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
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
function asDate(value) {
  const text = asText(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function projectFromBody(body) {
  const title = asText(body.title, 140);
  if (!title) return { error: 'A project needs a title.' };

  const status = PROJECT_STATUSES.includes(body.status) ? body.status : 'available';
  const client = asText(body.client, 120) || UNDISCLOSED_CLIENT;

  return {
    value: {
      title,
      description: asText(body.description, 8000),
      client,
      ndaRequired: Boolean(body.ndaRequired),
      startsOn: asDate(body.startsOn),
      endsOn: asDate(body.endsOn),
      durationNote: asText(body.durationNote, 120),
      status,
      skills: asTags(body.skills),
    },
  };
}

/* ── Shaping ─────────────────────────────────────────────────────────────────
   What each role is allowed to see of a user. */

/** A lecturer's own record, or an admin's view of one — everything but the
 *  password material, which `users.get` has already dropped. */
const fullProfile = (user) => user;

/** Staff browsing projects never receive other lecturers' profiles at all, so
 *  there is no public shape to define. The only cross-user data a staff member
 *  gets is a count, and that is computed in the route. */

app.get('/api/meta', (_req, res) => {
  res.json({
    schools: SP_SCHOOLS,
    projectStatuses: PROJECT_STATUSES,
    interestStatuses: INTEREST_STATUSES,
    undisclosedClient: UNDISCLOSED_CLIENT,
    ai: ai.describe(),
  });
});

/* ── Auth ─────────────────────────────────────────────────────────────────── */

app.post('/api/auth/login', (req, res) => {
  const email = asText(req.body?.email, 160);
  const password = String(req.body?.password ?? '');

  if (!email || !password) {
    return res.status(400).json({ error: 'Enter an email and a password.' });
  }

  const result = auth.login({ email, password });
  if (!result) {
    // One message for both causes. Telling an unauthenticated caller which
    // half was wrong tells them which emails exist.
    return res.status(401).json({ error: 'Those details do not match an account.' });
  }

  auth.setCookie(res, result.token);
  res.json({ user: fullProfile(result.user) });
});

app.post('/api/auth/logout', (req, res) => {
  auth.logout(req);
  auth.clearCookie(res);
  res.json({ ok: true });
});

/** The client calls this on boot to find out who, if anyone, it is. 200 with a
 *  null user rather than 401, because "signed out" is the expected answer here
 *  and not an error worth a console entry. */
app.get('/api/auth/me', (req, res) => {
  const user = auth.userFor(req);
  res.json({ user: user ? fullProfile(user) : null });
});

/* ── Profile ──────────────────────────────────────────────────────────────── */

app.put('/api/profile', auth.requireUser, (req, res) => {
  const body = req.body ?? {};
  const school = asText(body.school, 120);

  // An unrecognised school is rejected rather than stored. The dropdown is the
  // only way in through the UI, so this only fires on a hand-made request —
  // but a free-text school would quietly break every school filter.
  if (school && !SP_SCHOOLS.includes(school)) {
    return res.status(400).json({ error: 'Unknown school.' });
  }

  const pastProjects = Array.isArray(body.pastProjects)
    ? body.pastProjects.map((entry) => asText(entry, 200)).filter(Boolean).slice(0, 30)
    : undefined;

  const updated = store.users.updateProfile(req.user.id, {
    name: body.name === undefined ? undefined : asText(body.name, 120) || req.user.name,
    title: body.title === undefined ? undefined : asText(body.title, 120),
    school: body.school === undefined ? undefined : school,
    teaches: body.teaches === undefined ? undefined : asText(body.teaches, 400),
    skills: body.skills === undefined ? undefined : asTags(body.skills),
    background: body.background === undefined ? undefined : asText(body.background, 4000),
    pastProjects,
  });

  res.json({ user: fullProfile(updated) });
});

/* ── Projects ─────────────────────────────────────────────────────────────── */

/**
 * Both dashboards read this one route, shaped by role.
 *
 * A lecturer gets every project plus whether *they* expressed interest. An
 * admin additionally gets the headcount per project, which is the number they
 * actually scan the list for.
 */
app.get('/api/projects', auth.requireUser, (req, res) => {
  const projects = store.projects.list();
  const isAdmin = req.user.role === 'admin';

  if (isAdmin) {
    const all = store.interests.list();
    const counts = new Map();
    for (const interest of all) {
      counts.set(interest.projectId, (counts.get(interest.projectId) ?? 0) + 1);
    }
    return res.json({
      projects: projects.map((project) => ({
        ...project,
        interestCount: counts.get(project.id) ?? 0,
      })),
    });
  }

  const mine = new Map(
    store.interests.listForUser(req.user.id).map((interest) => [interest.projectId, interest]),
  );

  res.json({
    projects: projects.map((project) => ({
      ...project,
      myInterest: mine.get(project.id)
        ? { status: mine.get(project.id).status, message: mine.get(project.id).message }
        : null,
    })),
  });
});

app.post('/api/projects', auth.requireAdmin, (req, res) => {
  const { value, error } = projectFromBody(req.body ?? {});
  if (error) return res.status(400).json({ error });

  const project = store.projects.create({ ...value, createdBy: req.user.id });
  res.status(201).json({ project: { ...project, interestCount: 0 } });
});

app.patch('/api/projects/:id', auth.requireAdmin, (req, res) => {
  const existing = store.projects.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'No such project.' });

  const body = req.body ?? {};

  // A patch of status alone is the common case — the toggle on the card — so
  // every field is optional and absent means unchanged.
  const patch = {};
  if (body.title !== undefined) {
    const title = asText(body.title, 140);
    if (!title) return res.status(400).json({ error: 'A project needs a title.' });
    patch.title = title;
  }
  if (body.description !== undefined) patch.description = asText(body.description, 8000);
  if (body.client !== undefined) patch.client = asText(body.client, 120) || UNDISCLOSED_CLIENT;
  if (body.ndaRequired !== undefined) patch.ndaRequired = Boolean(body.ndaRequired);
  if (body.startsOn !== undefined) patch.startsOn = asDate(body.startsOn);
  if (body.endsOn !== undefined) patch.endsOn = asDate(body.endsOn);
  if (body.durationNote !== undefined) patch.durationNote = asText(body.durationNote, 120);
  if (body.skills !== undefined) patch.skills = asTags(body.skills);
  if (body.status !== undefined) {
    if (!PROJECT_STATUSES.includes(body.status)) {
      return res.status(400).json({ error: 'Unknown status.' });
    }
    patch.status = body.status;
  }

  const project = store.projects.update(req.params.id, patch);
  const interestCount = store.interests.listForProject(project.id).length;
  res.json({ project: { ...project, interestCount } });
});

app.delete('/api/projects/:id', auth.requireAdmin, (req, res) => {
  const removed = store.projects.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'No such project.' });
  res.json({ ok: true });
});

/* ── Interest ─────────────────────────────────────────────────────────────── */

app.post('/api/projects/:id/interest', auth.requireUser, (req, res) => {
  const project = store.projects.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'No such project.' });

  // Closed means closed. The card hides the button, but the route is the thing
  // that actually enforces it.
  if (project.status !== 'available') {
    return res.status(409).json({ error: 'This project is closed to new interest.' });
  }

  const interest = store.interests.express({
    projectId: project.id,
    userId: req.user.id,
    message: asText(req.body?.message, 1000),
  });

  res.json({ interest: { status: interest.status, message: interest.message } });
});

app.delete('/api/projects/:id/interest', auth.requireUser, (req, res) => {
  store.interests.withdraw({ projectId: req.params.id, userId: req.user.id });
  // Withdrawing something you never expressed is not an error — the caller
  // wanted no interest recorded, and there is none.
  res.json({ ok: true });
});

/**
 * The roster: who raised their hand, and everything the admin needs to judge
 * the fit without leaving the page.
 */
app.get('/api/projects/:id/interests', auth.requireAdmin, (req, res) => {
  const project = store.projects.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'No such project.' });

  const rows = store.interests.listForProject(project.id);
  const interests = rows
    .map((interest) => {
      const user = store.users.get(interest.userId);
      // A deleted account leaves an orphan row. Drop it from the roster rather
      // than rendering a card with no name on it.
      if (!user) return null;
      return { ...interest, user: fullProfile(user) };
    })
    .filter(Boolean);

  res.json({ interests });
});

app.patch('/api/interests/:id', auth.requireAdmin, (req, res) => {
  const status = req.body?.status;
  if (!INTEREST_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Unknown interest status.' });
  }
  const interest = store.interests.setStatus(req.params.id, status);
  if (!interest) return res.status(404).json({ error: 'No such expression of interest.' });
  res.json({ interest });
});

/** Every lecturer on the portal, for the admin's directory tab. */
app.get('/api/staff', auth.requireAdmin, (_req, res) => {
  const staff = store.users.list().filter((user) => user.role === 'staff');
  const counts = new Map();
  for (const interest of store.interests.list()) {
    counts.set(interest.userId, (counts.get(interest.userId) ?? 0) + 1);
  }
  res.json({
    staff: staff.map((user) => ({ ...user, interestCount: counts.get(user.id) ?? 0 })),
  });
});

/* ── Skill suggestion ─────────────────────────────────────────────────────── */

app.post('/api/skills/suggest', auth.requireAdmin, async (req, res) => {
  const result = await ai.suggest(req.body?.description);
  if (!result.ok) {
    // 200 with an error string, not a 4xx. The form treats this as "generation
    // did not work, carry on typing" rather than as a failed save, and giving
    // it an error status makes every client fetch wrapper shout about it.
    return res.json({ ok: false, error: result.error, tags: [] });
  }
  res.json(result);
});

/* ── Static build ─────────────────────────────────────────────────────────── */

const DIST_DIR = path.join(ROOT_DIR, 'dist');
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  // Client-side routing: anything that is not an API call is the SPA.
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

app.listen(port, '0.0.0.0', () => {
  const ai_ = ai.describe();
  console.log(`DSAC Project Portal API on http://localhost:${port}`);
  console.log(`  data      ${path.join(DATA_DIR, 'project-portal.db')}`);
  console.log(`  skills AI ${ai_.provider} (${ai_.model}) — ${ai_.configured ? 'key present' : 'NO KEY, generation disabled'}`);
  if (seeded.created.length > 0) {
    console.log('  seeded accounts:');
    for (const account of seeded.created) {
      console.log(`    ${account.role.padEnd(5)} ${account.email}  ${account.password}`);
    }
  }
});
