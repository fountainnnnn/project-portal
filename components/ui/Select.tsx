import { CaretDown } from '@phosphor-icons/react';

/**
 * Select — a native <select> wearing .dsac-input.
 *
 * Native, not a custom listbox: it gets keyboard behaviour, mobile pickers and
 * long-list scrolling for free, and the only thing wrong with it out of the
 * box is the chevron, which looks different on every platform. globals.css
 * suppresses that one and we draw a Phosphor caret over the top.
 */
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Convenience: renders <option> list; children also allowed instead. */
  options?: { value: string; label: string }[];
}

export default function Select({ options, className = '', children, ...rest }: SelectProps) {
  return (
    <div className="relative">
      <select className={`dsac-input ${className}`} {...rest}>
        {options ? options.map(o => <option key={o.value} value={o.value}>{o.label}</option>) : children}
      </select>
      <CaretDown
        size={14}
        weight="bold"
        aria-hidden
        // pointer-events-none so the caret is decoration sitting on top of the
        // control rather than a dead zone in the middle of its hit area.
        className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-3)]"
      />
    </div>
  );
}
