/**
 * The typed API client. Every network call in the app goes through here.
 *
 * Two rules the rest of the frontend depends on:
 *
 *  - `credentials: 'include'` on every request. The session is a cookie, and
 *    in dev the page is served from Vite on :5173 while the API answers on
 *    :3001 through a proxy. Omit the flag on one call and that call alone
 *    quietly acts signed-out, which is a miserable thing to debug.
 *  - Non-2xx throws `ApiError` carrying the server's own `error` string. The
 *    server writes messages meant for humans ("This project is closed to new
 *    interest."), so pages render `err.message` verbatim instead of mapping
 *    status codes to sentences of their own.
 */

import type {
  AdminProject,
  Interest,
  InterestStatus,
  Meta,
  MyInterest,
  ProfilePatch,
  ProjectInput,
  RosterEntry,
  StaffDirectoryEntry,
  StaffProject,
  SuggestResult,
  User,
} from './types';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * A single registered handler, not a list. There is exactly one thing in the
 * app that cares about a mid-session expiry — AuthProvider — and letting a
 * page register a second one would mean two components racing to decide what
 * "signed out" looks like.
 */
let unauthorizedHandler: (() => void) | null = null;

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Login's own 401 is an answer, not an expiry — it must not sign anyone out. */
  skipUnauthorizedHandler?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, skipUnauthorizedHandler = false } = opts;

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // fetch only rejects for transport failures, so this is genuinely "the
    // server is unreachable" rather than anything the server said.
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.');
  }

  // 204 and the odd empty body would blow up JSON.parse; treat unparseable as
  // "no payload" and let the status decide whether that is a problem.
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  if (!response.ok) {
    if (response.status === 401 && !skipUnauthorizedHandler) unauthorizedHandler?.();

    const serverMessage = typeof payload?.error === 'string' ? payload.error : '';
    throw new ApiError(response.status, serverMessage || `Request failed (${response.status})`);
  }

  return payload as T;
}

export const api = {
  onUnauthorized(cb: () => void): void {
    unauthorizedHandler = cb;
  },

  // ── meta ──────────────────────────────────────────────────────────────────

  meta(): Promise<Meta> {
    return request<Meta>('/api/meta');
  },

  // ── auth ──────────────────────────────────────────────────────────────────

  async login(email: string, password: string): Promise<User> {
    const { user } = await request<{ user: User }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
      skipUnauthorizedHandler: true,
    });
    return user;
  },

  async logout(): Promise<void> {
    await request<{ ok: true }>('/api/auth/logout', { method: 'POST' });
  },

  async me(): Promise<User | null> {
    // /api/auth/me answers 200 with `user: null` when signed out rather than
    // 401, so booting the app never trips the unauthorized handler.
    const { user } = await request<{ user: User | null }>('/api/auth/me');
    return user;
  },

  // ── profile ───────────────────────────────────────────────────────────────

  async updateProfile(patch: ProfilePatch): Promise<User> {
    const { user } = await request<{ user: User }>('/api/profile', { method: 'PUT', body: patch });
    return user;
  },

  // ── projects ──────────────────────────────────────────────────────────────

  async listProjectsAdmin(): Promise<AdminProject[]> {
    const { projects } = await request<{ projects: AdminProject[] }>('/api/projects');
    return projects;
  },

  async listProjectsStaff(): Promise<StaffProject[]> {
    const { projects } = await request<{ projects: StaffProject[] }>('/api/projects');
    return projects;
  },

  async createProject(input: ProjectInput): Promise<AdminProject> {
    const { project } = await request<{ project: AdminProject }>('/api/projects', {
      method: 'POST',
      body: input,
    });
    return project;
  },

  async updateProject(id: string, patch: Partial<ProjectInput>): Promise<AdminProject> {
    const { project } = await request<{ project: AdminProject }>(
      `/api/projects/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: patch },
    );
    return project;
  },

  async deleteProject(id: string): Promise<void> {
    await request<{ ok: true }>(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  // ── interest (staff) ──────────────────────────────────────────────────────

  async expressInterest(projectId: string, message?: string): Promise<MyInterest> {
    const { interest } = await request<{ interest: MyInterest }>(
      `/api/projects/${encodeURIComponent(projectId)}/interest`,
      { method: 'POST', body: { message: message ?? '' } },
    );
    return interest;
  },

  async withdrawInterest(projectId: string): Promise<void> {
    await request<{ ok: true }>(`/api/projects/${encodeURIComponent(projectId)}/interest`, {
      method: 'DELETE',
    });
  },

  // ── roster + directory (admin) ────────────────────────────────────────────

  async listInterests(projectId: string): Promise<RosterEntry[]> {
    const { interests } = await request<{ interests: RosterEntry[] }>(
      `/api/projects/${encodeURIComponent(projectId)}/interests`,
    );
    return interests;
  },

  async setInterestStatus(interestId: string, status: InterestStatus): Promise<Interest> {
    const { interest } = await request<{ interest: Interest }>(
      `/api/interests/${encodeURIComponent(interestId)}`,
      { method: 'PATCH', body: { status } },
    );
    return interest;
  },

  async listStaff(): Promise<StaffDirectoryEntry[]> {
    const { staff } = await request<{ staff: StaffDirectoryEntry[] }>('/api/staff');
    return staff;
  },

  // ── AI suggestion (admin) ─────────────────────────────────────────────────

  /**
   * The only call that reports failure in its return value instead of by
   * throwing. A missing API key or a model that answered with prose is an
   * ordinary outcome for an optional convenience button, and the form shows it
   * as a hint line rather than as a page-level error. A transport failure is
   * still an exception, because that one is not about the suggestion at all.
   */
  suggestSkills(description: string): Promise<SuggestResult> {
    return request<SuggestResult>('/api/skills/suggest', {
      method: 'POST',
      body: { description },
    });
  },
};
