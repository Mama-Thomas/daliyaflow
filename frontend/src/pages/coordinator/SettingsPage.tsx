import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Database, LogOut, Shield, User } from 'lucide-react';
import { Badge, Button, Card, Input, SkeletonCard } from '@/components/ui';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { TeamManagement } from '@/components/coordinator/TeamManagement';
import { usersApi } from '@/api/users';
import { useAuthStore } from '@/store/authStore';
import { useUIStore, NotificationPreferences } from '@/store/uiStore';
import { authApi } from '@/api/auth';
import { useNavigate } from 'react-router-dom';
import { DISPLAY_TIME_ZONE, relativeTime } from '@/utils/format';

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);
  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const clear = useAuthStore((s) => s.clear);
  const pushToast = useUIStore((s) => s.pushToast);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [firstName, setFirstName] = useState(user?.first_name ?? '');
  const [lastName, setLastName] = useState(user?.last_name ?? '');
  const [agencyName, setAgencyName] = useState('');
  const [agencyTimezone, setAgencyTimezone] = useState('America/Los_Angeles');
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);

  const isAdmin = user?.role === 'admin';

  const sessionsQuery = useQuery({
    queryKey: ['auth-sessions'],
    queryFn: usersApi.listSessions,
  });

  // Try to identify the current refresh token in the list using sha256.
  // We can't do that in the browser without exposing the hash logic, so the
  // list is shown without an explicit "this device" marker for now — the
  // sign out button labels the active device implicitly.
  // (Backend marks is_current=false for everything since the GET endpoint
  // doesn't see the token used to authenticate the request.)

  useEffect(() => {
    if (user) {
      setFirstName(user.first_name);
      setLastName(user.last_name);
    }
  }, [user]);

  const updateProfile = useMutation({
    mutationFn: () =>
      usersApi.updateMe({
        first_name: firstName,
        last_name: lastName,
      }),
    onSuccess: (data) => {
      if (user && accessToken && refreshToken) {
        setSession({
          accessToken,
          refreshToken,
          user: { ...user, first_name: firstName, last_name: lastName } as never,
        });
      }
      pushToast({ variant: 'success', title: 'Profile updated' });
      void data;
    },
    onError: () =>
      pushToast({ variant: 'error', title: 'Could not update profile' }),
  });

  const updateAgency = useMutation({
    mutationFn: () =>
      usersApi.updateAgency(user!.agency_id, {
        name: agencyName || undefined,
        timezone: agencyTimezone,
      }),
    onSuccess: () => pushToast({ variant: 'success', title: 'Organization updated' }),
    onError: () =>
      pushToast({ variant: 'error', title: 'Could not update organization' }),
  });

  const revokeOne = useMutation({
    mutationFn: (id: string) => usersApi.revokeSession(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth-sessions'] });
      pushToast({ variant: 'success', title: 'Session revoked' });
    },
    onError: () =>
      pushToast({ variant: 'error', title: 'Could not revoke session' }),
  });

  const revokeAll = useMutation({
    mutationFn: () => usersApi.revokeAllSessions(),
    onSuccess: () => {
      pushToast({
        variant: 'success',
        title: 'Signed out of all devices',
      });
      // Active session is also revoked. Force re-login.
      void (async () => {
        if (refreshToken) {
          try {
            await authApi.logout(refreshToken);
          } catch {
            // ignore
          }
        }
        clear();
        navigate('/auth/sign-in', { replace: true });
      })();
    },
    onError: () =>
      pushToast({ variant: 'error', title: 'Could not sign out everywhere' }),
  });

  return (
    <div className="space-y-8 max-w-3xl">
      <header>
        <h1 className="font-display text-3xl text-ink">Settings</h1>
        <p className="text-sm text-muted-text mt-1">
          Manage your profile, notifications, and security.
        </p>
      </header>

      {/* Profile */}
      <Card>
        <SectionHeader icon={<User size={16} />} title="Profile" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <div className="flex items-center gap-3 sm:col-span-2">
            <div className="size-12 rounded-full bg-forest text-white flex items-center justify-center font-display text-lg">
              {(firstName[0] ?? 'U').toUpperCase()}
              {(lastName[0] ?? '').toUpperCase()}
            </div>
            <div>
              <div className="font-medium text-ink">
                {firstName} {lastName}
              </div>
              <Badge variant="neutral">{user?.role}</Badge>
            </div>
          </div>
          <Input
            label="First name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
          <Input
            label="Last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
          <div className="sm:col-span-2">
            <Input
              label="Email"
              value={user?.email ?? ''}
              readOnly
              helperText="Contact support to change email"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            loading={updateProfile.isPending}
            onClick={() => updateProfile.mutate()}
          >
            Save changes
          </Button>
        </div>
      </Card>

      {/* Agency (admin only) */}
      {isAdmin && (
        <Card>
          <SectionHeader icon={<Database size={16} />} title="Organization settings" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <Input
              label="Organization name"
              value={agencyName}
              onChange={(e) => setAgencyName(e.target.value)}
              placeholder="Sunrise Home Care"
            />
            <div>
              <label
                htmlFor="agency-timezone"
                className="block text-sm font-medium text-slate mb-1"
              >
                Timezone
              </label>
              <select
                id="agency-timezone"
                value={agencyTimezone}
                onChange={(e) => setAgencyTimezone(e.target.value)}
                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-white"
              >
                <option value="America/Los_Angeles">Pacific (Los Angeles)</option>
                <option value="America/Denver">Mountain (Denver)</option>
                <option value="America/Chicago">Central (Chicago)</option>
                <option value="America/New_York">Eastern (New York)</option>
                <option value="America/Anchorage">Alaska (Anchorage)</option>
                <option value="Pacific/Honolulu">Hawaii (Honolulu)</option>
              </select>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              loading={updateAgency.isPending}
              onClick={() => updateAgency.mutate()}
            >
              Save
            </Button>
          </div>
        </Card>
      )}

      {/* Team management */}
      <TeamManagement />

      {/* Notifications */}
      <Card>
        <SectionHeader icon={<Bell size={16} />} title="Notifications" />
        <div className="mt-4 space-y-3">
          <NotificationToggle
            id="morning_digest"
            label="Morning brief email"
            description="A 6:30am summary of yesterday's shifts and today's outlook"
          />
          <NotificationToggle
            id="high_severity_alerts"
            label="High severity flag alerts"
            description="Get notified when a high severity flag is submitted"
          />
          <NotificationToggle
            id="shift_at_risk_alerts"
            label="Shift at-risk alerts"
            description="Get notified when a shift is marked at risk"
          />
          <NotificationToggle
            id="escalation_alerts"
            label="Escalation notifications"
            description="Get notified when a flag is escalated to you"
          />
        </div>
      </Card>

      {/* Security */}
      <Card>
        <SectionHeader icon={<Shield size={16} />} title="Security" />
        <h3 className="text-sm font-semibold text-slate mt-4 mb-2">
          Active sessions
        </h3>
        {sessionsQuery.isLoading && <SkeletonCard />}
        {sessionsQuery.data && sessionsQuery.data.length === 0 && (
          <p className="text-sm text-muted-text">No active sessions on file.</p>
        )}
        <ul className="space-y-2">
          {(sessionsQuery.data ?? []).map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 px-4 py-3 border border-border rounded-md"
            >
              <div className="min-w-0">
                <div className="text-sm text-ink truncate">
                  {s.device_info?.user_agent ?? 'Unknown device'}
                </div>
                <div className="text-xs text-muted-text font-mono">
                  Last seen {relativeTime(s.created_at)} · expires{' '}
                  {new Date(s.expires_at).toLocaleDateString(undefined, { timeZone: DISPLAY_TIME_ZONE })}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => revokeOne.mutate(s.id)}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>

        <div className="mt-5 pt-5 border-t border-border">
          <Button
            variant="ghost"
            leftIcon={<LogOut size={14} />}
            className="text-[var(--color-error)] hover:bg-[var(--color-risk-high-pale)]"
            onClick={() => setConfirmRevokeAll(true)}
          >
            Sign out of all devices
          </Button>
        </div>
      </Card>

      {/* Danger zone (admin) */}
      {isAdmin && (
        <Card
          className="!border-[var(--color-error-border)]"
          style={{ borderWidth: 1 }}
        >
          <h2
            className="font-display text-lg"
            style={{ color: 'var(--color-risk-high)' }}
          >
            Danger zone
          </h2>
          <p className="text-sm text-slate mt-1 mb-4">
            Irreversible actions for this organization.
          </p>
          <Button
            variant="ghost"
            className="text-[var(--color-risk-high)] hover:bg-[var(--color-risk-high-pale)]"
            onClick={() =>
              pushToast({ variant: 'info', title: 'Coming soon' })
            }
          >
            Export organization data
          </Button>
        </Card>
      )}

      <BottomSheet
        open={confirmRevokeAll}
        title="Sign out of all devices?"
        onClose={() => setConfirmRevokeAll(false)}
      >
        <p className="text-sm text-slate mb-4">
          You will be signed out everywhere, including this device. You will
          need to sign in again.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmRevokeAll(false)}>
            Cancel
          </Button>
          <Button
            className="bg-[var(--color-risk-high)] hover:bg-[var(--color-risk-high)] text-white"
            loading={revokeAll.isPending}
            onClick={() => {
              setConfirmRevokeAll(false);
              revokeAll.mutate();
            }}
          >
            Sign out everywhere
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-forest">{icon}</span>
      <h2 className="font-display text-lg text-ink">{title}</h2>
    </div>
  );
}

function NotificationToggle({
  id,
  label,
  description,
}: {
  id: keyof NotificationPreferences;
  label: string;
  description: string;
}) {
  const value = useUIStore((s) => s.notificationPrefs[id]);
  const setNotificationPref = useUIStore((s) => s.setNotificationPref);
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <div className="text-sm font-medium text-ink">{label}</div>
        <div className="text-xs text-muted-text">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => setNotificationPref(id, !value)}
        className={
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ' +
          (value ? 'bg-forest' : 'bg-border')
        }
      >
        <span
          className={
            'inline-block size-5 rounded-full bg-white shadow transform transition-transform ' +
            (value ? 'translate-x-5' : 'translate-x-0.5')
          }
        />
      </button>
    </div>
  );
}
