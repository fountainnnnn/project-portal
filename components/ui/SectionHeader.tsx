/**
 * SectionHeader — the header block that opens every screen.
 *
 * Gradient eyebrow, weight-500 title ending in a period, one- or two-line
 * subtitle. Repeating this exact grammar is what makes the pages read as one
 * portal rather than as four separate builds by four people.
 *
 * Ported from the booth with the type scale pulled down a step: a dashboard
 * header sits above a list and has to leave room for it, where the booth's
 * headers were the whole screen.
 */
export interface SectionHeaderProps {
  eyebrow: string; // UPPERCASE gradient line
  title: React.ReactNode; // ends with a period
  subtitle?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg'; // 'lg' is the LoginPage hero only
  align?: 'center' | 'left'; // dashboards use 'left'
  className?: string;
}

export default function SectionHeader({
  eyebrow,
  title,
  subtitle,
  size = 'md',
  align = 'center',
  className = '',
}: SectionHeaderProps) {
  const alignment = align === 'center' ? 'items-center text-center' : 'items-start text-left';

  const titleSize = {
    sm: 'text-[1.25rem] leading-[1.2] mt-1.5',
    md: 'text-[1.75rem] leading-[1.15] mt-2.5',
    lg: 'text-[2.5rem] leading-[1.08] mt-3',
  }[size];

  const subSize = {
    sm: 'text-[0.8125rem] mt-1.5',
    md: 'text-[0.9375rem] mt-2.5',
    lg: 'text-[1.0625rem] mt-3',
  }[size];

  return (
    <div className={`flex flex-col ${alignment} ${className}`}>
      <p
        className={`dsac-gradient-text font-semibold uppercase tracking-[1px] ${
          size === 'sm' ? 'text-[0.6875rem]' : 'text-[0.75rem]'
        }`}
      >
        {eyebrow}
      </p>
      <h1 className={`font-medium tracking-[-0.02em] text-[var(--ink)] ${titleSize}`}>{title}</h1>
      {subtitle && (
        <p className={`max-w-[52ch] leading-[1.5] text-[var(--ink-2)] ${subSize}`}>{subtitle}</p>
      )}
    </div>
  );
}
