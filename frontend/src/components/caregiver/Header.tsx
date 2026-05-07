import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Bell, LogOut, UserCircle } from 'lucide-react';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/utils/cn';

export function CaregiverHeader({
  title,
  subtitle,
  unreadCount,
  className,
}: {
  title: string;
  subtitle?: string;
  unreadCount?: number;
  className?: string;
}) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const clear = useAuthStore((s) => s.clear);

  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

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

  const initials =
    ((user?.first_name?.[0] ?? '') + (user?.last_name?.[0] ?? '')).toUpperCase() ||
    'U';

  return (
    <header
      className={cn(
        'sticky top-0 z-10 bg-white border-b border-border px-5 py-4 flex items-center justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="font-display text-lg text-ink truncate">{title}</h1>
        {subtitle && (
          <p className="text-sm text-slate font-display">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Link
          to="/caregiver/alerts"
          aria-label={`Alerts${unreadCount ? `, ${unreadCount} unread` : ''}`}
          className="relative size-10 rounded-full hover:bg-forest-pale text-slate hover:text-forest flex items-center justify-center"
        >
          <Bell size={18} />
          {unreadCount && unreadCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[18px] h-[18px] rounded-full bg-[var(--color-risk-high)] text-white text-[10px] font-medium flex items-center justify-center px-1">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-label="Account menu"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="size-10 rounded-full text-white flex items-center justify-center font-medium text-sm focus-visible:outline-none focus-visible:ring-2"
            style={{
              background: 'var(--color-primary)',
            }}
          >
            {initials}
          </button>
          {open && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-44 bg-white py-1"
              style={{
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-md)',
                border: '1px solid var(--color-border)',
              }}
            >
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate('/caregiver/profile');
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-forest-pale text-left"
              >
                <UserCircle size={16} />
                My Profile
              </button>
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  setOpen(false);
                  logout.mutate();
                }}
                disabled={logout.isPending}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-error)] hover:bg-[var(--color-risk-high-pale)] text-left"
              >
                <LogOut size={16} />
                {logout.isPending ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
