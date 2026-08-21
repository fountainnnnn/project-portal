import { useEffect, useRef, useState } from 'react';
import { CaretDown, SidebarSimple, SignOut } from '@phosphor-icons/react';
import type { IconComponent, User } from '@/src/lib/types';

/**
 * PortalShell — the left rail and page frame around every signed-in page.
 *
 * The booth's StudioShell with two changes: the nav is passed in rather than
 * hardcoded (admin and staff see different rails, and App owns which), and the
 * fixed-height branch is gone. Every page in the portal is a scrolling list or
 * a long form; the booth needed the pinned variant only because its camera had
 * to fill exactly one viewport.
 */

export interface NavItem {
  path: string; // route path; also the active key
  label: string;
  Icon: IconComponent;
}

export interface PortalShellProps {
  nav: NavItem[]; // App passes the role's list
  activePath: string;
  onNavigate: (path: string) => void;
  user: User; // name + role rendered in the account block
  onLogout: () => void;
  children: React.ReactNode;
}

/** Remembered per device: whoever works in the portal has a standing preference. */
const COLLAPSE_KEY = 'dsac.portal.rail.collapsed';

/** Initials for the account square. Two letters at most — "Wei Ling Tan" is WT. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '??';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export default function PortalShell({
  nav,
  activePath,
  onNavigate,
  user,
  onLogout,
  children,
}: PortalShellProps) {
  const [collapsed, setCollapsed] = useState(() => {
    // localStorage throws outright in some privacy modes, so every access is
    // guarded — a shell that cannot render is a worse outcome than a rail that
    // forgets it was collapsed.
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      /* private mode */
    }
  }, [collapsed]);

  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accountOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!accountRef.current?.contains(e.target as Node)) setAccountOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAccountOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [accountOpen]);

  /** One row of the rail: label + icon when open, icon alone when shut. */
  const navButton = ({ path, label, Icon }: NavItem) => {
    const on = activePath === path;
    return (
      <button
        key={path}
        type="button"
        onClick={() => onNavigate(path)}
        aria-current={on ? 'page' : undefined}
        // Collapsed, the label is gone from the DOM entirely, so the title and
        // aria-label have to carry it for sighted and AT users alike.
        title={collapsed ? label : undefined}
        aria-label={collapsed ? label : undefined}
        className={`flex items-center rounded-xl py-2.5 text-left text-[0.875rem] font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
          collapsed ? 'justify-center px-0' : 'gap-3 px-3'
        } ${
          on
            ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)]'
            : 'text-[var(--ink-2)] hover:bg-[var(--shell-bg)] hover:text-[var(--ink)]'
        }`}
      >
        <Icon size={19} weight={on ? 'fill' : 'regular'} />
        {!collapsed && label}
      </button>
    );
  };

  const collapseButton = (
    <button
      type="button"
      onClick={() => setCollapsed(c => !c)}
      aria-expanded={!collapsed}
      title={collapsed ? 'Expand the menu' : 'Collapse the menu'}
      aria-label={collapsed ? 'Expand the menu' : 'Collapse the menu'}
      className={`flex h-9 w-9 items-center justify-center rounded-xl text-[var(--ink-3)] transition-colors duration-150 hover:bg-[var(--shell-bg)] hover:text-[var(--ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
        collapsed ? 'mx-auto' : 'ml-auto'
      }`}
    >
      <SidebarSimple size={17} weight={collapsed ? 'fill' : 'regular'} />
    </button>
  );

  return (
    <div className="flex h-dvh w-full overflow-hidden" style={{ background: 'var(--shell-bg)' }}>
      <aside
        className={`flex flex-shrink-0 flex-col bg-white py-5 transition-[width] duration-200 ${
          collapsed ? 'w-[72px] px-3' : 'w-[248px] px-4'
        }`}
      >
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2 pl-1.5'}`}>
          {/* The real DSAC wordmark, shared with the photo booth so the two
              apps are visibly the same centre. It is a wide lockup — roughly
              3.8:1 — so it only fits the expanded rail; collapsed to 72px it
              would either shrink to an illegible smudge or crop mid-word, and
              the SP monogram says the same thing in the space available.

              The mark stands alone rather than carrying a "Project portal"
              label beside it: at 248px the two plus the collapse control were
              fighting for the same inch, and the page's own eyebrow already
              names the section. */}
          {collapsed ? (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-[0.7rem] font-bold text-white">
              SP
            </span>
          ) : (
            <>
              <img
                src="/sp-dsac-logo.png"
                alt="SP Data Science and Analytics Centre"
                className="h-8 w-auto min-w-0 flex-1 object-contain object-left"
              />
              {collapseButton}
            </>
          )}
        </div>

        {collapsed && <div className="mt-3 flex">{collapseButton}</div>}

        <nav className="mt-6 flex flex-col gap-1">{nav.map(navButton)}</nav>

        <div
          ref={accountRef}
          className="relative mt-auto border-t border-[var(--border)] pt-3"
        >
          <button
            type="button"
            onClick={() => setAccountOpen(o => !o)}
            aria-expanded={accountOpen}
            aria-haspopup="menu"
            aria-label={collapsed ? `Account: ${user.name}` : undefined}
            className={`flex w-full items-center rounded-xl py-2 transition-colors duration-150 hover:bg-[var(--shell-bg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
              collapsed ? 'justify-center px-0' : 'gap-2.5 px-2'
            }`}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--shell-bg)] text-[0.7rem] font-bold text-[var(--ink)]">
              {initials(user.name)}
            </span>
            {!collapsed && (
              <>
                {/* min-w-0 + truncate, because a full name is longer than a
                    248px rail more often than not. */}
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[0.8125rem] font-semibold text-[var(--ink)]">
                    {user.name}
                  </span>
                  <span className="block text-[0.6875rem] capitalize text-[var(--ink-3)]">
                    {user.role}
                  </span>
                </span>
                {/* Points at the menu: down closed, up once it has opened
                    above the button. */}
                <CaretDown
                  size={13}
                  weight="bold"
                  aria-hidden
                  className={`shrink-0 text-[var(--ink-3)] transition-transform duration-200 ease-out ${
                    accountOpen ? '-rotate-180' : 'rotate-0'
                  }`}
                />
              </>
            )}
          </button>

          {accountOpen && (
            <div
              role="menu"
              className={`dsac-pop-up absolute bottom-full z-10 mb-1.5 rounded-xl border border-[var(--border)] bg-white py-1.5 shadow-[0_4px_16px_rgba(11,10,12,0.12)] ${
                collapsed ? 'left-0 w-44' : 'left-0 right-0'
              }`}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAccountOpen(false);
                  onLogout();
                }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[0.8125rem] font-medium text-[var(--ink)] hover:bg-[var(--shell-bg)]"
              >
                <SignOut size={15} aria-hidden />
                Log out
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* The white card is the stage. It scrolls with the page rather than
          owning an inner scrollbar — nesting scroll regions inside a
          fixed-height card means hunting for content in little windows. */}
      <main className="min-w-0 flex-1 overflow-y-auto p-4">
        <div className="flex min-h-full flex-col rounded-[24px] bg-white px-7 py-6 shadow-[0_1px_3px_rgba(11,10,12,0.06),0_12px_32px_-16px_rgba(11,10,12,0.14)]">
          {children}
        </div>
      </main>
    </div>
  );
}
