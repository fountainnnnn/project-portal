import { hashPassword } from './auth';
import type { Db, ProjectInput } from './db';
import type { Env } from './env';
import type { Role } from './constants';

/**
 * The accounts and sample projects a fresh deployment needs to be usable —
 * server/seed.mjs, moved behind an explicit call.
 *
 * The Express build runs its seed at boot, which is the right place for it
 * there and impossible here: a Worker has no boot. The alternatives were a
 * count-and-maybe-seed on every request (a D1 round trip per request, forever,
 * to answer a question that is only interesting once) or a one-shot route. This
 * is the route — POST /api/setup — and index.ts wires it.
 *
 * Two locks, because an unauthenticated route that creates an administrator is
 * exactly as dangerous as it sounds:
 *
 *  1. It refuses if any user already exists. So the window in which it does
 *     anything at all is the minutes between `wrangler deploy` and the first
 *     setup call, and after that it is inert forever.
 *  2. It refuses unless SEED_ADMIN_PASSWORD is set as a secret. The local build
 *     falls back to a printed default; a public URL must not, or the first
 *     stranger to guess the path owns the portal. There is no default here on
 *     purpose.
 *
 * Sample projects are added only when the project table is completely empty,
 * exactly as in the original — once an administrator has created anything real,
 * this must never add to it.
 */

interface SeedAccount {
  role: Role;
  email: string;
  password: string;
  name: string;
  title?: string;
  school?: string;
  teaches?: string;
  skills?: string[];
  background?: string;
  pastProjects?: string[];
}

function seedAccounts(env: Env): SeedAccount[] {
  return [
    {
      role: 'admin',
      email: env.SEED_ADMIN_EMAIL ?? 'admin@dsac.sp.edu.sg',
      password: env.SEED_ADMIN_PASSWORD ?? '',
      name: 'DSAC Administrator',
      title: 'Centre Administrator',
      school: 'School of Computing',
    },
    {
      role: 'staff',
      email: env.SEED_STAFF_EMAIL ?? 'staff@sp.edu.sg',
      password: env.SEED_STAFF_PASSWORD ?? '',
      name: 'Wei Ling Tan',
      title: 'Senior Lecturer',
      school: 'School of Computing',
      teaches: 'Data Engineering, Applied Machine Learning',
      skills: ['Python', 'SQL', 'Machine Learning', 'Data Visualisation'],
      background:
        'Twelve years teaching data engineering, four of them running the diploma capstone. Industry background in retail analytics before joining SP.',
      pastProjects: [
        'Retail demand forecasting pilot with a local grocery chain (2024)',
        'Student attrition early-warning dashboard for SP Registrar (2023)',
      ],
    },
  ];
}

/**
 * Written to read like projects DSAC would actually hold: a named client where
 * it can be named, "Undisclosed" where it cannot, and one already closed so the
 * status filter has something to do on first run.
 */
const SEED_PROJECTS: ProjectInput[] = [
  {
    title: 'Computer vision quality inspection for a precision manufacturer',
    description:
      'The client runs three production lines and inspects finished parts by eye, which is slow and inconsistent across shifts. They want a camera-based system that flags surface defects — scratches, discolouration, misaligned drilling — before parts reach packing. Scope covers a labelled dataset built from their own line footage, a model that runs on an edge device on the factory floor, and a simple operator screen showing pass/fail with the defect highlighted. Deployment hardware is the client’s to buy; the team specifies it.',
    client: 'Undisclosed',
    ndaRequired: true,
    durationNote: '6 months',
    status: 'available',
    skills: ['Computer Vision', 'PyTorch', 'Edge Deployment', 'Data Labelling', 'Python'],
  },
  {
    title: 'Energy consumption dashboard for SP campus buildings',
    description:
      'Facilities holds half-hourly meter readings for every building on campus but reviews them in spreadsheets once a month, so nothing is caught until the bill arrives. This project builds a dashboard that surfaces consumption by building, compares against the same period last year, and raises an alert when a building drifts outside its normal band. The reporting layer matters more than the modelling — the audience is facilities staff, not analysts.',
    client: 'SP Office of Facilities Management',
    ndaRequired: false,
    durationNote: '4 months',
    status: 'available',
    skills: ['Power BI', 'SQL', 'Time Series Analysis', 'Data Modelling', 'Stakeholder Management'],
  },
  {
    title: 'Conversational assistant for a social service agency intake desk',
    description:
      'A social service agency handles a high volume of first-contact enquiries, most of which are the same dozen questions about eligibility and required documents. They want an assistant on their website that answers those reliably in English and Mandarin, and hands over to a human the moment a question touches an actual case. Accuracy and a clean escalation path matter far more than breadth here — a wrong answer about eligibility is worse than no answer.',
    client: 'Undisclosed',
    ndaRequired: true,
    durationNote: '5 months',
    status: 'available',
    skills: ['Natural Language Processing', 'Retrieval Augmented Generation', 'UX Writing', 'Prompt Engineering'],
  },
  {
    title: 'Predictive maintenance for a marine fleet operator',
    description:
      'Engine sensor data from a coastal fleet, currently logged and never analysed. The operator wants to know which vessels are drifting toward an unplanned failure so servicing can be scheduled in port rather than at sea. Closed for now — the team is confirmed and work starts next term.',
    client: 'Undisclosed',
    ndaRequired: true,
    durationNote: '8 months',
    status: 'closed',
    skills: ['Predictive Maintenance', 'Sensor Data', 'Anomaly Detection', 'Python'],
  },
];

export type SetupResult =
  | { ok: true; created: { role: Role; email: string }[]; projects: number }
  | { ok: false; status: 403 | 409; error: string };

export async function runSetup(db: Db, env: Env): Promise<SetupResult> {
  if (!env.SEED_ADMIN_PASSWORD) {
    return {
      ok: false,
      status: 403,
      error:
        'Setup is disabled: SEED_ADMIN_PASSWORD is not set. Run `wrangler secret put SEED_ADMIN_PASSWORD` (and SEED_STAFF_PASSWORD), redeploy, then call this again.',
    };
  }

  if ((await db.users.count()) > 0) {
    return {
      ok: false,
      status: 409,
      error: 'This portal already has accounts. Setup runs once, on an empty database.',
    };
  }

  const created: { role: Role; email: string }[] = [];

  for (const account of seedAccounts(env)) {
    // A staff seed with no password is skipped rather than given a guessable
    // one. The admin account is enough to make the portal usable, and an
    // administrator can add lecturers properly from there.
    if (!account.password) continue;

    const { salt, hash } = await hashPassword(account.password);
    await db.users.create({
      email: account.email,
      passwordHash: hash,
      passwordSalt: salt,
      role: account.role,
      name: account.name,
      title: account.title ?? '',
      school: account.school ?? '',
      teaches: account.teaches ?? '',
      skills: account.skills ?? [],
      background: account.background ?? '',
      pastProjects: account.pastProjects ?? [],
    });

    created.push({ role: account.role, email: account.email });
  }

  // Passwords are never echoed back. The caller set them; the Express build
  // prints them to a console only its operator can see, which a public HTTP
  // response is not.
  let projects = 0;
  if ((await db.projects.count()) === 0) {
    const all = await db.users.list();
    const admin = all.find((user) => user.role === 'admin');
    for (const project of SEED_PROJECTS) {
      await db.projects.create({ ...project, createdBy: admin?.id ?? '' });
      projects += 1;
    }
  }

  return { ok: true, created, projects };
}
