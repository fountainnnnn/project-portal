/**
 * A pathname router in forty lines.
 *
 * The portal has six routes, no nesting, and no params we don't parse
 * ourselves, so react-router would mostly be idioms to agree on rather than
 * behaviour to gain. What the booth's plain `window.location.pathname` switch
 * lacks is in-app navigation without a reload — a filter bar that resets every
 * time you open a project is the kind of thing a full reload costs you. So:
 * pushState plus a notification, and a hook that re-renders on both pushState
 * and the Back button.
 */

import { useSyncExternalStore } from 'react';

/**
 * pushState fires no event of its own — popstate covers only Back and Forward.
 * So navigate() tells the subscribers itself, and this set is how it reaches
 * them.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener('popstate', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('popstate', onChange);
  };
}

function getSnapshot(): string {
  return window.location.pathname;
}

/** Current pathname, re-rendering on pushState/popstate. */
export function usePath(): string {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** pushState + notify. Pass replace for redirects so Back doesn't loop. */
export function navigate(path: string, opts?: { replace?: boolean }): void {
  // Guard against the redirect that lands where it already is: App runs its
  // gating on every render, and a pushState per render would bury the history
  // stack under identical entries.
  if (path === window.location.pathname) return;

  if (opts?.replace) window.history.replaceState(null, '', path);
  else window.history.pushState(null, '', path);

  for (const listener of listeners) listener();
}
