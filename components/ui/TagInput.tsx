import { useState } from 'react';
import Tag from './Tag';

/**
 * TagInput — the skills editor, shared by the admin project form and the staff
 * profile form.
 *
 * Deliberately not a combobox. There is no canonical skill vocabulary in this
 * organisation and inventing one in the UI would either fight the AI
 * suggestions or quietly discard what someone typed. So: free text, Enter or
 * comma to commit, and case-insensitive dedup so "Python" and "python" don't
 * both end up on the same project.
 */
export interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  /** Server caps: 20 for projects, unbounded-ish for profiles; default 20. */
  max?: number;
  disabled?: boolean;
  id?: string; // for Field's label htmlFor
}

export default function TagInput({
  value,
  onChange,
  placeholder = 'Type a skill and press Enter',
  max = 20,
  disabled = false,
  id,
}: TagInputProps) {
  const [draft, setDraft] = useState('');

  const full = value.length >= max;

  /**
   * Commits the draft, splitting on commas rather than treating them as text.
   *
   * The keydown handler already intercepts a typed comma, so this split looks
   * redundant — it is not. Text can reach the draft without a single keystroke:
   * pasting "Python, SQL, React" off a course outline is the obvious case, and
   * autofill and IME composition do it too. Without the split those three
   * skills become one tag reading "Python, SQL, React", which then fails to
   * match any filter and looks like a typo the admin has to hunt down later.
   */
  const commit = (raw: string) => {
    if (full) return;

    const labels = raw
      .split(',')
      .map(part => part.trim().replace(/\s+/g, ' '))
      .filter(Boolean);

    if (labels.length === 0) {
      setDraft('');
      return;
    }

    // Dedup on lowercase but store what was typed — the first spelling wins,
    // which keeps whatever capitalisation the author chose. Accumulated across
    // the batch as well as against `value`, so one paste cannot introduce two
    // spellings of the same skill.
    const next = [...value];
    for (const label of labels) {
      if (next.length >= max) break;
      if (next.some(tag => tag.toLowerCase() === label.toLowerCase())) continue;
      next.push(label);
    }

    if (next.length !== value.length) onChange(next);
    setDraft('');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      // Enter inside a form would submit it, and a comma is a separator here
      // rather than a character, so both are ours to intercept.
      e.preventDefault();
      commit(draft);
      return;
    }
    if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div>
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((tag, i) => (
            <Tag
              key={`${tag}-${i}`}
              label={tag}
              onRemove={disabled ? undefined : () => onChange(value.filter(t => t !== tag))}
            />
          ))}
        </div>
      )}

      <input
        id={id}
        type="text"
        className="dsac-input"
        value={draft}
        disabled={disabled || full}
        placeholder={full ? `Limit of ${max} reached` : placeholder}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        // Someone who types a skill and then clicks Save straight away means
        // to keep that skill. Losing it on blur is the single most annoying
        // bug this control can have.
        onBlur={() => commit(draft)}
      />
    </div>
  );
}
