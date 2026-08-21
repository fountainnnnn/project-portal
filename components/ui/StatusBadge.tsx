import type { InterestStatus, ProjectStatus } from '@/src/lib/types';

/**
 * StatusBadge — the only way a status is ever drawn.
 *
 * Text pill, no dot, and certainly no animated one: a project being
 * "available" is a fact about a row in a database, not a live signal, and a
 * blinking light claims otherwise. The word itself is the fastest thing to
 * read anyway.
 *
 * Only two visual weights exist. Green says "you can act on this" —
 * available, shortlisted. Grey says "nothing to do here" — closed, pending,
 * declined. Giving declined its own red would make an ordinary staffing
 * outcome look like an error.
 */
export interface StatusBadgeProps {
  status: ProjectStatus | InterestStatus;
  className?: string;
}

const GO = 'bg-[var(--ok-wash)] text-[var(--ok)]';
const REST = 'bg-[var(--muted-wash)] text-[var(--ink-2)]';

const TONES: Record<ProjectStatus | InterestStatus, string> = {
  available: GO,
  shortlisted: GO,
  closed: REST,
  pending: REST,
  declined: REST,
};

export default function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[0.75rem] font-semibold capitalize ${TONES[status]} ${className}`}
    >
      {status}
    </span>
  );
}
