import { CalendarBlank, Buildings, LockKey, PencilSimple, Trash, UsersThree } from '@phosphor-icons/react';
import type { AdminProject } from '@/src/lib/types';
import Button from '@/components/ui/Button';
import GlowCard from '@/components/ui/GlowCard';
import StatusBadge from '@/components/ui/StatusBadge';
import Tag from '@/components/ui/Tag';
import Spinner from '@/components/ui/Spinner';
import { formatDuration } from '@/src/lib/format';

export interface AdminProjectCardProps {
  project: AdminProject;
  index: number;
  /** True while this card's status toggle is in flight. */
  busy?: boolean;
  onToggleStatus: (project: AdminProject) => void;
  onEdit: (project: AdminProject) => void;
  onDelete: (project: AdminProject) => void;
  onOpenRoster: (project: AdminProject) => void;
}

/** A full-width row holds more chips than a narrow card did, but the ceiling
 *  stays: past about eight the row stops being scannable. The rest are one
 *  click away in the editor. */
const VISIBLE_SKILLS = 8;

export default function AdminProjectCard({
  project,
  index,
  busy = false,
  onToggleStatus,
  onEdit,
  onDelete,
  onOpenRoster,
}: AdminProjectCardProps) {
  const extraSkills = project.skills.length - VISIBLE_SKILLS;
  const closed = project.status === 'closed';

  return (
    <GlowCard
      index={index}
      className="dsac-rise flex flex-col gap-5 p-5 lg:flex-row lg:items-stretch"
      style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
    >
      {/* min-w-0 so the clamped description can shrink instead of shoving the
          action rail off the row. */}
      <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={project.status} />
        {project.ndaRequired ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--muted-wash)] px-2.5 py-1 text-[0.75rem] font-medium tracking-wide text-[var(--ink-2)] uppercase">
            <LockKey size={14} aria-hidden />
            NDA
          </span>
        ) : null}
        {/* The headcount is the number an admin scans the grid for, so it sits
            in the badge row rather than being buried in the action bar. It is a
            label, not a control — the Interest button below opens the roster. */}
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[var(--muted-wash)] px-2.5 py-1 text-[0.8125rem] text-[var(--ink-2)]">
          <UsersThree size={15} aria-hidden />
          {project.interestCount === 1 ? '1 interested' : `${project.interestCount} interested`}
        </span>
      </div>

      <h3 className="mt-3 text-[1.0625rem] leading-snug font-medium text-[var(--ink)]">
        {project.title}
      </h3>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.875rem] text-[var(--ink-2)]">
        <span className="inline-flex items-center gap-2">
          <Buildings size={16} aria-hidden className="shrink-0" />
          {project.client}
        </span>
        <span className="inline-flex items-center gap-2">
          <CalendarBlank size={16} aria-hidden className="shrink-0" />
          {formatDuration(project)}
        </span>
      </div>

      {project.description ? (
        <p className="mt-3 line-clamp-2 max-w-[80ch] text-[0.875rem] leading-relaxed text-[var(--ink-2)]">
          {project.description}
        </p>
      ) : null}

      {project.skills.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {project.skills.slice(0, VISIBLE_SKILLS).map((skill) => (
            <Tag key={skill} label={skill} />
          ))}
          {extraSkills > 0 ? (
            <span className="self-center text-[0.8125rem] text-[var(--ink-3)]">
              +{extraSkills} more
            </span>
          ) : null}
        </div>
      ) : null}

      </div>

      {/* The actions become a right rail on wide screens and fall back to a
          wrapped bar below lg, where a 190px column would starve the text.
          Stacked tight rather than spread to the row's full height: pinning
          Delete to the bottom left it floating away from the controls it
          belongs with, and the gap read as a rendering fault. */}
      <div className="flex flex-wrap items-center gap-2 border-[var(--border)] pt-4 lg:w-[190px] lg:shrink-0 lg:flex-col lg:items-stretch lg:border-l lg:pt-0 lg:pl-5">
        <Button size="sm" variant="secondary" onClick={() => onOpenRoster(project)}>
          <UsersThree size={16} aria-hidden />
          Interest
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onEdit(project)}>
          <PencilSimple size={16} aria-hidden />
          Edit
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onToggleStatus(project)} disabled={busy}>
          {busy ? <Spinner size={16} /> : null}
          {closed ? 'Reopen' : 'Mark closed'}
        </Button>
        <Button
          size="sm"
          variant="danger"
          className="ml-auto lg:mt-1 lg:ml-0"
          onClick={() => onDelete(project)}
          aria-label={`Delete ${project.title}`}
        >
          <Trash size={16} aria-hidden />
          Delete
        </Button>
      </div>
    </GlowCard>
  );
}
