import { hashPassword } from './auth.mjs';

/**
 * The two accounts a fresh checkout needs to be usable, plus a handful of
 * projects so neither dashboard opens on an empty page.
 *
 * Idempotent by design: it creates an account only when that email is absent,
 * and adds sample projects only when the project table is completely empty.
 * Running the server twice therefore does nothing the second time, and nobody
 * loses real data to a restart.
 *
 * The passwords are weak on purpose — they are development credentials printed
 * to the console at boot. Before this portal holds a real client list, change
 * them, and set SEED_ADMIN_PASSWORD / SEED_STAFF_PASSWORD in .env so they are
 * never these.
 */

const SEED_ACCOUNTS = [
  {
    role: 'admin',
    email: process.env.SEED_ADMIN_EMAIL ?? 'admin@dsac.sp.edu.sg',
    password: process.env.SEED_ADMIN_PASSWORD ?? 'admin1234',
    name: 'DSAC Administrator',
    title: 'Centre Administrator',
    school: 'School of Computing',
  },
  {
    role: 'staff',
    email: process.env.SEED_STAFF_EMAIL ?? 'staff@sp.edu.sg',
    password: process.env.SEED_STAFF_PASSWORD ?? 'staff1234',
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

/**
 * Written to read like projects DSAC would actually hold: a named client where
 * it can be named, "Undisclosed" where it cannot, and one already closed so
 * the status filter has something to do on first run.
 */
const SEED_PROJECTS = [
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
      'The client handles a high volume of first-contact enquiries, most of which are the same dozen questions about eligibility and required documents. They want an assistant on their website that answers those reliably in English and Mandarin, and hands over to a human the moment a question touches an actual case. Accuracy and a clean escalation path matter far more than breadth here — a wrong answer about eligibility is worse than no answer.',
    client: 'Undisclosed',
    ndaRequired: true,
    durationNote: '5 months',
    status: 'available',
    skills: ['Natural Language Processing', 'Retrieval Augmented Generation', 'UX Writing', 'Prompt Engineering'],
  },
  {
    title: 'Predictive maintenance for a marine fleet operator',
    description:
      'Engine sensor data from a harbour craft fleet, currently logged and never analysed. The operator wants to know which vessels are drifting toward an unplanned failure so servicing can be scheduled alongside rather than at sea. Closed for now — the team is confirmed and work starts next term.',
    client: 'Undisclosed',
    ndaRequired: true,
    durationNote: '8 months',
    status: 'closed',
    skills: ['Predictive Maintenance', 'Sensor Data', 'Anomaly Detection', 'Python'],
  },
  {
    // Kept nameless on purpose. Three of the samples above carry real client
    // names so the card layout is exercised with the lengths it will actually
    // meet; this one exists so the "Undisclosed" path — the reason that field
    // has a Withhold button at all — is visible on a fresh install too.
    title: 'Fraud signal triage for a digital payments platform',
    description:
      'The client’s review queue is growing faster than the team reading it, and most of what reaches a human is plainly legitimate. They want the queue ranked, so the cases most likely to be fraud surface first, along with a short plain-English reason for each ranking that a reviewer can sanity-check. The client cannot be named until the engagement is signed; the work itself is not sensitive.',
    client: 'Undisclosed',
    ndaRequired: true,
    durationNote: '5 months',
    status: 'available',
    skills: ['Anomaly Detection', 'Feature Engineering', 'Model Explainability', 'Python', 'SQL'],
  },
];

export function ensureSeedAccounts(store) {
  const created = [];

  for (const account of SEED_ACCOUNTS) {
    if (store.users.findByEmailWithSecret(account.email)) continue;

    const { salt, hash } = hashPassword(account.password);
    store.users.create({
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

    created.push({ role: account.role, email: account.email, password: account.password });
  }

  // Sample projects only on a truly empty table. Once an administrator has
  // created anything real, this must never add to it.
  if (store.projects.count() === 0) {
    const admin = store.users
      .list()
      .find((user) => user.role === 'admin');

    for (const project of SEED_PROJECTS) {
      store.projects.create({ ...project, createdBy: admin?.id ?? '' });
    }
  }

  return { created };
}
