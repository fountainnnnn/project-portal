/**
 * Domain values that both halves of the app must agree on.
 *
 * The client fetches these from `/api/meta` rather than keeping its own copy.
 * A school list duplicated in two languages is a list that drifts, and the
 * server is the half that has to validate against it anyway.
 */

/**
 * Singapore Polytechnic's ten academic schools, verbatim from
 * https://www.sp.edu.sg/courses/schools (checked 2026-08-21).
 *
 * Order is the site's own, which is alphabetical apart from the two schools
 * whose names do not begin with "School of". Left as published so a lecturer
 * scanning the dropdown sees the list they already know.
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
];

/**
 * A project is either open to interest or it is not. There is deliberately no
 * "draft" — an admin who is not ready to publish simply has not created it,
 * and a third state would only raise the question of who can see it.
 */
export const PROJECT_STATUSES = ['available', 'closed'];

/** What an admin sees on the roster after a staff member raises their hand. */
export const INTEREST_STATUSES = ['pending', 'shortlisted', 'declined'];

export const ROLES = ['admin', 'staff'];

/** Shown when the client's name is under NDA or otherwise not for circulation. */
export const UNDISCLOSED_CLIENT = 'Undisclosed';
