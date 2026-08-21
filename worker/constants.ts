/**
 * Domain values both halves of the app must agree on.
 *
 * A copy of server/constants.mjs, typed. It is a copy and not an import because
 * server/ is a frozen, untyped ESM tree that the Worker build has no business
 * pulling into its bundle — but that makes it a file that can drift, so: if you
 * change a value here, change it there in the same commit. The client never
 * holds its own copy; it reads whichever of the two answered /api/meta.
 *
 * The source for the school list is server/constants.mjs, which cites
 * https://www.sp.edu.sg/courses/schools (checked 2026-08-21).
 */

export const SP_SCHOOLS = [
  'School of Architecture & the Built Environment',
  'School of Business',
  'School of Chemical & Life Sciences',
  'School of Computing',
  'School of Electrical & Electronic Engineering',
  'School of Life Skills & Communication',
  'Media, Arts & Design School',
  'School of Mechanical & Aeronautical Engineering',
  'School of Mathematical Sciences & Analytics',
  'Singapore Maritime Academy',
] as const;

/** Open to interest, or not. There is deliberately no "draft". */
export const PROJECT_STATUSES = ['available', 'closed'] as const;

/** What an admin sees on the roster after a lecturer raises their hand. */
export const INTEREST_STATUSES = ['pending', 'shortlisted', 'declined'] as const;

export const ROLES = ['admin', 'staff'] as const;

/** Shown when the client's name is under NDA or otherwise not for circulation. */
export const UNDISCLOSED_CLIENT = 'Undisclosed';

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type InterestStatus = (typeof INTEREST_STATUSES)[number];
export type Role = (typeof ROLES)[number];
