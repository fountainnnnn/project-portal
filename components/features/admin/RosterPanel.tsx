import { useCallback, useEffect, useState } from 'react';
import {
  Buildings,
  ChalkboardTeacher,
  ChatCircleText,
  Briefcase,
  UsersThree,
} from '@phosphor-icons/react';
import type { AdminProject, InterestStatus, RosterEntry } from '@/src/lib/types';
import { api, ApiError } from '@/src/lib/api';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import ErrorNote from '@/components/ui/ErrorNote';
import GlowCard from '@/components/ui/GlowCard';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import StatusBadge from '@/components/ui/StatusBadge';
import Tag from '@/components/ui/Tag';
import { formatDate } from '@/src/lib/format';

export interface RosterPanelProps {
  open: boolean;
  /** null while the modal is closing — keeps the panel mounted through the fade. */
  project: AdminProject | null;
  onClose: () => void;
}

const DECISIONS: { status: InterestStatus; label: string }[] = [
  { status: 'shortlisted', label: 'Shortlist' },
  { status: 'pending', label: 'Pending' },
  { status: 'declined', label: 'Decline' },
];

/**
 * Everyone who raised their hand for one project, with enough of each
 * lecturer's profile to make the call here rather than in the staff directory.
 */
export default function RosterPanel({ open, project, onClose }: RosterPanelProps) {
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  /** Which row's decision is in flight — the others stay clickable. */
  const [busyId, setBusyId] = useState<string | null>(null);

  const projectId = project?.id ?? null;

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      setEntries(await api.listInterests(projectId));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not load the roster.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!open || !projectId) return;
    void load();
  }, [open, projectId, load]);

  async function decide(entry: RosterEntry, status: InterestStatus) {
    if (entry.status === status) return;
    setBusyId(entry.id);
    setError('');
    try {
      const updated = await api.setInterestStatus(entry.id, status);
      // PATCH returns the interest without the user, so splice only the fields
      // it owns and keep the profile we already have.
      setEntries((current) =>
        current.map((row) => (row.id === updated.id ? { ...row, ...updated, user: row.user } : row)),
      );
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not update that decision.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={project ? project.title : 'Interest'} width="lg">
      <div className="flex flex-col gap-4">
        {!loading ? (
          <p className="text-[0.875rem] text-[var(--ink-2)]">
            {entries.length === 1
              ? '1 lecturer has expressed interest.'
              : `${entries.length} lecturers have expressed interest.`}
          </p>
        ) : null}

        {error ? <ErrorNote message={error} onRetry={load} /> : null}

        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : null}

        {!loading && entries.length === 0 && !error ? (
          <EmptyState
            icon={UsersThree}
            title="Nobody has expressed interest yet."
            body="Staff see this project on their dashboard as soon as it is available. Their names appear here the moment they raise a hand."
          />
        ) : null}

        {!loading
          ? entries.map((entry, index) => (
              <GlowCard
                key={entry.id}
                index={index}
                className="dsac-rise p-5"
                style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-[1rem] font-medium text-[var(--ink)]">{entry.user.name}</h3>
                    <p className="text-[0.875rem] text-[var(--ink-2)]">
                      {entry.user.title || 'Lecturer'}
                    </p>
                  </div>
                  <StatusBadge status={entry.status} />
                </div>

                <dl className="mt-3 flex flex-col gap-1.5 text-[0.875rem] text-[var(--ink-2)]">
                  {entry.user.school ? (
                    <div className="flex items-start gap-2">
                      <Buildings size={16} aria-hidden className="mt-0.5 shrink-0" />
                      <dd>{entry.user.school}</dd>
                    </div>
                  ) : null}
                  {entry.user.teaches ? (
                    <div className="flex items-start gap-2">
                      <ChalkboardTeacher size={16} aria-hidden className="mt-0.5 shrink-0" />
                      <dd>Teaches {entry.user.teaches}</dd>
                    </div>
                  ) : null}
                </dl>

                {entry.user.skills.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {entry.user.skills.map((skill) => (
                      <Tag key={skill} label={skill} />
                    ))}
                  </div>
                ) : null}

                {entry.user.background ? (
                  <p className="mt-3 text-[0.875rem] leading-relaxed text-[var(--ink-2)]">
                    {entry.user.background}
                  </p>
                ) : null}

                {entry.user.pastProjects.length > 0 ? (
                  <div className="mt-3">
                    <p className="flex items-center gap-2 text-[0.8125rem] font-medium text-[var(--ink)]">
                      <Briefcase size={16} aria-hidden />
                      Past projects
                    </p>
                    <ul className="mt-1.5 flex flex-col gap-1 text-[0.875rem] text-[var(--ink-2)]">
                      {entry.user.pastProjects.map((past) => (
                        <li key={past} className="flex gap-2">
                          <span aria-hidden className="text-[var(--ink-3)]">
                            —
                          </span>
                          <span>{past}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {entry.message ? (
                  <blockquote className="mt-3 flex gap-2 rounded-xl bg-[var(--muted-wash)] p-3 text-[0.875rem] leading-relaxed text-[var(--ink-2)]">
                    <ChatCircleText size={16} aria-hidden className="mt-0.5 shrink-0" />
                    <span>{entry.message}</span>
                  </blockquote>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {DECISIONS.map((decision) => (
                    <Button
                      key={decision.status}
                      size="sm"
                      // The current decision reads as the selected one; the other
                      // two are quiet alternatives, not competing calls to action.
                      variant={entry.status === decision.status ? 'primary' : 'ghost'}
                      disabled={busyId === entry.id}
                      onClick={() => decide(entry, decision.status)}
                    >
                      {decision.label}
                    </Button>
                  ))}
                  <span className="ml-auto text-[0.8125rem] text-[var(--ink-3)]">
                    {/* createdAt is an ISO datetime; formatDate takes the date half. */}
                    Expressed {formatDate(entry.createdAt.slice(0, 10))}
                  </span>
                </div>
              </GlowCard>
            ))
          : null}
      </div>
    </Modal>
  );
}
