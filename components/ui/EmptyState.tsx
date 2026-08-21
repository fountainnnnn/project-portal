import type { IconComponent } from '@/src/lib/types';

/**
 * EmptyState — what a list shows when it loaded fine and there is nothing in
 * it.
 *
 * Always carries the next step. "No projects yet." on its own is a dead end;
 * "No projects yet." with a Create button is the page telling you what it is
 * for. `action` is optional only because staff-side empties (an over-narrow
 * filter) have no action to offer beyond clearing the filter themselves.
 */
export interface EmptyStateProps {
  icon: IconComponent; // a Phosphor icon
  title: string;
  body?: string;
  action?: React.ReactNode; // usually a Button
  className?: string;
}

export default function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] px-6 py-14 text-center ${className}`}
    >
      {/* aria-hidden on the wrapper rather than the icon: the title says the
          same thing in words, and IconComponent's prop list is deliberately
          narrow so it accepts any Phosphor icon. */}
      <span
        aria-hidden
        className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--muted-wash)] text-[var(--ink-3)]"
      >
        <Icon size={24} />
      </span>
      <p className="mt-4 text-[1rem] font-medium tracking-[-0.01em] text-[var(--ink)]">{title}</p>
      {body && <p className="mt-1.5 max-w-[40ch] text-[0.875rem] leading-[1.5] text-[var(--ink-2)]">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
