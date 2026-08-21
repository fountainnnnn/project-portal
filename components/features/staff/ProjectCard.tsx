import { Buildings, CalendarBlank, Lock, Handshake } from '@phosphor-icons/react';

import GlowCard from '@/components/ui/GlowCard';
import StatusBadge from '@/components/ui/StatusBadge';
import Tag from '@/components/ui/Tag';
import { formatDuration } from '@/src/lib/format';
import type { StaffProject } from '@/src/lib/types';

/** Beyond this many chips a card stops being scannable, so the rest collapse to a count. */
const SKILLS_SHOWN = 5;

export interface ProjectCardProps {
  project: StaffProject;
  /** Position in the grid — drives both the glow hue rotation and the entrance stagger. */
  index: number;
  onOpen: (project: StaffProject) => void;
}

/**
 * One project, sized to be judged without opening it.
 *
 * The ordering here is the lecturer's actual question order: is it still open,
 * is there an NDA in the way, what is it, who is it for, how long, what skills.
 * The description is clamped rather than truncated server-side so the full text
 * is one click away in the detail dialog and nothing has to round-trip.
 */
export default function ProjectCard({ project, index, onOpen }: ProjectCardProps) {
  const extraSkills = project.skills.length - SKILLS_SHOWN;

  return (
    <GlowCard
      index={index}
      interactive
      role="button"
      tabIndex={0}
      aria-label={`Open ${project.title}`}
      onClick={() => onOpen(project)}
      onKeyDown={(event) => {
        // A div carrying a button role has to re-implement the two keys a real
        // button gets for free; without this the grid is mouse-only.
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(project);
        }
      }}
      className="dsac-rise flex cursor-pointer flex-col gap-3 p-5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={project.status} />
        {project.ndaRequired && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--muted-wash)] px-2.5 py-1 text-[0.75rem] font-medium text-[var(--ink-2)]">
            <Lock size={13} aria-hidden />
            NDA required
          </span>
        )}
      </div>

      <h3 className="text-[1.0625rem] leading-snug font-medium text-[var(--ink)]">
        {project.title}
      </h3>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem] text-[var(--ink-2)]">
        <span className="inline-flex items-center gap-1.5">
          <Buildings size={14} aria-hidden />
          {project.client}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CalendarBlank size={14} aria-hidden />
          {formatDuration(project)}
        </span>
      </div>

      <p className="line-clamp-3 text-[0.875rem] leading-relaxed text-[var(--ink-2)]">
        {project.description || 'No description provided yet.'}
      </p>

      {project.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {project.skills.slice(0, SKILLS_SHOWN).map((skill) => (
            <Tag key={skill} label={skill} />
          ))}
          {extraSkills > 0 && (
            <span className="self-center text-[0.75rem] text-[var(--ink-3)]">
              +{extraSkills} more
            </span>
          )}
        </div>
      )}

      {project.myInterest && (
        <div className="mt-auto flex items-center gap-2 border-t border-[var(--border)] pt-3 text-[0.8125rem] text-[var(--ink-2)]">
          <Handshake size={15} aria-hidden />
          <span>You expressed interest</span>
          <StatusBadge status={project.myInterest.status} className="ml-auto" />
        </div>
      )}
    </GlowCard>
  );
}
