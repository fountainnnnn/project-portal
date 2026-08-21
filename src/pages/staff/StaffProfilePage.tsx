import { useCallback, useEffect, useState } from 'react';
import { WarningCircle } from '@phosphor-icons/react';

import ProfileForm from '@/components/features/staff/ProfileForm';
import { profileGaps } from '@/components/features/staff/profileCompleteness';
import ErrorNote from '@/components/ui/ErrorNote';
import SectionHeader from '@/components/ui/SectionHeader';
import Spinner from '@/components/ui/Spinner';
import { api, ApiError } from '@/src/lib/api';
import { useAuth } from '@/src/lib/auth';
import type { ProfilePatch } from '@/src/lib/types';

/**
 * The lecturer's own record — the half of the portal DSAC reads.
 *
 * This is not account settings. Everything on this form is what an admin sees
 * when a project lands and they go looking for someone to run it, so the page
 * is framed as "how you appear to DSAC" rather than "your details", and it
 * names the gaps outright instead of leaving a lecturer to guess why they are
 * never shortlisted.
 */
export default function StaffProfilePage() {
  const { user, setUser } = useAuth();

  const [schools, setSchools] = useState<string[]>([]);
  const [metaError, setMetaError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);

  // The school list is server-owned; hardcoding the ten schools here would give
  // us a second copy to drift, and the server rejects anything off its list.
  const loadMeta = useCallback(async () => {
    setMetaError('');
    try {
      setSchools((await api.meta()).schools);
    } catch (err) {
      setMetaError(
        err instanceof ApiError ? err.message : 'Could not load the school list.',
      );
    }
  }, []);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const save = async (patch: ProfilePatch) => {
    setSaving(true);
    setSaved(false);
    setSaveError('');
    try {
      // The shell renders this user's name, so the session copy is replaced
      // rather than kept alongside a fresher local one.
      setUser(await api.updateProfile(patch));
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  const gaps = profileGaps(user);

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <SectionHeader
        eyebrow="MY PROFILE"
        title="How DSAC sees you."
        subtitle="This is the only thing an admin reads when deciding who fits a project. The fuller it is, the more often your name comes up."
        align="left"
      />

      {gaps.length > 0 && (
        <div className="dsac-rise flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--muted-wash)] px-5 py-4">
          <WarningCircle size={20} aria-hidden className="text-[var(--ink-2)]" />
          <p className="flex-1 text-[0.875rem] leading-relaxed text-[var(--ink-2)]">
            Still blank: {gaps.join(', ')}.
          </p>
        </div>
      )}

      {metaError && <ErrorNote message={metaError} onRetry={() => void loadMeta()} />}

      <ProfileForm
        user={user}
        schools={schools}
        saving={saving}
        error={saveError}
        saved={saved}
        onSave={(patch) => void save(patch)}
      />
    </div>
  );
}
