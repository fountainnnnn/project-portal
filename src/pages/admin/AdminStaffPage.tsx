import { useCallback, useEffect, useMemo, useState } from 'react';
import { MagnifyingGlass, UsersThree } from '@phosphor-icons/react';
import type { StaffDirectoryEntry } from '@/src/lib/types';
import { api, ApiError } from '@/src/lib/api';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import ErrorNote from '@/components/ui/ErrorNote';
import SectionHeader from '@/components/ui/SectionHeader';
import Select from '@/components/ui/Select';
import Spinner from '@/components/ui/Spinner';
import StaffCard from '@/components/features/admin/StaffCard';

const ALL_SCHOOLS = '__all__';

export default function AdminStaffPage() {
  const [staff, setStaff] = useState<StaffDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [school, setSchool] = useState(ALL_SCHOOLS);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setStaff(await api.listStaff());
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not load the staff directory.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** The school filter is built from who is actually on the portal, not from
   *  Meta.schools — a dropdown of ten schools where six have nobody in them
   *  makes the directory look emptier than it is. */
  const schoolOptions = useMemo(
    () => [...new Set(staff.map((entry) => entry.school).filter(Boolean))].sort(),
    [staff],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return staff.filter((entry) => {
      if (school !== ALL_SCHOOLS && entry.school !== school) return false;
      if (!needle) return true;
      return (
        entry.name.toLowerCase().includes(needle) ||
        entry.email.toLowerCase().includes(needle) ||
        entry.title.toLowerCase().includes(needle) ||
        entry.teaches.toLowerCase().includes(needle) ||
        entry.skills.some((skill) => skill.toLowerCase().includes(needle))
      );
    });
  }, [staff, query, school]);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        eyebrow="STAFF DIRECTORY"
        title="Lecturers on the portal."
        subtitle="Who they are, what they teach, and how many projects they have raised a hand for."
        align="left"
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="relative block sm:col-span-1 lg:col-span-2">
          <span className="sr-only">Search staff</span>
          <MagnifyingGlass
            size={18}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--ink-3)]"
          />
          <input
            className="dsac-input pl-10"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, subject, skill…"
            autoComplete="off"
          />
        </label>

        <Select
          aria-label="Filter by school"
          value={school}
          onChange={(event) => setSchool(event.target.value)}
          options={[
            { value: ALL_SCHOOLS, label: 'Every school' },
            ...schoolOptions.map((name) => ({ value: name, label: name })),
          ]}
        />
      </div>

      {error ? <ErrorNote message={error} onRetry={load} /> : null}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size={24} />
        </div>
      ) : null}

      {!loading && staff.length === 0 && !error ? (
        <EmptyState
          icon={UsersThree}
          title="No lecturers have signed up yet."
          body="Staff accounts appear here as soon as they exist. Until then the project cards will read zero interest."
        />
      ) : null}

      {!loading && staff.length > 0 && visible.length === 0 ? (
        <EmptyState
          icon={MagnifyingGlass}
          title="Nobody matches that search."
          body="Try a shorter term, or widen the school filter."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setQuery('');
                setSchool(ALL_SCHOOLS);
              }}
            >
              Clear search
            </Button>
          }
        />
      ) : null}

      {!loading && visible.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {visible.map((entry, index) => (
            <StaffCard key={entry.id} entry={entry} index={index} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
