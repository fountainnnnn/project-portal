/**
 * GlowCard — the portal's only card surface.
 *
 * `.dsac-glow-card` reads its bloom colour from a `--card-glow` custom
 * property. Every consumer setting that property by hand is how a design
 * system drifts, so this component owns it: callers name a tone, or hand over
 * their index in a list and get the rotation for free.
 *
 * The hue never means anything. Status is a StatusBadge; a card is not amber
 * because it is closed.
 */
export type GlowTone = 'rose' | 'amber' | 'iris';

export const GLOW_ORDER: GlowTone[] = ['rose', 'amber', 'iris'];

export interface GlowCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Either name a tone, or pass a list index and the card picks
   *  GLOW_ORDER[index % 3]. Exactly one of the two; index wins if both. */
  tone?: GlowTone;
  index?: number;
  /** Adds .dsac-glow-card-interactive (hover lift). Only for clickable cards. */
  interactive?: boolean;
  children: React.ReactNode;
}

export default function GlowCard({
  tone = 'rose',
  index,
  interactive = false,
  className = '',
  style,
  children,
  ...rest
}: GlowCardProps) {
  const resolved = index === undefined ? tone : GLOW_ORDER[Math.abs(index) % GLOW_ORDER.length];

  return (
    <div
      className={`dsac-glow-card ${interactive ? 'dsac-glow-card-interactive' : ''} ${className}`}
      // Spread the caller's style after the glow so a page can still set a
      // stagger animationDelay without having to know about --card-glow.
      style={{ ['--card-glow' as string]: `var(--glow-${resolved})`, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}
