# SP DSAC Project Portal

> A prototype I proposed to SP's Data Science & Analytics Centre. It is not a tool DSAC uses today, and the projects in the seed data are illustrative.

Singapore Polytechnic's Data Science & Analytics Centre takes on real projects for
real clients. The projects exist; the problem is that nobody outside the centre
can see them. A lecturer who teaches computer vision has no way of knowing that
DSAC is holding a defect-inspection project for a manufacturer, and DSAC has no
way of knowing that lecturer exists. Matching happens over email, in corridors,
or not at all.

This portal is the bridge. DSAC publishes what it holds; teaching staff across
the ten schools browse it, filter by the skills they actually have, and raise a
hand on anything they could contribute to. The centre sees who raised it, what
they teach, and what they have worked on before, all on one roster — and decides
from there.

It is a small app on purpose. Two roles, six screens, one database.

- **Admin** (DSAC): create and edit projects, open or close them to interest,
  read the roster per project, shortlist or decline, browse the staff directory.
- **Staff** (teaching lecturers): browse every published project, filter, express
  interest with a note, withdraw it, and keep a profile that tells DSAC what they
  bring.

---

## Quickstart

Node 22.12 or newer — the local build stores data with `node:sqlite`, which needs
a recent runtime and no install of its own.

```bash
npm install
cp .env.example .env      # then edit it, see below
npm run dev               # API on :3001, Vite on :5173
```

Open http://localhost:5173. The API seeds itself on first boot and prints the
accounts it created.

| Script | What it does |
|---|---|
| `npm run dev` | Express API + Vite dev server together |
| `npm run server` | API alone |
| `npm run client` | Vite alone |
| `npm run seed` | Re-run the seed (idempotent; creates nothing that exists) |
| `npm run build` | Type-check and build the SPA into `dist/` |
| `npm start` | API serving the built `dist/` — one origin, no Vite |
| `npm run lint` | ESLint |
| `npm run cf:schema` | Apply `worker/schema.sql` to the D1 database |
| `npm run cf:deploy` | Build, then `wrangler deploy` |

Type-check the Worker separately — the root `tsconfig.json` excludes it, because
it is not a DOM project:

```bash
npx tsc -p worker --noEmit
```

### Seeded development accounts

On an empty database the server creates two accounts and four sample projects,
then prints them:

| Role | Email | Password |
|---|---|---|
| admin | `admin@dsac.sp.edu.sg` | `admin1234` |
| staff | `staff@sp.edu.sg` | `staff1234` |

> **Change these before this portal holds anything real.** They are development
> credentials, published in this file, and they are weak on purpose so that a
> fresh checkout is usable in one command. Set `SEED_ADMIN_PASSWORD` and
> `SEED_STAFF_PASSWORD` in `.env` *before the first run* and the defaults are
> never written. If you have already run it: delete `data/project-portal.db` and
> start again, since there is no route that changes a password.

---

## Configuration

Local development reads `.env` (see `.env.example`). The Worker reads bindings —
`vars` in `wrangler.jsonc` for the dull ones, `wrangler secret put` for the rest.

| Variable | Purpose |
|---|---|
| `AI_PROVIDER` | `deepseek` (default) or `openai` |
| `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` | The key for whichever provider is selected |
| `AI_MODEL`, `AI_BASE_URL` | Optional overrides; blank means the provider's default |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | First-run admin account |
| `SEED_STAFF_EMAIL` / `SEED_STAFF_PASSWORD` | First-run staff account |
| `PORT`, `FRONTEND_PORT`, `STORAGE_DIR` | Local server only; the Worker has no use for them |

---

## Skill tagging, and how the GenAI part works

Every project carries a list of skill tags — `Computer Vision`, `Power BI`,
`Stakeholder Management`. Staff filter on them; they are the mechanism by which a
lecturer finds the two projects out of thirty that are theirs.

Writing them by hand is the kind of chore that gets skipped, and a project with
no tags is invisible to the filter. So there is a **Generate** button on the
project form: it sends the description to a chat model and asks for four to ten
tags as a JSON array, nothing else.

What comes back is a *suggestion* and is treated as one. The admin accepts it,
edits it, deletes individual tags, or ignores the button and types their own.
Every failure path — no key configured, provider down, description too thin,
unparseable reply — returns HTTP 200 with `ok: false` and a message the form
shows inline, precisely so that a provider having a bad day never blocks anyone
from publishing a project. Model output is untrusted input: anything that is not
a clean list of short strings is discarded rather than shown as a tag.

**Swapping DeepSeek for OpenAI** is configuration, not code. Both speak the same
`/chat/completions` shape, so:

```bash
# local: .env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...

# worker
# set AI_PROVIDER to "openai" in wrangler.jsonc → vars
wrangler secret put OPENAI_API_KEY
```

The default model moves with the provider (`deepseek-chat` → `gpt-4o-mini`);
`AI_MODEL` overrides it. Any other OpenAI-compatible host works too — set
`AI_BASE_URL`. Nothing else in the app changes. `GET /api/meta` reports which
provider and model are live and whether a key is present, so the Generate button
can explain itself instead of failing mysteriously.

---

## API

Every path is same-origin and relative. JSON in, JSON out. Auth is the
`dsac_portal` cookie — HttpOnly, seven days, stored server-side so signing out is
a delete. The Express server and the Worker implement this table identically; the
frontend cannot tell which one it is talking to.

| Method | Path | Who | Returns |
|---|---|---|---|
| GET | `/api/meta` | anyone | `{ schools, projectStatuses, interestStatuses, undisclosedClient, ai }` |
| POST | `/api/auth/login` | anyone | `{ user }`; 401 with one generic message on failure |
| POST | `/api/auth/logout` | anyone | `{ ok }` |
| GET | `/api/auth/me` | anyone | `{ user }` — `null` when signed out, 200 either way |
| PUT | `/api/profile` | signed in | `{ user }` — profile fields only, never role or email |
| GET | `/api/projects` | signed in | `{ projects }` — admin gets `interestCount`, staff gets `myInterest` |
| POST | `/api/projects` | admin | `{ project }`, 201 |
| PATCH | `/api/projects/:id` | admin | `{ project }` — every field optional; absent means unchanged |
| DELETE | `/api/projects/:id` | admin | `{ ok }` — takes the project's interests with it |
| POST | `/api/projects/:id/interest` | signed in | `{ interest }`; 409 when the project is closed |
| DELETE | `/api/projects/:id/interest` | signed in | `{ ok }` — idempotent |
| GET | `/api/projects/:id/interests` | admin | `{ interests }` — the roster, each with the lecturer's profile |
| PATCH | `/api/interests/:id` | admin | `{ interest }` — `pending` / `shortlisted` / `declined` |
| GET | `/api/staff` | admin | `{ staff }` — the directory, each with `interestCount` |
| POST | `/api/skills/suggest` | admin | `{ ok, tags }` or `{ ok: false, error, tags: [] }` — **always 200** |
| POST | `/api/setup` | first run | Worker only; seeds an empty database. 409 once any account exists |

Anything that is not `/api/*` is the SPA.

---

## Deploying to Cloudflare

`worker/` is the same app as `server/`, route for route, on Workers + D1. The
walkthrough is in [`docs/DEPLOY_CLOUDFLARE.md`](docs/DEPLOY_CLOUDFLARE.md); the
short version:

```bash
npx wrangler login

# 1. Create the database, then paste the printed id into wrangler.jsonc
npx wrangler d1 create project-portal

# 2. Apply the schema (idempotent — every statement is IF NOT EXISTS)
npm run cf:schema

# 3. Secrets. SEED_ADMIN_PASSWORD has no default on this build:
#    setup refuses to run without it.
npx wrangler secret put SEED_ADMIN_PASSWORD
npx wrangler secret put SEED_STAFF_PASSWORD
npx wrangler secret put DEEPSEEK_API_KEY

# 4. Build the SPA and deploy the Worker
npm run cf:deploy

# 5. Seed the first accounts, once
curl -X POST https://<your-worker>.workers.dev/api/setup
```

### Passwords do not travel

`crypto.scryptSync` is a Node exclusive — it is not in WebCrypto and
`nodejs_compat` does not supply it. The Worker therefore hashes passwords with
PBKDF2-SHA-256 instead.

The consequence, plainly: **password hashes are not portable between the two
builds.** An account seeded locally holds an scrypt digest the Worker cannot
recompute, so that user cannot sign in on the Worker; an account created by
`/api/setup` holds a PBKDF2 digest the local server cannot recompute either.
Copying a local database into D1 carries the projects and the interests across
intact — it does not carry the logins. Each deployment seeds its own accounts.

The failure is at least loud rather than silent: the stored hash records its own
scheme, so the Worker recognises a hash from the other build and logs exactly
that. The HTTP response stays the same generic 401, because telling an
unauthenticated caller that an account exists is still telling them it exists.

---

## What this is not

Honest inventory, so nobody discovers these at the wrong moment:

- **No password reset and no email verification.** Accounts are created by an
  administrator, which is how DSAC works, and both features need a mail path this
  app does not have. A forgotten password today means an administrator re-creates
  the account.
- **No password change route at all.** Passwords are set at seed time only.
- **Seed passwords are development credentials.** They are printed in this file.
  Change them before the portal holds a real client list. On the Worker there is
  no default at all — setup refuses to run until you set one.
- **No lockout or rate limiting.** A wrong password costs the caller a fixed
  delay, which blunts a brute-force attempt without a dependency; it is not a
  substitute for a rate limiter in front of a public deployment. Cloudflare's own
  rate limiting rules are the obvious place to add one.
- **No audit log.** Who closed a project, who declined an expression of interest —
  none of it is recorded beyond the current state.
- **No SSO.** When SP SSO arrives the swap is two functions (`login` and the
  password check); sessions, cookies and every route guard stay as they are.
- **Client names are not access-controlled.** A project marked NDA shows
  `Undisclosed` instead of the client's name, but every signed-in lecturer sees
  every project. There is no per-project visibility.
- **The two builds share a schema, not a database.** Running both against one
  store is not a supported arrangement; pick a deployment.

---

## Layout

```
src/, components/     the React SPA (Vite, Tailwind)
server/*.mjs          the Express + node:sqlite build — local development
worker/*.ts           the Cloudflare Workers + D1 build — see worker/CONTRACTS.md
worker/schema.sql     the D1 schema; the local build has its own copy in db.mjs
docs/                 design system, frontend contract, deployment walkthrough
data/                 the local SQLite file (git-ignored)
public/               the shared SP DSAC brand mark
```

## Documentation

| File | What it covers |
| --- | --- |
| [`docs/DESIGN.md`](docs/DESIGN.md) | The glow-card design system — tokens, type grammar, components, motion, and the rules. **Read this before touching any UI.** |
| [`docs/FRONTEND_CONTRACTS.md`](docs/FRONTEND_CONTRACTS.md) | Architecture decisions, the shared type and API-client signatures |
| [`docs/DEPLOY_CLOUDFLARE.md`](docs/DEPLOY_CLOUDFLARE.md) | Step-by-step D1 + Workers deployment |
| [`worker/CONTRACTS.md`](worker/CONTRACTS.md) | Module signatures for the Worker port |

The design system is shared with **dsac-photo-booth** — the two apps are meant
to look like the same centre, so a change to `DESIGN.md` is a change to both.
