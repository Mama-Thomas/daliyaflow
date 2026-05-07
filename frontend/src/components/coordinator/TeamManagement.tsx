import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, Trash2, UserPlus } from 'lucide-react';
import { Badge, Button, Card, Input } from '@/components/ui';
import { invitationsApi, type InvitableRole, type UserSummary } from '@/api/users';
import { DISPLAY_TIME_ZONE } from '@/utils/format';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';

type FilterValue = 'all' | 'active' | 'pending' | 'inactive';

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'inactive', label: 'Inactive' },
];

export function TeamManagement() {
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === 'admin';
  const isCoordinator = role === 'coordinator';
  const pushToast = useUIStore((s) => s.pushToast);
  const qc = useQueryClient();

  const usersQuery = useQuery({
    queryKey: ['team-users'],
    queryFn: invitationsApi.list,
  });

  const [filter, setFilter] = useState<FilterValue>('all');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [inviteRole, setInviteRole] = useState<InvitableRole>('caregiver');

  const invite = useMutation({
    mutationFn: () =>
      invitationsApi.invite({
        email: email.trim().toLowerCase(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        role: inviteRole,
      }),
    onSuccess: () => {
      pushToast({
        variant: 'success',
        title: `Invitation sent to ${email}`,
      });
      setEmail('');
      setFirstName('');
      setLastName('');
      qc.invalidateQueries({ queryKey: ['team-users'] });
    },
    onError: (err: Error) =>
      pushToast({
        variant: 'error',
        title:
          (err as { message?: string })?.message ??
          'Could not send invitation',
      }),
  });

  const deactivate = useMutation({
    mutationFn: (userId: string) => invitationsApi.deactivate(userId),
    onSuccess: () => {
      pushToast({ variant: 'success', title: 'User deactivated' });
      qc.invalidateQueries({ queryKey: ['team-users'] });
    },
  });

  const updateRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      invitationsApi.updateRole(userId, role),
    onSuccess: () => {
      pushToast({ variant: 'success', title: 'Role updated' });
      qc.invalidateQueries({ queryKey: ['team-users'] });
    },
  });

  const resend = useMutation({
    mutationFn: (id: string) => invitationsApi.resend(id),
    onSuccess: () =>
      pushToast({ variant: 'success', title: 'Invitation resent' }),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => invitationsApi.cancel(id),
    onSuccess: () => {
      pushToast({ variant: 'success', title: 'Invitation cancelled' });
      qc.invalidateQueries({ queryKey: ['team-users'] });
    },
  });

  const users = usersQuery.data ?? [];
  const filtered = users.filter((u) =>
    filter === 'all' ? true : u.status === filter,
  );
  const pending = users.filter((u) => u.is_invitation);

  return (
    <Card>
      <div className="flex items-center gap-2">
        <span style={{ color: 'var(--color-primary)' }}>
          <UserPlus size={16} />
        </span>
        <h2 className="font-display text-lg text-ink">Team</h2>
      </div>

      {/* Invite form */}
      <div
        className="mt-4 rounded-md p-4"
        style={{
          background: 'var(--color-surface-pale, #F7F9FB)',
          border: '1px solid var(--color-border)',
        }}
      >
        <h3 className="text-sm font-semibold text-slate mb-3">
          Invite team member
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="they@organization.com"
          />
          <div>
            <label
              htmlFor="invite-role"
              className="block text-sm font-medium text-slate mb-1"
            >
              Role
            </label>
            <select
              id="invite-role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as InvitableRole)}
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-white"
              disabled={isCoordinator}
            >
              <option value="caregiver">Caregiver</option>
              {isAdmin && <option value="coordinator">Coordinator</option>}
              {isAdmin && <option value="supervisor">Supervisor</option>}
            </select>
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            leftIcon={<Mail size={14} />}
            loading={invite.isPending}
            disabled={
              !email.trim() || !firstName.trim() || !lastName.trim()
            }
            onClick={() => invite.mutate()}
          >
            Send invitation
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-6 flex gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className="px-3 py-1 text-xs rounded-full transition-colors"
            style={{
              border: '1px solid var(--color-border)',
              background:
                filter === f.value
                  ? 'var(--color-primary-pale, #EAF2FB)'
                  : 'transparent',
              color:
                filter === f.value
                  ? 'var(--color-primary)'
                  : 'var(--color-text)',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* User list */}
      <ul className="mt-4 space-y-2">
        {filtered.length === 0 && (
          <li
            className="text-sm py-3"
            style={{ color: 'var(--color-muted-text)' }}
          >
            No team members match this filter.
          </li>
        )}
        {filtered.map((u) => (
          <UserRow
            key={u.id}
            user={u}
            isAdmin={isAdmin}
            onDeactivate={() => deactivate.mutate(u.id)}
            onRoleChange={(role) =>
              updateRole.mutate({ userId: u.id, role })
            }
            onResend={() => resend.mutate(u.id)}
            onCancel={() => cancel.mutate(u.id)}
          />
        ))}
      </ul>

      {/* Pending invitations section */}
      {pending.length > 0 && filter !== 'pending' && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-slate mb-2">
            Pending invitations ({pending.length})
          </h3>
          <ul className="space-y-2">
            {pending.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                isAdmin={isAdmin}
                onDeactivate={() => deactivate.mutate(u.id)}
                onRoleChange={() => undefined}
                onResend={() => resend.mutate(u.id)}
                onCancel={() => cancel.mutate(u.id)}
              />
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function UserRow({
  user,
  isAdmin,
  onDeactivate,
  onRoleChange,
  onResend,
  onCancel,
}: {
  user: UserSummary;
  isAdmin: boolean;
  onDeactivate: () => void;
  onRoleChange: (role: string) => void;
  onResend: () => void;
  onCancel: () => void;
}) {
  const statusVariant =
    user.status === 'active'
      ? 'success'
      : user.status === 'pending'
        ? 'warning'
        : 'neutral';
  return (
    <li
      className="flex items-center justify-between gap-3 px-4 py-3 rounded-md"
      style={{ border: '1px solid var(--color-border)' }}
    >
      <div className="min-w-0 flex-1">
        <div className="font-medium text-ink truncate">
          {user.first_name} {user.last_name}
        </div>
        <div
          className="text-xs truncate"
          style={{ color: 'var(--color-muted-text)' }}
        >
          {user.email}
        </div>
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          <Badge variant="neutral">{user.role}</Badge>
          <Badge variant={statusVariant as never}>{user.status}</Badge>
          <span
            className="text-xs"
            style={{ color: 'var(--color-muted-text)' }}
          >
            {user.is_invitation
              ? 'Pending invite'
              : user.last_login_at
                ? `Last login: ${new Date(user.last_login_at).toLocaleDateString(undefined, { timeZone: DISPLAY_TIME_ZONE })}`
                : 'No recent login'}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {isAdmin && !user.is_invitation && user.status === 'active' && (
          <select
            value={user.role}
            onChange={(e) => onRoleChange(e.target.value)}
            className="text-xs border border-border rounded-md px-2 py-1 bg-white"
          >
            <option value="caregiver">caregiver</option>
            <option value="coordinator">coordinator</option>
            <option value="supervisor">supervisor</option>
            <option value="admin">admin</option>
          </select>
        )}
        {user.is_invitation && (
          <>
            <Button size="sm" variant="ghost" onClick={onResend}>
              Resend
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              <Trash2 size={14} />
            </Button>
          </>
        )}
        {!user.is_invitation && isAdmin && user.status === 'active' && (
          <Button size="sm" variant="ghost" onClick={onDeactivate}>
            Deactivate
          </Button>
        )}
      </div>
    </li>
  );
}
