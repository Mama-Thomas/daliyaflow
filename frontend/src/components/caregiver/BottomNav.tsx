import { NavLink } from 'react-router-dom';
import { Home, ClipboardList, Plus, Bell, User } from 'lucide-react';
import { cn } from '@/utils/cn';

const items = [
  { to: '/caregiver/home', label: 'Home', icon: Home },
  { to: '/caregiver/shifts', label: 'Shifts', icon: ClipboardList },
  // Submit is rendered separately below
  { to: '/caregiver/alerts', label: 'Alerts', icon: Bell },
  { to: '/caregiver/profile', label: 'Profile', icon: User },
];

export function BottomNav() {
  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] sm:max-w-2xl bg-white border-t border-border z-30 pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <div className="grid grid-cols-5 items-end h-16">
        {items.slice(0, 2).map(({ to, label, icon: Icon }) => (
          <NavTab key={to} to={to} label={label} Icon={Icon} />
        ))}

        <div className="flex justify-center -mt-6">
          <NavLink
            to="/caregiver/submit"
            aria-label="Submit handoff"
            className={({ isActive }) =>
              cn(
                'size-14 rounded-full flex items-center justify-center text-white shadow-md transition-transform active:scale-95',
                isActive ? 'bg-forest-light' : 'bg-forest hover:bg-forest-light',
              )
            }
          >
            <Plus size={24} />
          </NavLink>
        </div>

        {items.slice(2).map(({ to, label, icon: Icon }) => (
          <NavTab key={to} to={to} label={label} Icon={Icon} />
        ))}
      </div>
    </nav>
  );
}

function NavTab({
  to,
  label,
  Icon,
}: {
  to: string;
  label: string;
  Icon: React.ComponentType<{ size?: number | string }>;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition-colors min-h-[44px]',
          isActive ? 'text-forest' : 'text-muted-text hover:text-forest',
        )
      }
    >
      <Icon size={18} />
      <span>{label}</span>
    </NavLink>
  );
}
