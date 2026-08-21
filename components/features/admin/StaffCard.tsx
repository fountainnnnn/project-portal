import { useState } from 'react';
import {
  Briefcase,
  Buildings,
  CaretDown,
  CaretRight,
  ChalkboardTeacher,
  Handshake,
} from '@phosphor-icons/react';
import type { StaffDirectoryEntry } from '@/src/lib/types';
import Button from '@/components/ui/Button';
import GlowCard from '@/components/ui/GlowCard';
import Tag from '@/components/ui/Tag';

export interface StaffCardProps {
  entry: StaffDirectoryEntry;
  index: number;
}

/**
 * One lecturer in the directory. Collapsed by default: a directory of thirty
 * people with every background paragraph expanded is a wall, and the row a
 * reader wants is found by name and school, not by prose.
 */
export default function StaffCard({ entry, index }: StaffCardProps) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail =
    Boolean(entry.teaches || entry.background) ||
    entry.skills.length > 0 ||
    entry.pastProjects.length > 0;

  return (
    <GlowCard
      index={index}
      className="dsac-rise p-5"
      style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[1rem] font-medium text-[var(--ink)]">{entry.name}</h3>
          <p className="text-[0.875rem] text-[var(--ink-2)]">{entry.title || 'Lecturer'}</p>
          <p className="mt-0.5 text-[0.8125rem] text-[var(--ink-3)]">{entry.email}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--muted-wash)] px-2.5 py-1 text-[0.8125rem] text-[var(--ink-2)]">
          <Handshake size={15} aria-hidden />
          {entry.interestCount === 1 ? '1 project' : `${entry.interestCount} projects`}
        </span>
      </div>

      {entry.school ? (
        <p className="mt-3 flex items-start gap-2 text-[0.875rem] text-[var(--ink-2)]">
          <Buildings size={16} aria-hidden className="mt-0.5 shrink-0" />
          {entry.school}
        </p>
      ) : null}

      {hasDetail ? (
        <div className="mt-3">
          <Button variant="ghost" size="sm" onClick={() => setExpanded((open) => !open)}>
            {expanded ? <CaretDown size={16} aria-hidden /> : <CaretRight size={16} aria-hidden />}
            {expanded ? 'Hide profile' : 'View profile'}
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-[0.875rem] text-[var(--ink-3)]">
          This lecturer has not filled in their profile yet.
        </p>
      )}

      {expanded ? (
        // dsac-rise on the revealed block, not a height transition: nothing in
        // this system animates layout.
        <div className="dsac-rise mt-4 flex flex-col gap-3 border-t border-[var(--border)] pt-4">
          {entry.teaches ? (
            <p className="flex items-start gap-2 text-[0.875rem] text-[var(--ink-2)]">
              <ChalkboardTeacher size={16} aria-hidden className="mt-0.5 shrink-0" />
              Teaches {entry.teaches}
            </p>
          ) : null}

          {entry.skills.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {entry.skills.map((skill) => (
                <Tag key={skill} label={skill} />
              ))}
            </div>
          ) : null}

          {entry.background ? (
            <p className="text-[0.875rem] leading-relaxed text-[var(--ink-2)]">{entry.background}</p>
          ) : null}

          {entry.pastProjects.length > 0 ? (
            <div>
              <p className="flex items-center gap-2 text-[0.8125rem] font-medium text-[var(--ink)]">
                <Briefcase size={16} aria-hidden />
                Past projects
              </p>
              <ul className="mt-1.5 flex flex-col gap-1 text-[0.875rem] text-[var(--ink-2)]">
                {entry.pastProjects.map((past) => (
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
        </div>
      ) : null}
    </GlowCard>
  );
}
