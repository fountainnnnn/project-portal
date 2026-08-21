import { useCallback, useEffect, useMemo, useState } from 'react';
import { FolderPlus, Funnel, MagnifyingGlass, Plus } from '@phosphor-icons/react';
import type { AdminProject, Meta } from '@/src/lib/types';
import { api, ApiError } from '@/src/lib/api';
import Button from '@/components/ui/Button';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import ErrorNote from '@/components/ui/ErrorNote';
import SectionHeader from '@/components/ui/SectionHeader';
import Select from '@/components/ui/Select';
import Spinner from '@/components/ui/Spinner';
import AdminProjectCard from '@/components/features/admin/AdminProjectCard';
import ProjectForm from '@/components/features/admin/ProjectForm';
import RosterPanel from '@/components/features/admin/RosterPanel';

type NdaFilter = 'all' | 'required' | 'none';

const ALL_SKILLS = '__all__';

export default function AdminProjectsPage() {
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [query, setQuery] = useState('');
  /**
   * Closed projects are hidden by default here too, so the admin's list and
   * the lecturers' list agree about what "the projects" means. The difference
   * is that an admin still has to reach the closed ones to reopen them, which
   * is why the count line always states how many are being withheld rather
   * than leaving a project looking deleted.
   */
  const [includeClosed, setIncludeClosed] = useState(false);
  const [ndaFilter, setNdaFilter] = useState<NdaFilter>('all');
  const [skillFilter, setSkillFilter] = useState(ALL_SKILLS);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminProject | null>(null);
  const [rosterFor, setRosterFor] = useState<AdminProject | null>(null);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [deleting, setDeleting] = useState<AdminProject | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // One fetch each, in parallel: meta is small and the form needs it the
      // moment the admin presses New project, so waiting for a second round
      // trip there would be a visible stall in the modal.
      const [list, metaResult] = await Promise.all([api.listProjectsAdmin(), api.meta()]);
      setProjects(list);
      setMeta(metaResult);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not load projects.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Every skill in use, for the filter. Built from the data rather than a
   *  fixed list — the tags are free text and a hardcoded set would go stale. */
  const skillOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const project of projects) {
      for (const skill of project.skills) {
        if (!seen.has(skill.toLowerCase())) seen.set(skill.toLowerCase(), skill);
      }
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [projects]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return projects.filter((project) => {
      if (!includeClosed && project.status !== 'available') return false;
      if (ndaFilter === 'required' && !project.ndaRequired) return false;
      if (ndaFilter === 'none' && project.ndaRequired) return false;
      if (
        skillFilter !== ALL_SKILLS &&
        !project.skills.some((skill) => skill.toLowerCase() === skillFilter.toLowerCase())
      ) {
        return false;
      }
      if (!needle) return true;
      // Search covers what an admin would actually half-remember about a
      // project: its name, its client, and the skills on it.
      return (
        project.title.toLowerCase().includes(needle) ||
        project.client.toLowerCase().includes(needle) ||
        project.description.toLowerCase().includes(needle) ||
        project.skills.some((skill) => skill.toLowerCase().includes(needle))
      );
    });
  }, [projects, query, includeClosed, ndaFilter, skillFilter]);

  /** Stated explicitly in the count line: an admin who cannot find a project
   *  they published should be told it is hidden, not left guessing. */
  const closedCount = projects.filter((project) => project.status === 'closed').length;

  const filtersActive =
    query.trim() !== '' || includeClosed || ndaFilter !== 'all' || skillFilter !== ALL_SKILLS;

  function clearFilters() {
    setQuery('');
    setIncludeClosed(false);
    setNdaFilter('all');
    setSkillFilter(ALL_SKILLS);
  }

  /** Mutations splice their returned project back in rather than refetching —
   *  the server hands back the whole updated row for exactly this reason. */
  function spliceProject(saved: AdminProject) {
    setProjects((current) => {
      const index = current.findIndex((project) => project.id === saved.id);
      if (index < 0) return [saved, ...current];
      const next = [...current];
      next[index] = saved;
      return next;
    });
  }

  async function toggleStatus(project: AdminProject) {
    setTogglingId(project.id);
    setError('');
    try {
      // Send only the field that changed. A full-form PATCH here would race an
      // open editor and overwrite it with stale values.
      const updated = await api.updateProject(project.id, {
        status: project.status === 'available' ? 'closed' : 'available',
      });
      spliceProject(updated);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not change the status.');
    } finally {
      setTogglingId(null);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.deleteProject(deleting.id);
      setProjects((current) => current.filter((project) => project.id !== deleting.id));
      setDeleting(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not delete the project.');
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(project: AdminProject) {
    setEditing(project);
    setFormOpen(true);
  }

  function openRoster(project: AdminProject) {
    setRosterFor(project);
    setRosterOpen(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeader
          eyebrow="PROJECT CENTRE"
          title="Projects looking for staff."
          subtitle="Everything the centre has published, and how many lecturers have raised a hand for each."
          align="left"
        />
        <Button onClick={openCreate}>
          <Plus size={18} aria-hidden />
          New project
        </Button>
      </div>

      {/* Filters stay mounted while the list loads so the row does not appear
          under the grid a moment later and push it down. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="relative block">
          <span className="sr-only">Search projects</span>
          <MagnifyingGlass
            size={18}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--ink-3)]"
          />
          <input
            className="dsac-input pl-10"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, client, skill…"
            autoComplete="off"
          />
        </label>

        <Select
          aria-label="Filter by NDA"
          value={ndaFilter}
          onChange={(event) => setNdaFilter(event.target.value as NdaFilter)}
          options={[
            { value: 'all', label: 'NDA or not' },
            { value: 'required', label: 'NDA required' },
            { value: 'none', label: 'No NDA' },
          ]}
        />

        <Select
          aria-label="Filter by skill"
          value={skillFilter}
          onChange={(event) => setSkillFilter(event.target.value)}
          options={[
            { value: ALL_SKILLS, label: 'Any skill' },
            ...skillOptions.map((skill) => ({ value: skill, label: skill })),
          ]}
        />
      </div>

      {error ? <ErrorNote message={error} onRetry={load} /> : null}

      {!loading && projects.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[0.8125rem] text-[var(--ink-2)]">
          <span>
            Showing <strong className="font-medium text-[var(--ink)]">{visible.length}</strong> of{' '}
            {projects.length} {projects.length === 1 ? 'project' : 'projects'}
          </span>

          {/* Beside the number, because it changes what the number counts. */}
          <label className="inline-flex cursor-pointer items-center gap-2 select-none">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
              checked={includeClosed}
              onChange={(event) => setIncludeClosed(event.target.checked)}
            />
            Include closed projects
          </label>

          {closedCount > 0 && !includeClosed ? (
            <span className="text-[var(--ink-3)]">
              {closedCount} closed {closedCount === 1 ? 'project is' : 'projects are'} hidden
            </span>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size={24} />
        </div>
      ) : null}

      {!loading && projects.length === 0 && !error ? (
        <EmptyState
          icon={FolderPlus}
          title="No projects yet."
          body="Publish the centre's first project and it appears on every lecturer's dashboard straight away."
          action={
            <Button onClick={openCreate}>
              <Plus size={18} aria-hidden />
              Create the first project
            </Button>
          }
        />
      ) : null}

      {!loading && projects.length > 0 && visible.length === 0 ? (
        <EmptyState
          icon={Funnel}
          title="Nothing matches those filters."
          body="Loosen a filter or clear the search to see the full list again."
          action={
            <Button variant="secondary" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      ) : null}

      {!loading && visible.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((project, index) => (
            <AdminProjectCard
              key={project.id}
              project={project}
              index={index}
              busy={togglingId === project.id}
              onToggleStatus={toggleStatus}
              onEdit={openEdit}
              onDelete={setDeleting}
              onOpenRoster={openRoster}
            />
          ))}
        </div>
      ) : null}

      {filtersActive && !loading && visible.length > 0 ? (
        <p className="text-[0.875rem] text-[var(--ink-3)]">
          Showing {visible.length} of {projects.length} projects.
        </p>
      ) : null}

      <ProjectForm
        open={formOpen}
        project={editing}
        meta={meta}
        onClose={() => setFormOpen(false)}
        onSaved={spliceProject}
      />

      <RosterPanel open={rosterOpen} project={rosterFor} onClose={() => setRosterOpen(false)} />

      <ConfirmDialog
        open={deleting !== null}
        title="Delete project"
        body={
          <>
            <strong>{deleting?.title}</strong> and every expression of interest attached to it are
            removed. This cannot be undone.
          </>
        }
        confirmLabel="Delete project"
        danger
        busy={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
