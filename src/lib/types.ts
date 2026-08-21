/**
 * Shared types — the contract between every workstream.
 *
 * These mirror the Express server's JSON exactly. The server stores empty
 * strings rather than nulls for optional text, so nothing here is `string |
 * null`: a missing title is `''`, and pages can render it without a guard.
 * The one genuine absence in the model is `StaffProject.myInterest`, which is
 * null when the staff member has not expressed interest at all.
 */

import type { IconWeight } from '@phosphor-icons/react';

export type Role = 'admin' | 'staff';
export type ProjectStatus = 'available' | 'closed';
export type InterestStatus = 'pending' | 'shortlisted' | 'declined';

/** Shape of /api/auth/me, /api/auth/login, /api/profile, and roster/directory users. */
export interface User {
  id: string;
  email: string;
  role: Role;
  name: string;
  title: string; // '' when unset — server stores empty strings, not null
  school: string; // '' or one of Meta.schools
  teaches: string; // ''
  skills: string[];
  background: string; // ''
  pastProjects: string[];
  createdAt: string; // ISO datetime
  updatedAt: string;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  client: string; // 'Undisclosed' when withheld (Meta.undisclosedClient)
  ndaRequired: boolean;
  startsOn: string; // 'YYYY-MM-DD' or ''
  endsOn: string; // 'YYYY-MM-DD' or ''
  durationNote: string; // free text, may be '' — see formatDuration
  status: ProjectStatus;
  skills: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * GET /api/projects as seen by an admin session.
 *
 * Admin and staff hit the same route; the server shapes the rows to the
 * session's role. That is why the client exposes two methods over one path —
 * the caller states which role it is running as, and TypeScript keeps the two
 * result shapes from being confused for one another.
 */
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
  schools: string[]; // the 10 SP schools, server order
  projectStatuses: ProjectStatus[];
  interestStatuses: InterestStatus[];
  undisclosedClient: string; // 'Undisclosed'
  ai: { provider: string; model: string; configured: boolean };
}

/** POST /api/skills/suggest. ok:false is a normal outcome, not an exception. */
export interface SuggestResult {
  ok: boolean;
  tags: string[]; // [] when ok is false
  error?: string; // present when ok is false — show it inline
}

/** Body for POST /api/projects; PATCH takes Partial<ProjectInput>. */
export interface ProjectInput {
  title: string; // required, non-empty
  description: string;
  client: string; // '' ⇒ server stores 'Undisclosed'
  ndaRequired: boolean;
  startsOn: string; // 'YYYY-MM-DD' or ''
  endsOn: string;
  durationNote: string;
  status: ProjectStatus;
  skills: string[];
}

/** Body for PUT /api/profile. Omitted field = unchanged. */
export interface ProfilePatch {
  name?: string;
  title?: string;
  school?: string; // must be '' or one of Meta.schools
  teaches?: string;
  skills?: string[];
  background?: string;
  pastProjects?: string[];
}

/**
 * The shape a component prop takes when it accepts an icon.
 *
 * The contract originally spelled this `weight?: string`, which does not
 * compile: Phosphor types `weight` as its own union, and a component asking
 * for the wider `string` cannot be handed one that only accepts the narrower
 * union. Naming Phosphor's `IconWeight` here accepts every Phosphor icon and
 * still accepts a plain function component, so callers pass `{Folders}`
 * exactly as before.
 */
export type IconComponent = React.ComponentType<{
  size?: number;
  weight?: IconWeight;
  className?: string;
}>;
