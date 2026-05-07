import { useEffect } from 'react';
import { SidebarContent } from './Sidebar';
import { cn } from '@/utils/cn';

interface MobileNavDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function MobileNavDrawer({ open, onClose }: MobileNavDrawerProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div
      aria-hidden={!open}
      className={cn(
        'fixed inset-0 z-40 lg:hidden transition-opacity duration-200',
        open
          ? 'opacity-100 pointer-events-auto'
          : 'opacity-0 pointer-events-none',
      )}
    >
      <button
        type="button"
        aria-label="Close navigation menu"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-ink/50"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={cn(
          'absolute left-0 top-0 bottom-0 w-60 bg-white border-r border-border flex flex-col shadow-xl',
          'transition-transform duration-[250ms] ease-out',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <SidebarContent collapsed={false} onItemClick={onClose} />
      </aside>
    </div>
  );
}
