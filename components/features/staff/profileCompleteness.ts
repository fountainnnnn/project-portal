import type { User } from '@/src/lib/types';

/**
 * WHY THE PROFILE MATTERS — the one thing worth knowing about this whole page.
 *
 * DSAC does not pick lecturers from a list of names. When a project comes in,
 * an admin opens the staff directory and the project's roster and reads exactly
 * these fields — school, what you teach, your skills, your background, what
 * you've shipped before — to decide who fits. Nothing else about a lecturer is
 * visible to them.
 *
 * So an empty profile is not "a profile I'll fill in later". It is being
 * invisible: you can express interest on every project on the board and still
 * never be shortlisted, because the person deciding has nothing to read. That
 * is the reason this page nags, and the reason the nudge also appears on the
 * projects dashboard where a lecturer actually spends their time.
 */

/** The fields an admin reads. Order is the order they matter when judging fit. */
const READ_BY_ADMIN: { key: keyof User; label: string }[] = [
  { key: 'school', label: 'your school' },
  { key: 'teaches', label: 'what you teach' },
  { key: 'skills', label: 'your skills' },
  { key: 'background', label: 'your background' },
  { key: 'pastProjects', label: 'past projects' },
];

/** Human-readable names of the admin-facing fields still blank. */
export function profileGaps(user: User): string[] {
  return READ_BY_ADMIN.filter(({ key }) => {
    const value = user[key];
    return Array.isArray(value) ? value.length === 0 : !String(value ?? '').trim();
  }).map(({ label }) => label);
}

/**
 * True when there is effectively nothing for an admin to judge. Deliberately
 * not "any gap is empty" — a lecturer who filled in three of five fields is
 * findable, and nagging them would just teach them to ignore the banner.
 */
export function isProfileEmpty(user: User): boolean {
  return profileGaps(user).length >= READ_BY_ADMIN.length - 1;
}
