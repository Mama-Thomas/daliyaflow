import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Users,
  AlertTriangle,
  Calendar,
  Activity,
  Settings,
  Leaf,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { usersApi } from '@/api/users';
import { cn } from '@/utils/cn';

const items = [
  { to: '/coordinator/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/coordinator/clients', label: 'Clients', icon: Users },
  { to: '/coordinator/flags', label: 'Flags', icon: AlertTriangle },
  { to: '/coordinator/shifts', label: 'Shifts', icon: Calendar },
  { to: '/coordinator/continuity', label: 'Continuity', icon: Activity },
  { to: '/coordinator/settings', label: 'Settings', icon: Settings },
];

interface SidebarContentProps {
  collapsed: boolean;
  onCollapseToggle?: () => void;
  onItemClick?: () => void;
}

export function SidebarContent({
  collapsed,
  onCollapseToggle,
  onItemClick,
}: SidebarContentProps) {
  const user = useAuthStore((s) => s.user);

  const agencyQuery = useQuery({
    queryKey: ['my-agency'],
    queryFn: usersApi.getMyAgency,
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
  });
  const orgLabel = agencyQuery.data?.name || 'DaliyaFlow';

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-2 border-b border-border h-16',
          collapsed ? 'justify-center px-0' : 'px-6',
        )}
      >
        <div className="size-8 rounded-md bg-forest text-white flex items-center justify-center shrink-0">
          <Leaf size={16} />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="font-display text-base text-forest leading-tight">
              DaliyaFlow
            </div>
            <div className="text-xs text-slate truncate max-w-[150px]">
              {orgLabel}
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 py-4 px-2 space-y-1">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/coordinator/dashboard'}
            title={collapsed ? label : undefined}
            onClick={onItemClick}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors min-h-[40px]',
                isActive
                  ? 'bg-forest-pale text-forest font-medium'
                  : 'text-slate hover:text-forest hover:bg-forest-pale/60',
                collapsed && 'justify-center px-0',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-forest"
                  />
                )}
                <Icon size={16} />
                {!collapsed && <span>{label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div
        className={cn(
          'border-t border-border p-3 flex items-center gap-3',
          collapsed && 'flex-col gap-2 p-2',
        )}
      >
        <div className="size-9 rounded-full bg-forest-pale text-forest flex items-center justify-center font-medium text-sm shrink-0">
          {(user?.first_name?.[0] ?? 'U') + (user?.last_name?.[0] ?? '')}
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="text-sm text-ink truncate">
              {user?.first_name} {user?.last_name}
            </div>
            <div className="text-xs text-muted-text capitalize">{user?.role}</div>
          </div>
        )}
        {onCollapseToggle && (
          <button
            type="button"
            onClick={onCollapseToggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="size-8 rounded-full text-mist hover:text-forest hover:bg-forest-pale/60 flex items-center justify-center"
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        )}
      </div>
    </>
  );
}

export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggle = useUIStore((s) => s.toggleSidebar);

  return (
    <aside
      className={cn(
        'hidden lg:flex shrink-0 flex-col border-r border-border bg-white transition-[width] duration-200 ease-out',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <SidebarContent collapsed={collapsed} onCollapseToggle={toggle} />
    </aside>
  );
}
