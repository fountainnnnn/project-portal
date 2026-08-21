/**
 * Spinner — the one looping animation in the portal.
 *
 * Rotation here is progress, not decoration: it says a request is still in
 * flight, and it stops when the request does. That is the whole reason the
 * pulsing status dot was cut and this was not.
 *
 * Drawn as a bordered circle rather than an icon, because Phosphor has no
 * spinner that spins and a border ring costs no SVG.
 */
export interface SpinnerProps {
  size?: number;
  className?: string;
}

export default function Spinner({ size = 20, className = '' }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-[var(--border)] border-t-[var(--accent)] ${className}`}
      style={{
        width: size,
        height: size,
        // The ring scales with the circle; a fixed 2px border looks like a
        // hairline at 40px and like a doughnut at 14px.
        borderWidth: Math.max(2, Math.round(size / 10)),
      }}
    />
  );
}
