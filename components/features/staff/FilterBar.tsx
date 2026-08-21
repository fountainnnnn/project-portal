import { ArrowCounterClockwise, MagnifyingGlass } from '@phosphor-icons/react';

import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';

/**
 * Filter state lives in the page, not here — the page owns the list it filters,
 * and a filter bar that keeps its own copy would need syncing the moment
 * anything else (an empty-state "clear filters" button) wants to reset it.
 */
export interface ProjectFilters {
  query: string;
  /** '' = any skill. Values come from the projects themselves, not a fixed vocabulary. */
  skill: string;
  /**
   * Closed projects are hidden by default.
   *
   * A lecturer opens this page to find something to join, and a closed project
   * is one they cannot. Showing them by default buries the answer in rows that
   * are already spoken for. They stay reachable behind the checkbox because
   * seeing what the centre has recently placed is genuinely useful — it says
   * what kind of work turns up here — just not what the page is *for*.
   */
  includeClosed: boolean;
  nda: 'all' | 'required' | 'none';
}

export const EMPTY_FILTERS: ProjectFilters = {
  query: '',
  skill: '',
  includeClosed: false,
  nda: 'all',
};

export function isFiltered(filters: ProjectFilters): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.skill !== '' ||
    filters.includeClosed !== EMPTY_FILTERS.includeClosed ||
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

        {/* Sits on the count line rather than among the dropdowns: it changes
            what the number means, so it belongs beside the number. */}
        <label className="inline-flex cursor-pointer items-center gap-2 select-none">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
            checked={value.includeClosed}
            onChange={(event) => set('includeClosed', event.target.checked)}
          />
          Include closed projects
        </label>
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
