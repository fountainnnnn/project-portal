import { X } from '@phosphor-icons/react';

/**
 * Tag — one skill chip.
 *
 * Read-only by default. Passing `onRemove` turns it into the editable form
 * used inside TagInput, which is the only place chips are removable.
 */
export interface TagProps {
  label: string;
  onRemove?: () => void; // renders a Phosphor X button when present
  className?: string;
}

export default function Tag({ label, onRemove, className = '' }: TagProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg bg-[var(--muted-wash)] py-1 pl-2.5 text-[0.8125rem] font-medium text-[var(--ink-2)] ${
        onRemove ? 'pr-1' : 'pr-2.5'
      } ${className}`}
    >
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          // The chip text is small, so the accessible name says which one this
          // removes — a list of six identical "Remove" buttons is no help to
          // anyone navigating by controls.
          aria-label={`Remove ${label}`}
          className="flex h-5 w-5 items-center justify-center rounded-md text-[var(--ink-3)] transition-colors duration-150 hover:bg-white hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <X size={12} weight="bold" />
        </button>
      )}
    </span>
  );
}
