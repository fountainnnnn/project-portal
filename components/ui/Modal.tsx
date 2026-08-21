import { useEffect, useRef } from 'react';
import { X } from '@phosphor-icons/react';

/**
 * Modal — scrim plus panel, the only dialog in the app.
 *
 * Not <dialog>: its top-layer rendering ignores our own stacking and its
 * backdrop is styled through a pseudo-element that doesn't take the
 * .dsac-fade-in class. A plain fixed overlay costs us the Escape handler and
 * the scroll lock, both of which are a handful of lines here and behave the
 * same in every browser we care about.
 */
export interface ModalProps {
  open: boolean;
  onClose: () => void; // scrim click and Escape both call this
  title: string;
  /** max-w of the panel; default 'md' (28rem). 'lg' = 40rem for ProjectForm/roster. */
  width?: 'md' | 'lg';
  children: React.ReactNode;
  /** Optional sticky footer row (usually Buttons, right-aligned). */
  footer?: React.ReactNode;
}

export default function Modal({
  open,
  onClose,
  title,
  width = 'md',
  children,
  footer,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    // Lock the page behind the scrim. Without this the list underneath scrolls
    // when the wheel passes the panel's edges, which makes the modal feel like
    // it is floating loose over a moving page.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Move focus into the panel so the next Tab lands on the form rather than
    // continuing through the page hidden behind the scrim.
    panelRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="dsac-fade-in fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(11,10,12,0.42)] p-4 py-[6vh] backdrop-blur-[2px]"
      // The scrim closes only on its own mousedown; a click that started
      // inside the panel and drifted out (selecting text, dragging a slider)
      // must not be read as "dismiss".
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`dsac-pop-up flex w-full flex-col rounded-2xl bg-white shadow-[0_4px_12px_rgba(11,10,12,0.1),0_24px_60px_-20px_rgba(11,10,12,0.3)] focus:outline-none ${
          width === 'lg' ? 'max-w-[40rem]' : 'max-w-[28rem]'
        }`}
      >
        <header className="flex items-start gap-4 border-b border-[var(--border)] px-6 py-4">
          <h2 className="min-w-0 flex-1 text-[1.0625rem] font-medium tracking-[-0.01em] text-[var(--ink)]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--ink-3)] transition-colors duration-150 hover:bg-[var(--shell-bg)] hover:text-[var(--ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <X size={16} weight="bold" />
          </button>
        </header>

        <div className="px-6 py-5">{children}</div>

        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-2.5 border-t border-[var(--border)] px-6 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
