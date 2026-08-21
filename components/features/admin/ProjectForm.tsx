import { useEffect, useState } from 'react';
import { Sparkle } from '@phosphor-icons/react';
import type { AdminProject, Meta, ProjectInput } from '@/src/lib/types';
import { api, ApiError } from '@/src/lib/api';
import Button from '@/components/ui/Button';
import Field from '@/components/ui/Field';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import Spinner from '@/components/ui/Spinner';
import TagInput from '@/components/ui/TagInput';
import ErrorNote from '@/components/ui/ErrorNote';

export interface ProjectFormProps {
  open: boolean;
  /** null = create a new project; an object = edit that one. */
  project: AdminProject | null;
  /** From the page's one /api/meta call — statuses, and whether AI is configured. */
  meta: Meta | null;
  onClose: () => void;
  /** Receives the saved project so the page can splice it into its list. */
  onSaved: (project: AdminProject) => void;
}

/** The form's own shape: exactly ProjectInput, because that is what we POST. */
type Draft = ProjectInput;

const BLANK: Draft = {
  title: '',
  description: '',
  client: '',
  ndaRequired: false,
  startsOn: '',
  endsOn: '',
  durationNote: '',
  status: 'available',
  skills: [],
};

/** Server caps project skills at 20; mirror it so the admin is told before the
 *  save silently truncates rather than after. */
const MAX_SKILLS = 20;

export default function ProjectForm({ open, project, meta, onClose, onSaved }: ProjectFormProps) {
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [titleError, setTitleError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateNote, setGenerateNote] = useState('');

  const undisclosed = meta?.undisclosedClient ?? 'Undisclosed';

  // Reload the draft whenever the modal opens, or opens onto a different
  // project. Editing project A, closing, then opening B must not show A's text.
  useEffect(() => {
    if (!open) return;
    setDraft(
      project
        ? {
            title: project.title,
            description: project.description,
            // The server stores 'Undisclosed' rather than an empty client, so an
            // edit would otherwise show the placeholder word as if the admin had
            // typed it. Blank it back out and let the hint explain the default.
            client: project.client === undisclosed ? '' : project.client,
            ndaRequired: project.ndaRequired,
            startsOn: project.startsOn,
            endsOn: project.endsOn,
            durationNote: project.durationNote,
            status: project.status,
            skills: project.skills,
          }
        : BLANK,
    );
    setTitleError('');
    setSaveError('');
    setGenerateNote('');
  }, [open, project, undisclosed]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  async function handleGenerate() {
    setGenerating(true);
    setGenerateNote('');
    try {
      const result = await api.suggestSkills(draft.description);
      if (!result.ok) {
        // A refusal is an ordinary outcome, not a failure of the form. Say what
        // happened on the hint line and leave every field editable.
        setGenerateNote(result.error ?? 'Generation did not return anything usable.');
        return;
      }
      // Merge rather than replace: anything the admin already typed is theirs.
      // TagInput dedupes what is typed into it, but tags arriving this way
      // bypass that path, so the merge does its own case-insensitive check.
      setDraft((current) => {
        const seen = new Set(current.skills.map((tag) => tag.toLowerCase()));
        const merged = [...current.skills];
        for (const tag of result.tags) {
          if (seen.has(tag.toLowerCase())) continue;
          seen.add(tag.toLowerCase());
          merged.push(tag);
          if (merged.length === MAX_SKILLS) break;
        }
        return { ...current, skills: merged };
      });
    } catch (cause) {
      // Only a network-level failure reaches here; suggestSkills passes
      // ok:false through without throwing.
      setGenerateNote(
        cause instanceof Error ? cause.message : 'Could not reach the suggestion service.',
      );
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    const title = draft.title.trim();
    if (!title) {
      setTitleError('A project needs a title.');
      return;
    }
    setTitleError('');
    setSaveError('');
    setSaving(true);
    try {
      const saved = project
        ? await api.updateProject(project.id, { ...draft, title })
        : await api.createProject({ ...draft, title });
      onSaved(saved);
      onClose();
    } catch (cause) {
      setSaveError(cause instanceof ApiError ? cause.message : 'Could not save the project.');
    } finally {
      setSaving(false);
    }
  }

  const aiConfigured = meta?.ai.configured ?? false;
  const skillsHint = aiConfigured
    ? `Type your own, or generate a starting set with ${meta?.ai.provider} (${meta?.ai.model}). Generated tags are suggestions — edit or remove any of them.`
    : meta
      ? `Generation is off: no ${meta.ai.provider} key is configured. Type the tags by hand.`
      : 'Press Enter or comma to add a tag.';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project ? 'Edit project' : 'New project'}
      width="lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? <Spinner size={16} /> : null}
            {project ? 'Save changes' : 'Create project'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {saveError ? <ErrorNote message={saveError} /> : null}

        <Field label="Title" htmlFor="project-title" required error={titleError}>
          <input
            id="project-title"
            className="dsac-input"
            value={draft.title}
            onChange={(event) => set('title', event.target.value)}
            placeholder="Energy consumption dashboard for campus buildings"
            autoComplete="off"
          />
        </Field>

        <Field
          label="Description"
          htmlFor="project-description"
          hint="What the work is, who it is for, and what a good outcome looks like. This is also what the skill suggestion reads."
        >
          <textarea
            id="project-description"
            className="dsac-input"
            value={draft.description}
            onChange={(event) => set('description', event.target.value)}
            placeholder="Describe the problem, the client's situation, and the shape of the deliverable."
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Client"
            htmlFor="project-client"
            hint={`Leave blank to publish it as "${undisclosed}".`}
          >
            <div className="flex items-center gap-2">
              <input
                id="project-client"
                className="dsac-input"
                value={draft.client}
                onChange={(event) => set('client', event.target.value)}
                placeholder={undisclosed}
                autoComplete="off"
              />
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => set('client', '')}
                disabled={!draft.client}
                className="shrink-0"
              >
                Withhold
              </Button>
            </div>
          </Field>

          <Field label="Status" htmlFor="project-status" hint="Closed projects stop taking interest.">
            <Select
              id="project-status"
              value={draft.status}
              onChange={(event) => set('status', event.target.value as Draft['status'])}
              options={(meta?.projectStatuses ?? ['available', 'closed']).map((status) => ({
                value: status,
                label: status === 'available' ? 'Available' : 'Closed',
              }))}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts on" htmlFor="project-starts">
            <input
              id="project-starts"
              type="date"
              className="dsac-input"
              value={draft.startsOn}
              onChange={(event) => set('startsOn', event.target.value)}
            />
          </Field>
          <Field label="Ends on" htmlFor="project-ends">
            <input
              id="project-ends"
              type="date"
              className="dsac-input"
              value={draft.endsOn}
              onChange={(event) => set('endsOn', event.target.value)}
            />
          </Field>
        </div>

        <Field
          label="Duration note"
          htmlFor="project-duration-note"
          hint="Overrides the dates wherever the timeline is shown — use it when the dates are soft (&quot;4 months, starting Q1&quot;)."
        >
          <input
            id="project-duration-note"
            className="dsac-input"
            value={draft.durationNote}
            onChange={(event) => set('durationNote', event.target.value)}
            placeholder="4 months"
            autoComplete="off"
          />
        </Field>

        {/* No htmlFor on the Field: the checkbox carries its own wrapping label
            below, and two labels for one input read the name out twice. */}
        <Field label="NDA" hint="Flags the project so staff know before they express interest.">
          {/* A native checkbox rather than a switch: it is a form value that
              saves with everything else, not a live setting. */}
          <label className="flex items-center gap-2.5 text-[0.9375rem] text-[var(--ink)]">
            <input
              id="project-nda"
              type="checkbox"
              className="size-4 accent-[var(--accent)]"
              checked={draft.ndaRequired}
              onChange={(event) => set('ndaRequired', event.target.checked)}
            />
            This project requires an NDA
          </label>
        </Field>

        <Field
          label="Skills"
          htmlFor="project-skills"
          hint={generateNote ? undefined : skillsHint}
          error={generateNote || undefined}
        >
          <div className="flex flex-col gap-2">
            <TagInput
              id="project-skills"
              value={draft.skills}
              onChange={(skills) => set('skills', skills)}
              max={MAX_SKILLS}
              placeholder="Power BI, Time Series Analysis…"
            />
            <div>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={handleGenerate}
                // Only this button locks while it runs — the form stays typeable.
                disabled={generating || !aiConfigured}
              >
                {generating ? <Spinner size={16} /> : <Sparkle size={16} aria-hidden />}
                {generating ? 'Generating…' : 'Generate from description'}
              </Button>
            </div>
          </div>
        </Field>
      </div>
    </Modal>
  );
}
