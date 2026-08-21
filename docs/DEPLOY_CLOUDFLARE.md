# Deploying the portal to Cloudflare

The portal has two backends that implement the same API: `server/*.mjs` (Express
+ `node:sqlite`) for local development, and `worker/*.ts` (Workers + D1) for
deployment. The SPA in `dist/` is identical either way and cannot tell them
apart. This file covers the second one.

Nothing here creates a resource until you run it. Every step below either costs
nothing on Cloudflare's free tier or is a read.

## Before you start

```bash
npx wrangler login       # opens a browser; authorises this machine
npx wrangler whoami      # confirms the account
```

`wrangler` is already a devDependency — there is nothing to install globally.

## 1. Create the D1 database

```bash
npx wrangler d1 create project-portal
```

It prints a `database_id`. Paste it into `wrangler.jsonc`, replacing the
placeholder:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "project-portal",
    "database_id": "PASTE_THE_ID_FROM_wrangler_d1_create"
  }
]
```

The id is account-specific, which is why the committed file cannot hold a
working one.

## 2. Apply the schema

```bash
npm run cf:schema
# = wrangler d1 execute project-portal --file=worker/schema.sql
```

Every statement in `worker/schema.sql` is `IF NOT EXISTS`, so this is safe to
re-run against a live database — which matters, because it is the only migration
path this project has. Adding a *column* later is not covered by it; that needs
its own `ALTER TABLE`, run once, by hand.

For the local emulator instead of the real database:

```bash
npx wrangler d1 execute project-portal --local --file=worker/schema.sql
```

## 3. Set the secrets

These are per-deployment and never go in `wrangler.jsonc`, which is committed.

```bash
npx wrangler secret put SEED_ADMIN_PASSWORD    # required; setup refuses without it
npx wrangler secret put SEED_STAFF_PASSWORD    # optional; the account is skipped without it
npx wrangler secret put DEEPSEEK_API_KEY       # or OPENAI_API_KEY, see below
```

Non-secret configuration — `AI_PROVIDER`, `AI_MODEL`, `AI_BASE_URL`,
`SEED_ADMIN_EMAIL`, `SEED_STAFF_EMAIL` — lives in the `vars` block of
`wrangler.jsonc`. To run on OpenAI instead of DeepSeek, set
`"AI_PROVIDER": "openai"` there and put `OPENAI_API_KEY` in as a secret. Nothing
else changes.

## 4. Build and deploy

```bash
npm run cf:deploy
# = npm run build && wrangler deploy
```

`npm run build` writes the SPA to `dist/`, which `wrangler.jsonc` uploads as the
`ASSETS` binding. `run_worker_first` is on, so every request reaches the Worker
first and only the paths it does not own fall through to the asset server —
`not_found_handling: "single-page-application"` then turns an unknown path into
`index.html`, which is what makes a hard refresh on `/staff/projects` work.

## 5. Seed the first accounts, once

The Express build seeds at boot. A Worker has no boot, so this is an explicit
call:

```bash
curl -X POST https://<your-worker>.workers.dev/api/setup
```

It creates the admin account (and the staff account, if you set its password),
plus four sample projects — and only on a completely empty database. After that
it answers 409 forever. It also refuses outright, 403, unless
`SEED_ADMIN_PASSWORD` is set, so a fresh deployment cannot be claimed by someone
who read a default password out of this repository.

Passwords are never echoed in the response. You set them; you already know them.

Sign in at `https://<your-worker>.workers.dev` and change nothing else — there is
no password change route, so treat the seeded admin password as the real one from
the start.

## Local development against the Worker

```bash
npm run build                                   # the Worker serves dist/, not Vite
npx wrangler dev                                # miniflare, local D1
```

Apply the schema with `--local` first (step 2). `wrangler dev --remote` runs
against the real D1 database instead, which is occasionally what you want and
never what you want by accident.

## Housekeeping

An hourly cron trigger sweeps expired session rows. It is configured in
`wrangler.jsonc` under `triggers.crons` and handled by the `scheduled` export in
`worker/index.ts`. Nothing depends on it for correctness — an expired session is
already refused in SQL — so a failed run is not an incident.

## Things that will bite

- **Password hashes are not portable between the builds.** scrypt does not exist
  on Workers, so the Worker uses PBKDF2. An account seeded locally cannot sign in
  on the Worker, and vice versa. Copying a local `.db` into D1 brings the
  projects and interests but not the logins. The Worker logs the mismatch
  explicitly rather than reporting a wrong password. See `worker/auth.ts` and the
  README.
- **`npm run build` does not type-check the Worker.** The root `tsconfig.json`
  excludes `worker/`. Run `npx tsc -p worker --noEmit` before deploying.
- **`server/constants.mjs` and `worker/constants.ts` are two copies.** Change
  both in the same commit or the school list drifts between deployments.
- **D1 has no `PRAGMA`.** `worker/schema.sql` is kept free of anything D1 cannot
  execute, and the local build applies its two pragmas separately for exactly
  this reason. Keep it that way.
