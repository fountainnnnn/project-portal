import { useEffect, useState } from 'react';
import { Buildings, CalendarBlank, Handshake, Lock } from '@phosphor-icons/react';

import Button from '@/components/ui/Button';
import ErrorNote from '@/components/ui/ErrorNote';
import Field from '@/components/ui/Field';
import Modal from '@/components/ui/Modal';
import StatusBadge from '@/components/ui/StatusBadge';
import Tag from '@/components/ui/Tag';
import { formatDuration } from '@/src/lib/format';
import type { StaffProject } from '@/src/lib/types';

export interface InterestDialogProps {
  open: boolean;
  /** Null while the dialog animates shut; the panel keeps its last content until then. */
  project: StaffProject | null;
  busy: boolean;
  /** Request-level failure text, including the 409 a project that closed mid-read returns. */
  error: string;
  onClose: () => void;
  onExpress: (message: string) => void;
  onWithdraw: () => void;
}

/**
 * The project's detail view, and the only place interest is expressed.
 *
 * Interest is a one-click-plus-a-sentence commitment, not a form, so it lives in
 * a modal over the grid rather than on its own route: the lecturer reads the
 * full description and decides in the same breath, then lands back in the list
 * with their place kept.
 */
export default function InterestDialog({
  open,
  project,
  busy,
  error,
  onClose,
  onExpress,
  onWithdraw,
}: InterestDialogProps) {
  const [message, setMessage] = useState('');

  // Each project gets a fresh draft. Carrying a half-typed note from the last
  // project into this one would be a genuinely bad surprise on send.
  useEffect(() => {
    setMessage('');
  }, [project?.id]);

  if (!project) return null;

  const mine = project.myInterest;
  const closed = project.status === 'closed';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project.title}
      width="lg"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Close
          </Button>
          {mine ? (
            <Button variant="ghost" onClick={onWithdraw} disabled={busy}>
              Withdraw interest
            </Button>
          ) : (
            // A closed project offers no button at all. The server rejects the
            // call with a 409 regardless; hiding the control is what stops the
            // lecturer from believing they had a shot.
            !closed && (
              <Button onClick={() => onExpress(message)} disabled={busy}>
                <Handshake size={16} aria-hidden />
                {busy ? 'Sending…' : 'Express interest'}
              </Button>
            )
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={project.status} />
          {project.ndaRequired && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--muted-wash)] px-2.5 py-1 text-[0.75rem] font-medium text-[var(--ink-2)]">
              <Lock size={13} aria-hidden />
              NDA required
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2 text-[0.8125rem] text-[var(--ink-2)]">
          <span className="inline-flex items-center gap-1.5">
            <Buildings size={14} aria-hidden />
            {project.client}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarBlank size={14} aria-hidden />
            {formatDuration(project)}
          </span>
        </div>

        <p className="text-[0.9375rem] leading-relaxed whitespace-pre-line text-[var(--ink-2)]">
          {project.description || 'No description provided yet.'}
        </p>

        {project.skills.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-[0.75rem] font-medium tracking-wide text-[var(--ink-3)] uppercase">
              Skills wanted
            </span>
            <div className="flex flex-wrap gap-1.5">
              {project.skills.map((skill) => (
                <Tag key={skill} label={skill} />
              ))}
            </div>
          </div>
        )}

        {project.ndaRequired && (
          <p className="rounded-xl bg-[var(--muted-wash)] px-4 py-3 text-[0.8125rem] leading-relaxed text-[var(--ink-2)]">
            The client's name and brief are under NDA. DSAC will send the paperwork
            before sharing anything further.
          </p>
        )}

        {error && <ErrorNote message={error} />}

        <div className="border-t border-[var(--border)] pt-5">
          {mine ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-[0.875rem] text-[var(--ink)]">
                <Handshake size={16} aria-hidden />
                <span>You have expressed interest.</span>
                <StatusBadge status={mine.status} className="ml-auto" />
              </div>
              <p className="text-[0.875rem] leading-relaxed text-[var(--ink-2)]">
                {mine.message ? (
                  <>
                    <span className="text-[var(--ink-3)]">Your note to DSAC: </span>
                    {mine.message}
                  </>
                ) : (
                  'You sent no note with it.'
                )}
              </p>
            </div>
          ) : closed ? (
            <p className="text-[0.875rem] text-[var(--ink-2)]">
              DSAC has closed this one — it is either filled or parked for now.
            </p>
          ) : (
            <Field
              label="Message to DSAC"
              htmlFor="interest-message"
              hint="Optional. A line on why it fits you goes a long way — it is read alongside your profile."
            >
              <textarea
                id="interest-message"
                className="dsac-input"
                maxLength={1000}
                placeholder="I teach the module this maps to, and I ran something similar last year…"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                disabled={busy}
              />
            </Field>
          )}
        </div>
      </div>
    </Modal>
  );
}
