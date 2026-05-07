import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, LogOut, Menu } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { authApi } from '@/api/auth';
import { fullDate, relativeTime } from '@/utils/format';
import { cn } from '@/utils/cn';

interface TopBarProps {
  onOpenNav?: () => void;
}

export function TopBar({ onOpenNav }: TopBarProps = {}) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const clear = useAuthStore((s) => s.clear);

  const notifications = useUIStore((s) => s.notifications);
  const markRead = useUIStore((s) => s.markRead);
  const markAllRead = useUIStore((s) => s.markAllRead);
  
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const unread = notifications.filter((n) => !n.read).length;

  const logoutMutation = useMutation({
    mutationFn: async () => {
      if (refreshToken) await authApi.logout(refreshToken);
    },
    onSettled: () => {
      clear();
      navigate('/auth/sign-in', { replace: true });
    },
  });

  return (
    <header className="h-14 border-b border-border bg-white px-4 sm:px-6 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center gap-2 min-w-0">
        {onOpenNav && (
          <button
            type="button"
            onClick={onOpenNav}
            aria-label="Open navigation menu"
            className="lg:hidden -ml-1 size-9 rounded-md text-slate hover:text-forest hover:bg-forest-pale/60 flex items-center justify-center"
          >
            <Menu size={20} />
          </button>
        )}
        <div className="hidden sm:block text-sm text-slate truncate">
          {fullDate()}
        </div>
      </div>

      <div className="flex items-center gap-1.5 relative">
        <button
          type="button"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
          aria-expanded={notifOpen}
          onClick={() => setNotifOpen((v) => !v)}
          className="relative size-9 rounded-full hover:bg-forest-pale text-slate hover:text-forest flex items-center justify-center"
        >
          <Bell size={16} />
          {unread > 0 && (
            <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--color-risk-high)] text-white text-[10px] font-medium flex items-center justify-center">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>

        {notifOpen && (
          <div
            role="dialog"
            aria-label="Notifications"
            className="absolute top-12 right-0 w-80 max-h-96 overflow-auto bg-white border border-border rounded-lg shadow-lg p-2 z-30"
          >
            <div className="flex items-center justify-between px-2 py-1">
              <div className="text-sm font-medium text-ink">Notifications</div>
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-xs text-forest hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <p className="text-sm text-muted-text px-2 py-6 text-center">
                Nothing new — we'll surface alerts here.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {notifications.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => markRead(n.id)}
                      className={cn(
                        'w-full text-left p-2 rounded-md hover:bg-forest-pale/60',
                        !n.read && 'bg-forest-pale/40',
                      )}
                    >
                      <div className="text-sm text-ink">{n.title}</div>
                      <div className="text-xs text-slate">{n.message}</div>
                      <div className="text-[10px] text-muted-text font-mono mt-0.5">
                        {relativeTime(n.created_at)}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-2 text-sm text-slate hover:text-forest px-2 py-1 rounded-md hover:bg-forest-pale/60"
        >
          <span className="truncate max-w-[140px] sm:max-w-none">
            {user?.first_name} {user?.last_name}
          </span>
          <ChevronDown size={14} />
        </button>

        {menuOpen && (
          <div className="absolute top-12 right-0 w-48 bg-white border border-border rounded-lg shadow-lg p-1.5 z-30">
            <button
              type="button"
              onClick={() => logoutMutation.mutate()}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-error)] rounded-md hover:bg-[var(--color-risk-high-pale)]"
            >
              <LogOut size={14} />
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
