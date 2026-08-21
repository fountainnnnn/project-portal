/**
 * Button — the booth's four variants at web scale.
 *
 * primary   accent fill with the layered glow, the one main action of a view
 * secondary white with a hairline, for neutral peers (Cancel, Edit)
 * ghost     transparent until hovered, for tertiary and inline actions
 * danger    the portal's addition: quiet at rest, solid accent on hover
 *
 * Heights are 32/40/44 rather than the booth's 44/52/60. The booth sized every
 * control for a touchscreen with a queue behind it; this is read at desk
 * distance with a mouse, and kiosk-sized buttons look like shouting.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-8 px-3.5 text-[0.8125rem] gap-1.5',
  md: 'min-h-10 px-5 text-[0.875rem] gap-2',
  lg: 'min-h-11 px-6 text-[0.9375rem] gap-2',
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent)] text-white shadow-[0_1px_2px_rgba(11,10,12,0.18),0_8px_24px_rgba(225,38,47,0.28)] ' +
    'hover:bg-[var(--accent-hover)] hover:-translate-y-px ' +
    'hover:shadow-[0_2px_4px_rgba(11,10,12,0.2),0_12px_30px_rgba(225,38,47,0.34)]',
  secondary:
    'border border-[var(--border)] bg-white text-[var(--ink-2)] ' +
    'shadow-[0_1px_2px_rgba(11,10,12,0.05)] hover:border-[var(--ink)] hover:text-[var(--ink)]',
  ghost:
    'text-[var(--ink-2)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:text-[var(--accent)]',
  // Destructive actions sit *inside* a ConfirmDialog, so the button that opens
  // one does not need to look alarming — a red-filled Delete in a list reads
  // as the page's main action, which it never is. It commits to the accent
  // only once the pointer is on it and the intent is unambiguous.
  danger:
    'text-[var(--accent-ink)] hover:bg-[var(--accent)] hover:text-white',
};

const BASE =
  'inline-flex items-center justify-center rounded-xl font-semibold transition-all duration-150 ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 ' +
  'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 active:translate-y-px';

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      // Default to type="button". Half the buttons in this app live inside a
      // form, and HTML's default of "submit" would make every Cancel and every
      // Generate-skills click save the form instead.
      type={type}
      className={`${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
