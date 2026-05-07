import { NavLink, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Home,
  ClipboardList,
  Plus,
  Bell,
  User,
  Leaf,
  LogOut,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { usersApi } from '@/api/users';
import { authApi } from '@/api/auth';
import { cn } from '@/utils/cn';

const items = [
  { to: '/caregiver/home', label: 'Home', icon: Home },
  { to: '/caregiver/shifts', label: 'My Shifts', icon: ClipboardList },
  { to: '/caregiver/submit', label: 'Submit Note', icon: Plus, primary: true },
  { to: '/caregiver/alerts', label: 'Alerts', icon: Bell },
  { to: '/caregiver/profile', label: 'Profile', icon: User },
];

export function CaregiverSidebar() {
  const user = useAuthStore((s) => s.user);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();

  const agencyQuery = useQuery({
    queryKey: ['my-agency'],
    queryFn: usersApi.getMyAgency,
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
  });
  const orgLabel = agencyQuery.data?.name || 'DaliyaFlow';

  const logout = useMutation({
    mutationFn: async () => {
      if (refreshToken) {
        try {
          await authApi.logout(refreshToken);
        } catch {
          /* ignore — local sign out below still happens */
        }
      }
    },
    onSettled: () => {
      clear();
      navigate('/auth/sign-in', { replace: true });
    },
  });

  return (
    <aside className="hidden lg:flex shrink-0 flex-col border-r border-border bg-white w-60 sticky top-0 h-screen">
      <div className="flex items-center gap-2 border-b border-border h-16 px-6">
        <div className="size-8 rounded-md bg-forest text-white flex items-center justify-center shrink-0">
          <Leaf size={16} />
        </div>
        <div className="min-w-0">
          <div className="font-display text-base text-forest leading-tight">
            DaliyaFlow
          </div>
          <div className="text-xs text-slate truncate max-w-[150px]">
            {orgLabel}
          </div>
        </div>
      </div>

      <nav className="flex-1 py-4 px-2 space-y-1">
        {items.map(({ to, label, icon: Icon, primary }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/caregiver/home'}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors min-h-[40px]',
                primary
                  ? isActive
                    ? 'bg-forest text-white font-medium'
                    : 'bg-forest text-white font-medium hover:bg-forest-light'
                  : isActive
                    ? 'bg-forest-pale text-forest font-medium'
                    : 'text-slate hover:text-forest hover:bg-forest-pale/60',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && !primary && (
                  <span
                    aria-hidden
                    className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-forest"
                  />
                )}
                <Icon size={16} />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-border p-3 flex items-center gap-3">
        <div className="size-9 rounded-full bg-forest-pale text-forest flex items-center justify-center font-medium text-sm shrink-0">
          {(user?.first_name?.[0] ?? 'U') + (user?.last_name?.[0] ?? '')}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-ink truncate">
            {user?.first_name} {user?.last_name}
          </div>
          <div className="text-xs text-muted-text capitalize">
            {user?.role}
          </div>
        </div>
        <button
          type="button"
          aria-label="Sign out"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
          className="size-8 rounded-full text-mist hover:text-forest hover:bg-forest-pale/60 flex items-center justify-center"
        >
          <LogOut size={14} />
        </button>
      </div>
    </aside>
  );
}
