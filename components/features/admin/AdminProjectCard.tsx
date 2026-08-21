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

/** Only the first few tags go on the card; the rest are one click away in the
 *  editor. A card that grows to eight chips stops being scannable. */
const VISIBLE_SKILLS = 5;

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
      className="dsac-rise flex flex-col p-5"
      style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
    >
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

      <div className="mt-2 flex flex-col gap-1 text-[0.875rem] text-[var(--ink-2)]">
        <p className="flex items-start gap-2">
          <Buildings size={16} aria-hidden className="mt-0.5 shrink-0" />
          {project.client}
        </p>
        <p className="flex items-start gap-2">
          <CalendarBlank size={16} aria-hidden className="mt-0.5 shrink-0" />
          {formatDuration(project)}
        </p>
      </div>

      {project.description ? (
        <p className="mt-3 line-clamp-2 text-[0.875rem] leading-relaxed text-[var(--ink-2)]">
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

      {/* mt-auto so every card in a row lands its action bar on the same line,
          however long the description above it runs. */}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
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
          className="ml-auto"
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
