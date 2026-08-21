# FRONTEND CONTRACTS — SP DSAC Project Portal

This file is the single source of truth for the four parallel workstreams (A, B, C, D).
B and C are implemented blind, in parallel, against the signatures below. If a signature
here disagrees with something you'd rather do, the signature wins. If a signature is
genuinely wrong (won't compile, contradicts the server), fix it in workstream A **and**
update this file in the same change.

The Express server (`server/*.mjs`) is **frozen**. No workstream edits it. The frontend
adapts to the server, never the reverse.

---

## 1. Architecture decisions

### 1.1 Routing — pathname switch, no react-router

The photo booth does not use react-router: its `App.tsx` switches on
`window.location.pathname` and renders a page. We keep that pattern, upgraded with
`history.pushState` so in-app navigation doesn't reload the page (the booth could get
away with full reloads; a portal with filter state cannot).

Why not add react-router: the portal has exactly six routes, no nesting, no loaders,
no params except what we parse ourselves. A dependency that owns `<Link>`, context, and
data conventions buys nothing here and forces four agents to agree on its idioms. A
40-line hook is the whole need. The Express server already rewrites all non-`/api`
paths to `index.html`, and Vite dev serves the SPA, so real pathnames work in both.

Routes (canonical, no others):

| Path | Who | Page |
|---|---|---|
| `/login` | signed-out | `LoginPage` |
| `/admin/projects` | admin | `AdminProjectsPage` (B) |
| `/admin/staff` | admin | `AdminStaffPage` (B) |
| `/staff/projects` | staff | `StaffProjectsPage` (C) |
| `/staff/profile` | StaffProfilePage | `StaffProfilePage` (C) |
| anything else | — | redirect to the role home (below) |

Role home: admin → `/admin/projects`, staff → `/staff/projects`, signed-out → `/login`.

`src/lib/router.ts` (owned by A) exports:

```ts
/** Current pathname, re-rendering on pushState/popstate. */
export function usePath(): string;

/** pushState + notify. Pass replace for redirects so Back doesn't loop. */
export function navigate(path: string, opts?: { replace?: boolean }): void;
```

Pages never touch `window.location` or `history` directly — only `navigate()`.
`App.tsx` (A) owns the route table, the role gating, and the redirects. B and C export
page components; they never decide *whether* they render, only *what*.

### 1.2 Data fetching — typed fetch client + local component state, no react-query

No react-query, no SWR, no cache layer. Every page that needs data does the booth's
pattern: `useState` + `useEffect` + the typed API client, with `loading` / `error` /
`data` state local to the page (see the booth's `GalleryPage` for the reference shape).
After a mutation, the page either refetches its list or splices the returned object
into local state — mutations below all return the updated entity precisely so that
splicing works without a refetch.

Why: the portal's data is small (tens of projects, tens of staff), per-page, and never
shared between two mounted pages — the shell holds no data. A cache would be config
without payoff, and two agents inventing query-key conventions in parallel is a merge
conflict generator.

The one piece of app-global state is the session, held in `AuthContext` (A, in
`src/lib/auth.tsx`):

```ts
export interface AuthState {
  /** undefined = /api/auth/me still in flight (boot), null = signed out. */
  user: User | null | undefined;
  login(email: string, password: string): Promise<User>;   // throws ApiError on 401
  logout(): Promise<void>;                                  // always lands on /login
  /** Replace the cached user after PUT /api/profile succeeds. */
  setUser(user: User): void;
}
export function useAuth(): AuthState;  // throws if no provider above it
```

### 1.3 Auth gating

- On boot, `AuthProvider` calls `api.me()`. While `user === undefined`, `App` renders
  a bare centered `Spinner` on the plain background — no shell, no flash of login.
- `user === null` → any path renders `LoginPage` (and `navigate('/login', {replace:true})`
  if not already there). After successful login, `navigate` to the role home.
- Signed in but on the wrong role's path (or `/login`, or an unknown path) → redirect
  to the role home with `replace`.
- Mid-session expiry: the API client fires a registered `onUnauthorized` callback on any
  401. `AuthProvider` registers it and sets `user` to null; App's normal gating then
  shows login. Pages don't handle 401 themselves.
- The server is the real enforcement. The client gating is UX only.

### 1.4 The shell

`App.tsx` renders `PortalShell` (A) around every signed-in page — pages do **not**
render the shell themselves. App supplies the role's nav list; nav ids are route paths,
and `onNavigate` is just `navigate`. This is the StudioShell pattern (left rail,
collapsible, white rounded main card, `scroll` mode) with the nav made generic.

All portal pages pass `scroll` (every page here is a scrolling list or a form; nothing
is kiosk-pinned).

---

## 2. File ownership

Every file in the repo, existing or to be created, belongs to exactly one workstream.
**A rule that overrides the table: B writes only inside `src/pages/admin/` and
`components/features/admin/`; C only inside `src/pages/staff/` and
`components/features/staff/`; D only inside `worker/`, `docs/` (except this file), and
root `README.md` / `wrangler.jsonc`.** Extra internal files are allowed inside your own
directories; nothing outside them.

### Workstream A — shared foundation (build first; B/C/D start from its merge)

| File | Contents |
|---|---|
| `src/main.tsx` | ReactDOM bootstrap, imports `globals.css`, wraps `<AuthProvider><App/></AuthProvider>` |
| `src/App.tsx` | Route table, auth gating, redirects, renders `PortalShell` + active page |
| `src/vite-env.d.ts` | Vite client types |
| `src/globals.css` | **Exists. Additive edits only, by A only.** |
| `src/lib/types.ts` | Every shared type in §3.1 |
| `src/lib/api.ts` | `ApiError` + the client in §4 |
| `src/lib/auth.tsx` | `AuthProvider`, `useAuth` |
| `src/lib/router.ts` | `usePath`, `navigate` |
| `src/lib/format.ts` | `formatDuration`, `formatDate` (§3.3) |
| `components/ui/Button.tsx` | §3.2 |
| `components/ui/SectionHeader.tsx` | §3.2 |
| `components/ui/AmbientOrb.tsx` | Ported verbatim from the booth |
| `components/ui/PortalShell.tsx` | §3.2 |
| `components/ui/GlowCard.tsx` | §3.2 |
| `components/ui/StatusBadge.tsx` | §3.2 |
| `components/ui/Tag.tsx` | §3.2 |
| `components/ui/TagInput.tsx` | §3.2 (used by B's project form and C's profile form) |
| `components/ui/Field.tsx` | §3.2 |
| `components/ui/Select.tsx` | §3.2 (`.dsac-input` select + Phosphor caret overlay) |
| `components/ui/Modal.tsx` | §3.2 |
| `components/ui/ConfirmDialog.tsx` | §3.2 |
| `components/ui/EmptyState.tsx` | §3.2 |
| `components/ui/Spinner.tsx` | §3.2 |
| `components/ui/ErrorNote.tsx` | §3.2 |
| `src/pages/LoginPage.tsx` | Email+password card on AmbientOrb background |
| `index.html` | Exists; A sets title "SP DSAC Project Portal", favicon |
| `package.json`, `package-lock.json` | Only A edits (and only if a dependency is truly needed — default is none) |
| `tsconfig.json`, `vite.config.ts`, `postcss.config.mjs`, `eslint.config.*` | Only A edits |

### Workstream B — admin dashboard

| File | Contents |
|---|---|
| `src/pages/admin/AdminProjectsPage.tsx` | Project list (glow cards w/ interestCount), create/edit modal, status toggle, delete confirm, roster drawer per project |
| `src/pages/admin/AdminStaffPage.tsx` | Staff directory |
| `components/features/admin/ProjectForm.tsx` | Create/edit form incl. Generate-skills button (`api.suggestSkills`) feeding `TagInput` |
| `components/features/admin/RosterPanel.tsx` | Interests for one project: profile detail + pending/shortlisted/declined controls |
| `components/features/admin/StaffCard.tsx` | One directory entry (expandable profile) |

### Workstream C — staff dashboard + profile

| File | Contents |
|---|---|
| `src/pages/staff/StaffProjectsPage.tsx` | Card grid, filter bar, express/withdraw flows |
| `src/pages/staff/StaffProfilePage.tsx` | Profile editor (uses `api.meta()` for the school `Select`) |
| `components/features/staff/ProjectCard.tsx` | One project glow card: status, NDA, client, duration, skills, my-interest state |
| `components/features/staff/FilterBar.tsx` | Text search + status filter + skill filter (client-side filtering only) |
| `components/features/staff/InterestDialog.tsx` | Modal with optional message → `api.expressInterest` |
| `components/features/staff/ProfileForm.tsx` | Name/title/school/teaches/skills/background/pastProjects editor |

### Workstream D — Cloudflare Worker port + docs

| File | Contents |
|---|---|
| `worker/index.ts` | Hono app on Workers: every route in §4, same JSON shapes, D1 storage, cookie sessions (Web Crypto in place of node scrypt), serves `dist/` assets |
| `worker/schema.sql` | D1 schema (port of `server/db.mjs` SCHEMA, no PRAGMA) |
| `worker/` (any additional .ts) | D's internals |
| `wrangler.jsonc` | Worker config; D1 binding named `DB`, assets from `dist/` |
| `README.md` | Root readme: dev, seed accounts, env vars, both deploy paths |
| `docs/DEPLOY_CLOUDFLARE.md` | Worker deploy walkthrough (`cf:schema`, `cf:deploy`) |

D's binding contract: the deployed Worker must be indistinguishable to the frontend —
same paths, same status codes, same JSON, same cookie name (`dsac_portal`). D never
touches frontend code; the frontend never knows which backend it's on (all calls are
same-origin relative paths).

### Frozen — no workstream touches

`server/*.mjs`, `data/`, `dist/`, `node_modules/`, `docs/FRONTEND_CONTRACTS.md`
(post-A; A may correct it as noted above).

---

## 3. Workstream A signatures (B and C code against these blind)

### 3.1 `src/lib/types.ts` — complete contents contract

```ts
export type Role = 'admin' | 'staff';
export type ProjectStatus = 'available' | 'closed';
export type InterestStatus = 'pending' | 'shortlisted' | 'declined';

/** Shape of /api/auth/me, /api/auth/login, /api/profile, and roster/directory users. */
export interface User {
  id: string;
  email: string;
  role: Role;
  name: string;
  title: string;          // '' when unset — server stores empty strings, not null
  school: string;         // '' or one of Meta.schools
  teaches: string;        // ''
  skills: string[];
  background: string;     // ''
  pastProjects: string[];
  createdAt: string;      // ISO datetime
  updatedAt: string;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  client: string;                 // 'Undisclosed' when withheld (Meta.undisclosedClient)
  ndaRequired: boolean;
  startsOn: string;               // 'YYYY-MM-DD' or ''
  endsOn: string;                 // 'YYYY-MM-DD' or ''
  durationNote: string;           // free text, may be '' — see formatDuration
  status: ProjectStatus;
  skills: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** GET /api/projects as seen by an admin session. */
export interface AdminProject extends Project {
  interestCount: number;
}

/** The staff member's own interest as embedded in their project list. */
export interface MyInterest {
  status: InterestStatus;
  message: string;
}

/** GET /api/projects as seen by a staff session. */
export interface StaffProject extends Project {
  myInterest: MyInterest | null;
}

export interface Interest {
  id: string;
  projectId: string;
  userId: string;
  message: string;
  status: InterestStatus;
  createdAt: string;
}

/** One row of the admin roster: the interest plus the full profile behind it. */
export interface RosterEntry extends Interest {
  user: User;
}

/** One row of the admin staff directory. */
export interface StaffDirectoryEntry extends User {
  interestCount: number;
}

/** GET /api/meta. Fetch once per page that needs it; do not hardcode schools. */
export interface Meta {
  schools: string[];              // the 10 SP schools, server order
  projectStatuses: ProjectStatus[];
  interestStatuses: InterestStatus[];
  undisclosedClient: string;      // 'Undisclosed'
  ai: { provider: string; model: string; configured: boolean };
}

/** POST /api/skills/suggest. ok:false is a normal outcome, not an exception. */
export interface SuggestResult {
  ok: boolean;
  tags: string[];                 // [] when ok is false
  error?: string;                 // present when ok is false — show it inline
}

/** Body for POST /api/projects; PATCH takes Partial<ProjectInput>. */
export interface ProjectInput {
  title: string;                  // required, non-empty
  description: string;
  client: string;                 // '' ⇒ server stores 'Undisclosed'
  ndaRequired: boolean;
  startsOn: string;               // 'YYYY-MM-DD' or ''
  endsOn: string;
  durationNote: string;
  status: ProjectStatus;
  skills: string[];
}

/** Body for PUT /api/profile. Omitted field = unchanged. */
export interface ProfilePatch {
  name?: string;
  title?: string;
  school?: string;                // must be '' or one of Meta.schools
  teaches?: string;
  skills?: string[];
  background?: string;
  pastProjects?: string[];
}
```

**Correction (made by A, 2026-08-21).** `types.ts` also exports an `IconComponent`
alias, and the two icon props below use it instead of the
`React.ComponentType<{ size?: number; weight?: string }>` this document first
specified. That original spelling does not compile: Phosphor types `weight` as its
own union, and under `strictFunctionTypes` a component asking for the wider
`string` cannot be handed one that only accepts the narrower union. `IconComponent`
accepts every Phosphor icon and any plain function component, so call sites are
unchanged — you still pass `icon={Folders}`.

```ts
export type IconComponent = React.ComponentType<{
  size?: number;
  weight?: IconWeight;      // from '@phosphor-icons/react'
  className?: string;
}>;
```

### 3.2 UI primitives — full props

All primitives are default exports except where noted. All accept `className` merged
last. Interfaces are exported alongside.

```ts
// components/ui/Button.tsx — booth variants, WEB-scale heights (see §5.7)
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;   // default 'primary'
  size?: ButtonSize;         // default 'md'
}
// sm: min-h-8 px-3.5 text-[0.8125rem] gap-1.5
// md: min-h-10 px-5 text-[0.875rem]  gap-2
// lg: min-h-11 px-6 text-[0.9375rem] gap-2
// 'danger' is new for the portal (delete project): like primary but no glow shadow —
// bg-[var(--accent)] only on hover-confirm contexts is wrong; keep it simple:
// danger = ghost coloring at rest (text --accent-ink), solid --accent on hover.
```

```ts
// components/ui/SectionHeader.tsx — port from booth unchanged
export interface SectionHeaderProps {
  eyebrow: string;                 // UPPERCASE gradient line
  title: React.ReactNode;          // MUST end with a period — see §5.2
  subtitle?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';       // default 'md'; 'lg' only on LoginPage
  align?: 'center' | 'left';       // default 'center'; dashboard pages use 'left'
  className?: string;
}
```

```ts
// components/ui/GlowCard.tsx — wraps .dsac-glow-card and owns the hue rotation
export type GlowTone = 'rose' | 'amber' | 'iris';
export const GLOW_ORDER: GlowTone[] = ['rose', 'amber', 'iris'];
export interface GlowCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Either name a tone, or pass a list index and the card picks
   *  GLOW_ORDER[index % 3]. Exactly one of the two; index wins if both. */
  tone?: GlowTone;
  index?: number;
  /** Adds .dsac-glow-card-interactive (hover lift). Only for clickable cards. */
  interactive?: boolean;
  children: React.ReactNode;
}
// Implementation sets style={{ '--card-glow': `var(--glow-${tone})` }} and
// className="dsac-glow-card …". Consumers NEVER hand-write the CSS var.
```

```ts
// components/ui/StatusBadge.tsx — the only way status is rendered. NO DOTS. §5.8
export interface StatusBadgeProps {
  status: ProjectStatus | InterestStatus;
  className?: string;
}
// Text-only pill: available → bg --ok-wash / text --ok; closed & declined →
// bg --muted-wash / text --ink-2; pending → bg --muted-wash / text --ink-2;
// shortlisted → bg --ok-wash / text --ok. Label is the status word, capitalized.
```

```ts
// components/ui/Tag.tsx — one skill chip (read-only)
export interface TagProps {
  label: string;
  onRemove?: () => void;    // renders a Phosphor X button when present
  className?: string;
}
```

```ts
// components/ui/TagInput.tsx — skills editor for B's ProjectForm and C's ProfileForm
export interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  /** Server caps: 20 for projects, unbounded-ish for profiles; default 20. */
  max?: number;
  disabled?: boolean;
  id?: string;              // for Field's label htmlFor
}
// Behavior contract: type + Enter or comma adds; Backspace on empty input removes
// last; duplicates (case-insensitive) silently dropped; renders Tag with onRemove.
```

```ts
// components/ui/Field.tsx — label + control + optional hint/error, .dsac-input styling
export interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;            // muted line under the control
  error?: string;           // replaces hint, in --accent-ink
  required?: boolean;       // renders a muted 'required' tag, not an asterisk
  className?: string;
  children: React.ReactNode; // the control; Field does NOT clone props onto it
}
```

```ts
// components/ui/Select.tsx — native select styled as .dsac-input + Phosphor CaretDown
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Convenience: renders <option> list; children also allowed instead. */
  options?: { value: string; label: string }[];
}
```

```ts
// components/ui/Modal.tsx — scrim + panel using .dsac-fade-in / .dsac-pop-up
export interface ModalProps {
  open: boolean;
  onClose: () => void;       // scrim click and Escape both call this
  title: string;
  /** max-w of the panel; default 'md' (28rem). 'lg' = 40rem for ProjectForm/roster. */
  width?: 'md' | 'lg';
  children: React.ReactNode;
  /** Optional sticky footer row (usually Buttons, right-aligned). */
  footer?: React.ReactNode;
}
```

```ts
// components/ui/ConfirmDialog.tsx — built on Modal
export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;      // e.g. 'Delete project'
  danger?: boolean;          // confirm Button variant 'danger' vs 'primary'
  busy?: boolean;            // disables both buttons while the request runs
  onConfirm: () => void;
  onCancel: () => void;
}
```

```ts
// components/ui/EmptyState.tsx
export interface EmptyStateProps {
  icon: IconComponent;       // a Phosphor icon (see the note below)
  title: string;
  body?: string;
  action?: React.ReactNode;  // usually a Button
  className?: string;
}
```

```ts
// components/ui/Spinner.tsx — static-position loading indicator (rotation is allowed
// motion; it is progress, not decoration)
export interface SpinnerProps { size?: number; className?: string } // default 20
```

```ts
// components/ui/ErrorNote.tsx — inline request-failure strip used by every page
export interface ErrorNoteProps {
  message: string;
  onRetry?: () => void;      // renders a small 'Try again' ghost Button
  className?: string;
}
```

```ts
// components/ui/PortalShell.tsx — StudioShell generalized
export interface NavItem {
  path: string;              // route path; also the active key
  label: string;
  Icon: IconComponent;       // see the note under §3.1
}
export interface PortalShellProps {
  nav: NavItem[];            // App passes the role's list
  activePath: string;
  onNavigate: (path: string) => void;
  user: User;                // name + role rendered in the account block
  onLogout: () => void;
  children: React.ReactNode;
}
// Always scrolls (StudioShell's scroll=true branch is the only branch).
// Collapse state persists under localStorage key 'dsac.portal.rail.collapsed'.
// App's nav lists (fixed, for reference — Phosphor icons):
//   admin: [{ '/admin/projects', 'Projects', Folders }, { '/admin/staff', 'Staff', UsersThree }]
//   staff: [{ '/staff/projects', 'Projects', Folders }, { '/staff/profile', 'My profile', UserCircle }]
```

### 3.3 `src/lib/format.ts`

```ts
/** 'YYYY-MM-DD' → '12 Jan 2027'; '' → ''. en-SG month-name style, no locale drift. */
export function formatDate(iso: string): string;

/**
 * The one duration renderer, so both dashboards phrase it identically:
 *  - durationNote wins outright when non-empty.
 *  - else both dates:   '12 Jan – 20 Mar 2027' (year elided from start when equal)
 *  - else startsOn only: 'From 12 Jan 2027'
 *  - else endsOn only:   'Until 20 Mar 2027'
 *  - else:               'Timeline to be confirmed'
 */
export function formatDuration(p: Pick<Project, 'startsOn' | 'endsOn' | 'durationNote'>): string;
```

---

## 4. API client — `src/lib/api.ts`

One object export `api`. All paths are relative (`/api/...`), all requests
`credentials: 'include'`, JSON in/out. On any non-2xx the client throws:

```ts
export class ApiError extends Error {
  status: number;            // HTTP status
  // message = the server's `error` string when present, else `Request failed (status)`
}
```

Exception: `suggestSkills` — the server deliberately returns 200 with `ok:false`;
the client passes that through and never throws for it (network failure still throws).

401 handling: `api.onUnauthorized(cb)` registers a single callback (AuthProvider's);
the client invokes it on any 401 **except** from `login`, then still throws.

```ts
export const api = {
  onUnauthorized(cb: () => void): void,

  // meta
  meta(): Promise<Meta>,                                        // GET /api/meta

  // auth
  login(email: string, password: string): Promise<User>,        // POST /api/auth/login → {user}
  logout(): Promise<void>,                                      // POST /api/auth/logout
  me(): Promise<User | null>,                                   // GET /api/auth/me → {user}

  // profile (staff or admin editing their own record)
  updateProfile(patch: ProfilePatch): Promise<User>,            // PUT /api/profile → {user}

  // projects — same route, role-shaped; call the one matching your session's role
  listProjectsAdmin(): Promise<AdminProject[]>,                 // GET /api/projects → {projects}
  listProjectsStaff(): Promise<StaffProject[]>,                 // GET /api/projects → {projects}
  createProject(input: ProjectInput): Promise<AdminProject>,    // POST /api/projects → {project} (201)
  updateProject(id: string, patch: Partial<ProjectInput>): Promise<AdminProject>,
                                                                // PATCH /api/projects/:id → {project}
  deleteProject(id: string): Promise<void>,                     // DELETE /api/projects/:id → {ok}

  // interest (staff)
  expressInterest(projectId: string, message?: string): Promise<MyInterest>,
                                                                // POST /api/projects/:id/interest → {interest}
                                                                // 409 when the project is closed
  withdrawInterest(projectId: string): Promise<void>,           // DELETE /api/projects/:id/interest → {ok}

  // roster + directory (admin)
  listInterests(projectId: string): Promise<RosterEntry[]>,     // GET /api/projects/:id/interests → {interests}
  setInterestStatus(interestId: string, status: InterestStatus): Promise<Interest>,
                                                                // PATCH /api/interests/:id → {interest}
  listStaff(): Promise<StaffDirectoryEntry[]>,                  // GET /api/staff → {staff}

  // AI suggestion (admin) — NEVER throws on ok:false; see §5.6
  suggestSkills(description: string): Promise<SuggestResult>,   // POST /api/skills/suggest
};
```

Server behaviors the pages must honor:

- `PATCH /api/projects/:id` with `{ status }` alone is the status toggle — send only
  the changed field, not the whole form.
- `expressInterest` on a closed project is a 409 with a human message; show
  `err.message`, don't special-case the code.
- `withdrawInterest` on a never-expressed interest succeeds (idempotent).
- Login failure is one generic 401 message by design; show it verbatim, never
  "wrong password".
- Empty `client` on save becomes `'Undisclosed'` server-side; the form may show a
  "leave blank for Undisclosed" hint rather than inventing a checkbox.

---

## 5. Design rules

**Moved.** These now live in [`DESIGN.md`](./DESIGN.md), which documents the
glow-card system as a whole rather than as build instructions for one sprint.

That file is the authority on tokens, the type grammar, the glow card and its
hue rotation, button hierarchy, form controls, motion, icons, the brand mark,
and the explicit "do not" list — including the two documented departures from
dsac-photo-booth (web-scale hit areas; no animated status dots).

Read it before writing a component. This section is kept as a pointer because
the workstream prompts referenced "§5" by number.


## 6. Build order

1. **A** merges first — everything above must compile (`npm run build`) with a working
   login → empty shell for both roles.
2. **B**, **C**, **D** run in parallel off A's merge. B and C import only from
   `src/lib/*` and `components/ui/*`. D imports nothing from the frontend.
3. Integration check: `npm run dev`, log in as both seeded accounts, walk both
   dashboards; then `npm run build && npm start` for the same-origin production path.
