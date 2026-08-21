/**
 * Field — label, control, and the one line underneath it.
 *
 * Field does not clone props onto its child. Cloning looks convenient right up
 * to the point where a caller passes a fragment or a composite control like
 * TagInput, so the id/htmlFor pairing is the caller's job and stays visible at
 * the call site.
 */
export interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string; // muted line under the control
  error?: string; // replaces hint, in --accent-ink
  required?: boolean; // renders a muted 'required' tag, not an asterisk
  className?: string;
  children: React.ReactNode; // the control
}

export default function Field({
  label,
  htmlFor,
  hint,
  error,
  required = false,
  className = '',
  children,
}: FieldProps) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-baseline gap-2">
        <label
          htmlFor={htmlFor}
          className="text-[0.8125rem] font-semibold text-[var(--ink)]"
        >
          {label}
        </label>
        {/* The word rather than an asterisk: an asterisk is a convention you
            have to already know, and it reads as nothing at all aloud. */}
        {required && (
          <span className="text-[0.6875rem] font-medium uppercase tracking-[0.5px] text-[var(--ink-3)]">
            required
          </span>
        )}
      </div>

      {children}

      {/* One line, never two — an error replaces the hint rather than stacking
          under it, so the form never grows a row mid-typing. */}
      {error ? (
        <p className="text-[0.8125rem] leading-[1.4] text-[var(--accent-ink)]">{error}</p>
      ) : hint ? (
        <p className="text-[0.8125rem] leading-[1.4] text-[var(--ink-3)]">{hint}</p>
      ) : null}
    </div>
  );
}
