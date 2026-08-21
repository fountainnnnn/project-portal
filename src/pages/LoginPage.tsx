import { useState } from 'react';
import { ArrowRight } from '@phosphor-icons/react';
import AmbientOrb from '@/components/ui/AmbientOrb';
import Button from '@/components/ui/Button';
import ErrorNote from '@/components/ui/ErrorNote';
import Field from '@/components/ui/Field';
import SectionHeader from '@/components/ui/SectionHeader';
import Spinner from '@/components/ui/Spinner';
import { ApiError } from '@/src/lib/api';
import { useAuth } from '@/src/lib/auth';

/**
 * LoginPage — the only page outside the shell, and the only one with orbs
 * behind it. Inside PortalShell the white card is the stage and gets none.
 *
 * App decides when this renders; the page never redirects on success. It calls
 * login(), AuthProvider updates the user, and App's gating moves everyone to
 * their role home on the next render. Two places choosing where to send people
 * is how you get a redirect loop.
 */

export default function LoginPage() {
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setError('');
    try {
      await login(email.trim(), password);
      // No navigate() here on purpose — see the note at the top of the file.
    } catch (err) {
      // The server answers a bad login with one deliberately vague sentence,
      // the same for an unknown email as for a wrong password. Showing it
      // verbatim is the point: "no such account" would tell an attacker which
      // staff addresses are real.
      setError(err instanceof ApiError ? err.message : 'Could not sign you in. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center px-4 py-12">
      <AmbientOrb />

      <div className="dsac-rise w-full max-w-[26rem]">
        {/* The mark carries the centre's identity here, so the eyebrow no
            longer has to spell it out — it names the app instead. This is the
            one screen with room for the full lockup. */}
        <div className="flex justify-center">
          <img
            src="/sp-dsac-logo.png"
            alt="SP Data Science and Analytics Centre"
            className="mb-7 h-11 w-auto"
          />
        </div>

        <SectionHeader
          eyebrow="PROJECT PORTAL"
          title="Sign in to see what's open."
          subtitle="Projects the Data Science and Analytics Centre is looking for staff on."
          size="lg"
        />

        <form
          onSubmit={onSubmit}
          className="mt-8 flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-6 py-6 shadow-[0_1px_3px_rgba(11,10,12,0.06),0_16px_40px_-24px_rgba(11,10,12,0.24)]"
        >
          <Field label="Email" htmlFor="login-email">
            <input
              id="login-email"
              className="dsac-input"
              type="email"
              name="email"
              autoComplete="username"
              // The first field of the first screen — focus belongs here, and
              // there is nothing above it to steal it from.
              autoFocus
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@sp.edu.sg"
            />
          </Field>

          <Field label="Password" htmlFor="login-password">
            <input
              id="login-password"
              className="dsac-input"
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </Field>

          {error && <ErrorNote message={error} />}

          <Button type="submit" size="lg" disabled={busy} className="mt-1 w-full">
            {busy ? (
              <>
                <Spinner size={16} />
                Signing in…
              </>
            ) : (
              <>
                Sign in
                <ArrowRight size={16} weight="bold" aria-hidden />
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
