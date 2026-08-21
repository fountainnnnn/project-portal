import { useEffect, useState } from 'react';
import { CheckCircle, FloppyDisk, Plus, X } from '@phosphor-icons/react';

import Button from '@/components/ui/Button';
import ErrorNote from '@/components/ui/ErrorNote';
import Field from '@/components/ui/Field';
import Select from '@/components/ui/Select';
import TagInput from '@/components/ui/TagInput';
import type { ProfilePatch, User } from '@/src/lib/types';

/** The server slices past projects at 30; stopping at the same number here keeps
 *  the form honest instead of silently dropping the tail on save. */
const MAX_PAST_PROJECTS = 30;

export interface ProfileFormProps {
  user: User;
  /** From api.meta(). Empty while it loads — the school Select disables itself. */
  schools: string[];
  saving: boolean;
  /** Request-level failure from PUT /api/profile. */
  error: string;
  /** True after a successful save; the page clears it when the next save starts. */
  saved: boolean;
  onSave: (patch: ProfilePatch) => void;
}

interface Draft {
  name: string;
  title: string;
  school: string;
  teaches: string;
  skills: string[];
  background: string;
  pastProjects: string[];
}

function draftOf(user: User): Draft {
  return {
    name: user.name,
    title: user.title,
    school: user.school,
    teaches: user.teaches,
    skills: user.skills,
    background: user.background,
    pastProjects: user.pastProjects,
  };
}

export default function ProfileForm({
  user,
  schools,
  saving,
  error,
  saved,
  onSave,
}: ProfileFormProps) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(user));
  const [pastEntry, setPastEntry] = useState('');
  const [nameError, setNameError] = useState('');

  // Re-seed from the server's copy whenever it changes — after a save the page
  // hands back the persisted user, which is the version worth trusting.
  useEffect(() => {
    setDraft(draftOf(user));
  }, [user]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const addPastProject = () => {
    const entry = pastEntry.trim();
    if (!entry || draft.pastProjects.length >= MAX_PAST_PROJECTS) return;
    set('pastProjects', [...draft.pastProjects, entry]);
    setPastEntry('');
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim()) {
      // The server quietly falls back to the old name on an empty string, which
      // would look like the save silently ignored the field. Catch it here.
      setNameError('Your name cannot be blank.');
      return;
    }
    setNameError('');
    onSave({ ...draft, name: draft.name.trim() });
  };

  return (
    <form className="flex flex-col gap-6" onSubmit={submit}>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name" htmlFor="profile-name" required error={nameError}>
          <input
            id="profile-name"
            className="dsac-input"
            maxLength={120}
            value={draft.name}
            onChange={(event) => set('name', event.target.value)}
            disabled={saving}
          />
        </Field>

        <Field label="Title" htmlFor="profile-title" hint="e.g. Senior Lecturer">
          <input
            id="profile-title"
            className="dsac-input"
            maxLength={120}
            value={draft.title}
            onChange={(event) => set('title', event.target.value)}
            disabled={saving}
          />
        </Field>
      </div>

      {/* The school list comes from /api/meta, never from a constant in here.
          The server rejects anything off that list, so a free-text field would
          be a 400 waiting to happen. */}
      <Field
        label="School"
        htmlFor="profile-school"
        hint="The ten SP schools DSAC works with."
      >
        <Select
          id="profile-school"
          value={draft.school}
          onChange={(event) => set('school', event.target.value)}
          disabled={saving || schools.length === 0}
          options={[
            { value: '', label: 'Not set' },
            ...schools.map((school) => ({ value: school, label: school })),
          ]}
        />
      </Field>

      <Field
        label="What you teach"
        htmlFor="profile-teaches"
        hint="Modules or subject areas, comma separated."
      >
        <input
          id="profile-teaches"
          className="dsac-input"
          maxLength={400}
          placeholder="Data Engineering, Applied Machine Learning"
          value={draft.teaches}
          onChange={(event) => set('teaches', event.target.value)}
          disabled={saving}
        />
      </Field>

      <Field
        label="Skills"
        htmlFor="profile-skills"
        hint="These are matched against the skills a project asks for. Press Enter after each."
      >
        <TagInput
          id="profile-skills"
          value={draft.skills}
          onChange={(skills) => set('skills', skills)}
          placeholder="Python, Power BI, Stakeholder Management…"
          max={40}
          disabled={saving}
        />
      </Field>

      <Field
        label="Background"
        htmlFor="profile-background"
        hint="A short paragraph on your experience — industry work counts as much as teaching."
      >
        <textarea
          id="profile-background"
          className="dsac-input"
          maxLength={4000}
          value={draft.background}
          onChange={(event) => set('background', event.target.value)}
          disabled={saving}
        />
      </Field>

      <Field
        label="Past projects"
        htmlFor="profile-past"
        hint={`One per line. ${draft.pastProjects.length}/${MAX_PAST_PROJECTS} added.`}
      >
        <div className="flex flex-col gap-3">
          {draft.pastProjects.length > 0 && (
            <ul className="flex flex-col gap-2">
              {draft.pastProjects.map((entry, index) => (
                <li
                  key={`${entry}-${index}`}
                  className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5"
                >
                  <span className="flex-1 text-[0.875rem] leading-relaxed text-[var(--ink)]">
                    {entry}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove ${entry}`}
                    disabled={saving}
                    onClick={() =>
                      set(
                        'pastProjects',
                        draft.pastProjects.filter((_, i) => i !== index),
                      )
                    }
                  >
                    <X size={14} aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-2">
            <input
              id="profile-past"
              className="dsac-input"
              maxLength={200}
              placeholder="Retail demand forecasting pilot with a grocery chain (2024)"
              value={pastEntry}
              onChange={(event) => setPastEntry(event.target.value)}
              onKeyDown={(event) => {
                // Enter adds the entry rather than submitting the whole form,
                // which is what every list-builder input has taught people.
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addPastProject();
                }
              }}
              disabled={saving || draft.pastProjects.length >= MAX_PAST_PROJECTS}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={addPastProject}
              disabled={
                saving || !pastEntry.trim() || draft.pastProjects.length >= MAX_PAST_PROJECTS
              }
            >
              <Plus size={15} aria-hidden />
              Add
            </Button>
          </div>
        </div>
      </Field>

      {error && <ErrorNote message={error} />}

      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-5">
        <Button type="submit" disabled={saving}>
          <FloppyDisk size={16} aria-hidden />
          {saving ? 'Saving…' : 'Save profile'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={saving}
          onClick={() => {
            setDraft(draftOf(user));
            setPastEntry('');
            setNameError('');
          }}
        >
          Discard changes
        </Button>
        {saved && !saving && (
          <span className="inline-flex items-center gap-1.5 text-[0.8125rem] text-[var(--ok)]">
            <CheckCircle size={15} weight="fill" aria-hidden />
            Profile saved.
          </span>
        )}
      </div>
    </form>
  );
}
