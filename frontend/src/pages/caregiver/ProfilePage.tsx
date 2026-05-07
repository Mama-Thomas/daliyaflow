import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, LogOut, Shield, User } from 'lucide-react';
import { CaregiverHeader } from '@/components/caregiver/Header';
import {
  Badge,
  Button,
  Card,
  Input,
  SkeletonCard,
} from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/api/auth';
import { usersApi } from '@/api/users';
import { useUIStore, NotificationPreferences } from '@/store/uiStore';
import { relativeTime } from '@/utils/format';

export default function CaregiverProfilePage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const setSession = useAuthStore((s) => s.setSession);
  const clear = useAuthStore((s) => s.clear);
  const pushToast = useUIStore((s) => s.pushToast);
  const qc = useQueryClient();

  const [firstName, setFirstName] = useState(user?.first_name ?? '');
  const [lastName, setLastName] = useState(user?.last_name ?? '');

  useEffect(() => {
    if (user) {
      setFirstName(user.first_name);
      setLastName(user.last_name);
    }
  }, [user]);

  const sessionsQuery = useQuery({
    queryKey: ['auth-sessions'],
    queryFn: usersApi.listSessions,
  });

  const updateProfile = useMutation({
    mutationFn: () =>
      usersApi.updateMe({ first_name: firstName, last_name: lastName }),
    onSuccess: () => {
      if (user && accessToken && refreshToken) {
        setSession({
          accessToken,
          refreshToken,
          user: {
            ...user,
            first_name: firstName,
            last_name: lastName,
          } as never,
        });
      }
      pushToast({ variant: 'success', title: 'Profile updated' });
    },
    onError: () =>
      pushToast({ variant: 'error', title: 'Could not update profile' }),
  });

  const revokeOne = useMutation({
    mutationFn: (id: string) => usersApi.revokeSession(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth-sessions'] });
      pushToast({ variant: 'success', title: 'Session revoked' });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      if (refreshToken) await authApi.logout(refreshToken);
    },
    onSettled: () => {
      clear();
      navigate('/auth/sign-in', { replace: true });
    },
  });

  const initials =
    (user?.first_name?.[0] ?? '') + (user?.last_name?.[0] ?? '');

  return (
    <div>
      <CaregiverHeader title="Profile" />

      <main className="px-5 py-6 space-y-6">
        <section className="flex items-center gap-4">
          <div className="size-16 rounded-full bg-forest text-white flex items-center justify-center font-display text-2xl">
            {initials.toUpperCase() || 'U'}
          </div>
          <div className="min-w-0">
            <div className="font-display text-xl text-ink">
              {user?.first_name} {user?.last_name}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="neutral">{user?.role ?? '—'}</Badge>
            </div>
            <div className="text-xs text-muted-text mt-1 truncate">
              {user?.email}
            </div>
          </div>
        </section>

        {/* Profile edit */}
        <Card>
          <SectionHeader icon={<User size={16} />} title="Profile" />
          <div className="grid grid-cols-1 gap-3 mt-3">
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
            <Input
              label="Email"
              value={user?.email ?? ''}
              readOnly
              helperText="Contact support to change email"
            />
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              size="sm"
              loading={updateProfile.isPending}
              onClick={() => updateProfile.mutate()}
            >
              Save changes
            </Button>
          </div>
        </Card>

        {/* Notifications */}
        <Card>
          <SectionHeader icon={<Bell size={16} />} title="Notifications" />
          <div className="mt-3 space-y-2">
            <NotificationToggle
              id="high_severity_alerts"
              label="High severity alerts"
              description="Get notified for high severity flags on your shifts"
            />
            <NotificationToggle
              id="shift_at_risk_alerts"
              label="Shift at-risk alerts"
              description="Get notified if a shift is marked at risk"
            />
            <NotificationToggle
              id="escalation_alerts"
              label="Escalations"
              description="Get notified about escalations involving you"
            />
          </div>
        </Card>

        {/* Security */}
        <Card>
          <SectionHeader icon={<Shield size={16} />} title="Active sessions" />
          {sessionsQuery.isLoading && <SkeletonCard />}
          {sessionsQuery.data && sessionsQuery.data.length === 0 && (
            <p className="text-sm text-muted-text mt-3">
              No active sessions on file.
            </p>
          )}
          <ul className="mt-3 space-y-2">
            {(sessionsQuery.data ?? []).map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 px-3 py-2 border border-border rounded-md"
              >
                <div className="min-w-0">
                  <div className="text-sm text-ink truncate">
                    {s.device_info?.user_agent ?? 'Unknown device'}
                  </div>
                  <div className="text-xs text-muted-text font-mono">
                    {relativeTime(s.created_at)}
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
        </Card>

        <section>
          <Button
            variant="ghost"
            fullWidth
            leftIcon={<LogOut size={16} />}
            className="text-[var(--color-error)] hover:bg-[var(--color-risk-high-pale)]"
            loading={logoutMutation.isPending}
            onClick={() => logoutMutation.mutate()}
          >
            Sign out
          </Button>
        </section>
      </main>
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
    <div className="flex items-start justify-between gap-3 py-2">
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
