import { ArrowCounterClockwise, MagnifyingGlass } from '@phosphor-icons/react';

import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import type { ProjectStatus } from '@/src/lib/types';

/**
 * Filter state lives in the page, not here — the page owns the list it filters,
 * and a filter bar that keeps its own copy would need syncing the moment
 * anything else (an empty-state "clear filters" button) wants to reset it.
 */
export interface ProjectFilters {
  query: string;
  /** '' = any skill. Values come from the projects themselves, not a fixed vocabulary. */
  skill: string;
  status: ProjectStatus | 'all';
  nda: 'all' | 'required' | 'none';
}

export const EMPTY_FILTERS: ProjectFilters = {
  query: '',
  skill: '',
  status: 'all',
  nda: 'all',
};

export function isFiltered(filters: ProjectFilters): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.skill !== '' ||
    filters.status !== 'all' ||
    filters.nda !== 'all'
  );
}

export interface FilterBarProps {
  value: ProjectFilters;
  onChange: (next: ProjectFilters) => void;
  /** Every skill present across the loaded projects, sorted, deduped by the page. */
  skills: string[];
  matchCount: number;
  totalCount: number;
}

export default function FilterBar({
  value,
  onChange,
  skills,
  matchCount,
  totalCount,
}: FilterBarProps) {
  const set = <K extends keyof ProjectFilters>(key: K, next: ProjectFilters[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[16rem] flex-1">
          <MagnifyingGlass
            size={16}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[var(--ink-3)]"
          />
          <input
            type="search"
            className="dsac-input pl-9"
            placeholder="Search titles, clients, skills, descriptions"
            aria-label="Search projects"
            value={value.query}
            onChange={(event) => set('query', event.target.value)}
          />
        </div>

        {/* "Available only" is the filter a lecturer reaches for first — what can
            I still join — so it sits immediately beside the search box. */}
        <Select
          aria-label="Filter by status"
          className="w-auto min-w-[10rem]"
          value={value.status}
          onChange={(event) => set('status', event.target.value as ProjectFilters['status'])}
          options={[
            { value: 'all', label: 'Any status' },
            { value: 'available', label: 'Available only' },
            { value: 'closed', label: 'Closed only' },
          ]}
        />

        <Select
          aria-label="Filter by skill"
          className="w-auto min-w-[11rem]"
          value={value.skill}
          onChange={(event) => set('skill', event.target.value)}
          options={[
            { value: '', label: 'Any skill' },
            ...skills.map((skill) => ({ value: skill, label: skill })),
          ]}
        />

        <Select
          aria-label="Filter by NDA requirement"
          className="w-auto min-w-[11rem]"
          value={value.nda}
          onChange={(event) => set('nda', event.target.value as ProjectFilters['nda'])}
          options={[
            { value: 'all', label: 'NDA: any' },
            { value: 'none', label: 'No NDA needed' },
            { value: 'required', label: 'NDA required' },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[0.8125rem] text-[var(--ink-2)]">
        <span>
          Showing <strong className="font-medium text-[var(--ink)]">{matchCount}</strong> of{' '}
          {totalCount} {totalCount === 1 ? 'project' : 'projects'}
        </span>
        {isFiltered(value) && (
          <Button size="sm" variant="ghost" onClick={() => onChange(EMPTY_FILTERS)}>
            <ArrowCounterClockwise size={14} aria-hidden />
            Reset filters
          </Button>
        )}
      </div>
    </div>
  );
}
