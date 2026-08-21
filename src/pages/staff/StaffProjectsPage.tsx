import { useCallback, useEffect, useMemo, useState } from 'react';
import { FolderOpen, MagnifyingGlass, UserCircle } from '@phosphor-icons/react';

import FilterBar, {
  EMPTY_FILTERS,
  isFiltered,
  type ProjectFilters,
} from '@/components/features/staff/FilterBar';
import InterestDialog from '@/components/features/staff/InterestDialog';
import ProjectCard from '@/components/features/staff/ProjectCard';
import { isProfileEmpty, profileGaps } from '@/components/features/staff/profileCompleteness';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import ErrorNote from '@/components/ui/ErrorNote';
import SectionHeader from '@/components/ui/SectionHeader';
import Spinner from '@/components/ui/Spinner';
import { api, ApiError } from '@/src/lib/api';
import { useAuth } from '@/src/lib/auth';
import { navigate } from '@/src/lib/router';
import type { StaffProject } from '@/src/lib/types';

/** Everything the search box looks at. Searching the description matters: half
 *  of what makes a project recognisable ("half-hourly meter readings") never
 *  appears in its title. */
function haystack(project: StaffProject): string {
  return [project.title, project.client, project.description, ...project.skills]
    .join(' ')
    .toLowerCase();
}

function matches(project: StaffProject, filters: ProjectFilters): boolean {
  const query = filters.query.trim().toLowerCase();
  if (query && !haystack(project).includes(query)) return false;
  if (filters.skill && !project.skills.includes(filters.skill)) return false;
  if (filters.status !== 'all' && project.status !== filters.status) return false;
  if (filters.nda === 'required' && !project.ndaRequired) return false;
  if (filters.nda === 'none' && project.ndaRequired) return false;
  return true;
}

/**
 * The lecturer's side of the portal, and the reason it exists.
 *
 * DSAC already knows which projects it holds and roughly who suits them; the
 * gap it is closing is that lecturers have never been able to *see* the board.
 * So this page is a discovery surface before it is anything else: the whole
 * list loads at once, filtering is client-side and instant, and expressing
 * interest is a modal over the grid rather than a route change — nothing here
 * should cost a lecturer their place in the list.
 */
export default function StaffProjectsPage() {
  const { user } = useAuth();

  const [projects, setProjects] = useState<StaffProject[] | null>(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<ProjectFilters>(EMPTY_FILTERS);

  const [openId, setOpenId] = useState<string | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setProjects(await api.listProjectsStaff());
    } catch (err) {
      setProjects(null);
      setError(err instanceof ApiError ? err.message : 'Could not load projects.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const skills = useMemo(() => {
    // The skill filter is built from the projects on the board, not from a
    // fixed vocabulary — an option that matches nothing is worse than no option.
    const all = new Set<string>();
    for (const project of projects ?? []) for (const skill of project.skills) all.add(skill);
    return [...all].sort((a, b) => a.localeCompare(b));
  }, [projects]);

  const visible = useMemo(
    () => (projects ?? []).filter((project) => matches(project, filters)),
    [projects, filters],
  );

  const openProject = projects?.find((project) => project.id === openId) ?? null;

  /** Splice one project's myInterest in place: a refetch would rebuild the grid
   *  and replay every entrance animation for a change to one card. */
  const patchInterest = (id: string, myInterest: StaffProject['myInterest']) =>
    setProjects((current) =>
      (current ?? []).map((project) =>
        project.id === id ? { ...project, myInterest } : project,
      ),
    );

  const express = async (message: string) => {
    if (!openProject) return;
    setDialogBusy(true);
    setDialogError('');
    try {
      const interest = await api.expressInterest(openProject.id, message);
      patchInterest(openProject.id, interest);
    } catch (err) {
      // The 409 case: the project closed while this page sat open. Show the
      // server's sentence and refresh the list so the card stops lying.
      setDialogError(err instanceof ApiError ? err.message : 'Could not send your interest.');
      if (err instanceof ApiError && err.status === 409) void load();
    } finally {
      setDialogBusy(false);
    }
  };

  const withdraw = async () => {
    if (!openProject) return;
    setDialogBusy(true);
    setDialogError('');
    try {
      await api.withdrawInterest(openProject.id);
      patchInterest(openProject.id, null);
    } catch (err) {
      setDialogError(err instanceof ApiError ? err.message : 'Could not withdraw.');
    } finally {
      setDialogBusy(false);
    }
  };

  const mineCount = (projects ?? []).filter((project) => project.myInterest).length;

  return (
    <div className="flex flex-col gap-8">
      <SectionHeader
        eyebrow="PROJECT CENTRE"
        title="Projects looking for staff."
        subtitle={
          mineCount > 0
            ? `Every brief DSAC is currently placing. You have expressed interest in ${mineCount} of them.`
            : 'Every brief DSAC is currently placing. Open one to read it in full and put your hand up.'
        }
        align="left"
      />

      {/* The nudge. A lecturer with an empty profile can express interest all day
          and never be shortlisted, because the admin deciding has nothing to
          read — see profileCompleteness.ts. Better to say so here, where they
          actually are, than to wait for them to wander into the profile page. */}
      {user && isProfileEmpty(user) && (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--muted-wash)] px-5 py-4">
          <UserCircle size={22} aria-hidden className="text-[var(--ink-2)]" />
          <p className="flex-1 text-[0.875rem] leading-relaxed text-[var(--ink-2)]">
            Your profile is nearly empty — DSAC reads it to decide who fits a project,
            so add {profileGaps(user).slice(0, 2).join(' and ')} before you express
            interest.
          </p>
          <Button size="sm" variant="secondary" onClick={() => navigate('/staff/profile')}>
            Fill in my profile
          </Button>
        </div>
      )}

      {projects === null ? (
        error ? (
          <ErrorNote message={error} onRetry={() => void load()} />
        ) : (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )
      ) : (
        <>
          <FilterBar
            value={filters}
            onChange={setFilters}
            skills={skills}
            matchCount={visible.length}
            totalCount={projects.length}
          />

          {visible.length === 0 ? (
            isFiltered(filters) ? (
              <EmptyState
                icon={MagnifyingGlass}
                title="No projects match those filters."
                body="Loosen one of them — the skill filter is usually the narrow one."
                action={
                  <Button variant="secondary" onClick={() => setFilters(EMPTY_FILTERS)}>
                    Reset filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={FolderOpen}
                title="No projects on the board yet."
                body="DSAC publishes briefs here as they come in. Check back, and keep your profile current so you are findable when one lands."
                action={
                  <Button variant="secondary" onClick={() => navigate('/staff/profile')}>
                    Go to my profile
                  </Button>
                }
              />
            )
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((project, index) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  index={index}
                  onOpen={() => {
                    setDialogError('');
                    setOpenId(project.id);
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      <InterestDialog
        open={openId !== null}
        project={openProject}
        busy={dialogBusy}
        error={dialogError}
        onClose={() => setOpenId(null)}
        onExpress={(message) => void express(message)}
        onWithdraw={() => void withdraw()}
      />
    </div>
  );
}
