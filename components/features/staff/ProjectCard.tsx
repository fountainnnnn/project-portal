import { Buildings, CalendarBlank, CaretRight, Lock, Handshake } from '@phosphor-icons/react';

import GlowCard from '@/components/ui/GlowCard';
import StatusBadge from '@/components/ui/StatusBadge';
import Tag from '@/components/ui/Tag';
import { formatDuration } from '@/src/lib/format';
import type { StaffProject } from '@/src/lib/types';

/**
 * A full-width row shows more chips than a narrow card could, but the ceiling
 * stays: past about eight the row stops being scannable and becomes a wall.
 */
const SKILLS_SHOWN = 8;

export interface ProjectCardProps {
  project: StaffProject;
  /** Position in the list — drives both the glow hue rotation and the entrance stagger. */
  index: number;
  onOpen: (project: StaffProject) => void;
}

/**
 * One project, as a full-width row.
 *
 * The ordering is the lecturer's actual question order: is it still open, is
 * there an NDA in the way, what is it, who is it for, how long, what skills.
 *
 * Laid out as two columns rather than one tall stack. A stack stretched to the
 * full content width leaves the eye travelling the whole way across for a
 * three-word status pill, so everything readable sits in a measured left
 * column and the right rail carries only the two things that are about *this
 * lecturer* rather than about the project: whether they have already raised a
 * hand, and the affordance to open it. The rail collapses below `sm`, where
 * there is no width to spare and the row is effectively a card again.
 *
 * The description clamps to two lines here rather than the three a narrow card
 * used: a wider line holds more words, so two lines of this is already more
 * text than three lines of that was.
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
        // button gets for free; without this the list is mouse-only.
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(project);
        }
      }}
      className="dsac-rise group flex cursor-pointer items-stretch gap-6 p-5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
    >
      {/* min-w-0 so the clamped description can actually shrink; without it a
          long unbroken line would push the right rail off the row. */}
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={project.status} />
          {project.ndaRequired && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--muted-wash)] px-2.5 py-1 text-[0.75rem] font-medium text-[var(--ink-2)]">
              <Lock size={13} aria-hidden />
              NDA required
            </span>
          )}

          {/* The meta rides up onto the badge line. On a row there is room for
              it, and it saves a whole line of vertical space per project —
              which is the point of going full-width in the first place. */}
          <span className="inline-flex items-center gap-1.5 text-[0.8125rem] text-[var(--ink-2)]">
            <Buildings size={14} aria-hidden />
            {project.client}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[0.8125rem] text-[var(--ink-2)]">
            <CalendarBlank size={14} aria-hidden />
            {formatDuration(project)}
          </span>
        </div>

        <h3 className="text-[1.125rem] leading-snug font-medium text-[var(--ink)]">
          {project.title}
        </h3>

        <p className="line-clamp-2 max-w-[80ch] text-[0.875rem] leading-relaxed text-[var(--ink-2)]">
          {project.description || 'No description provided yet.'}
        </p>

        {project.skills.length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-1.5">
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

        {/* Below sm the right rail is gone, so the one thing the lecturer
            would otherwise lose — that they have already raised a hand — comes
            back here. Hidden at sm and up, where the rail says it better. */}
        {project.myInterest && (
          <div className="mt-1 flex items-center gap-2 border-t border-[var(--border)] pt-3 text-[0.8125rem] text-[var(--ink-2)] sm:hidden">
            <Handshake size={15} aria-hidden />
            <span>You expressed interest</span>
            <StatusBadge status={project.myInterest.status} className="ml-auto" />
          </div>
        )}
      </div>

      <div className="hidden w-[150px] shrink-0 flex-col items-end justify-between border-l border-[var(--border)] pl-5 sm:flex">
        {project.myInterest ? (
          <div className="flex flex-col items-end gap-1.5">
            <span className="inline-flex items-center gap-1.5 text-[0.75rem] text-[var(--ink-3)]">
              <Handshake size={14} aria-hidden />
              You applied
            </span>
            <StatusBadge status={project.myInterest.status} />
          </div>
        ) : (
          <span />
        )}

        <span className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-[var(--ink-3)] transition-colors group-hover:text-[var(--accent)]">
          Open
          <CaretRight size={14} weight="bold" aria-hidden />
        </span>
      </div>
    </GlowCard>
  );
}
