import { WarningCircle } from '@phosphor-icons/react';
import Button from './Button';

/**
 * ErrorNote — the strip a page shows when a request failed.
 *
 * The message comes straight from ApiError, which carries whatever the server
 * said. That is deliberate: the server writes sentences for humans, and a
 * client-side translation table would only ever be a worse copy of them that
 * goes stale.
 *
 * `role="alert"` so the failure is announced. Not a toast — a toast for a
 * failed load disappears before you have decided what to do about it, and
 * takes the retry with it.
 */
export interface ErrorNoteProps {
  message: string;
  onRetry?: () => void; // renders a small 'Try again' ghost Button
  className?: string;
}

export default function ErrorNote({ message, onRetry, className = '' }: ErrorNoteProps) {
  return (
    <div
      role="alert"
      className={`flex flex-wrap items-center gap-3 rounded-xl border border-[color-mix(in_srgb,var(--accent)_25%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_5%,var(--surface))] px-4 py-3 ${className}`}
    >
      <WarningCircle size={18} weight="fill" aria-hidden className="shrink-0 text-[var(--accent)]" />
      <p className="min-w-0 flex-1 text-[0.875rem] leading-[1.45] text-[var(--accent-ink)]">
        {message}
      </p>
      {onRetry && (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
