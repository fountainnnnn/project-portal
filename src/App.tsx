import { useEffect } from 'react';
import { Folders, UserCircle, UsersThree } from '@phosphor-icons/react';
import PortalShell, { type NavItem } from '@/components/ui/PortalShell';
import Spinner from '@/components/ui/Spinner';
import { useAuth } from '@/src/lib/auth';
import { navigate, usePath } from '@/src/lib/router';
import type { Role } from '@/src/lib/types';
import LoginPage from './pages/LoginPage';
import AdminProjectsPage from './pages/admin/AdminProjectsPage';
import AdminStaffPage from './pages/admin/AdminStaffPage';
import StaffProfilePage from './pages/staff/StaffProfilePage';
import StaffProjectsPage from './pages/staff/StaffProjectsPage';

/**
 * App — the route table, the role gating, and the shell.
 *
 * The pages are deliberately ignorant of all three. They export a component
 * and decide what to render; whether they render at all, and what frame sits
 * around them, is settled here. That is what lets four people build four pages
 * without agreeing on anything but the props.
 *
 * Client-side gating is a courtesy, not a control. Every route the pages call
 * is enforced server-side by requireUser/requireAdmin; hand-typing /admin/staff
 * as a staff member gets you a redirect here and a 403 there.
 */

const NAV: Record<Role, NavItem[]> = {
  admin: [
    { path: '/admin/projects', label: 'Projects', Icon: Folders },
    { path: '/admin/staff', label: 'Staff', Icon: UsersThree },
  ],
  staff: [
    { path: '/staff/projects', label: 'Projects', Icon: Folders },
    { path: '/staff/profile', label: 'My profile', Icon: UserCircle },
  ],
};

const PAGES: Record<string, () => React.JSX.Element> = {
  '/admin/projects': AdminProjectsPage,
  '/admin/staff': AdminStaffPage,
  '/staff/projects': StaffProjectsPage,
  '/staff/profile': StaffProfilePage,
};

function homeFor(role: Role): string {
  return role === 'admin' ? '/admin/projects' : '/staff/projects';
}

export default function App() {
  const { user, logout } = useAuth();
  const path = usePath();

  // The one path this role is allowed on that it is not already on. Computed
  // during render but applied in an effect, because navigate() sets state in
  // the router store and doing that mid-render is a React warning at best.
  const allowed = user ? NAV[user.role].some(item => item.path === path) : path === '/login';
  const target = user ? homeFor(user.role) : '/login';

  useEffect(() => {
    // Still booting — /api/auth/me has not answered, and redirecting now would
    // bounce a signed-in user to /login and back.
    if (user === undefined) return;
    if (allowed) return;
    // replace, not push: a redirect in the history stack means Back returns to
    // the path we just rejected, which rejects it again, forever.
    navigate(target, { replace: true });
  }, [user, allowed, target]);

  if (user === undefined) {
    // Bare spinner on the plain background. No shell (we don't know the role
    // yet) and no login card (they may well be signed in) — showing either one
    // for 80ms and then swapping it is worse than showing nothing.
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner size={28} />
      </div>
    );
  }

  if (user === null) return <LoginPage />;

  const Page = PAGES[path];
  // The effect above is already navigating to the role home; render nothing
  // for the one frame before it lands rather than flashing the wrong page.
  if (!Page) return null;

  return (
    <PortalShell
      nav={NAV[user.role]}
      activePath={path}
      onNavigate={navigate}
      user={user}
      onLogout={() => void logout()}
    >
      <Page />
    </PortalShell>
  );
}
