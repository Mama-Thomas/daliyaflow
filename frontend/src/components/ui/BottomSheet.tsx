import { ReactNode, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface BottomSheetProps {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Mobile-first bottom sheet with focus trap, swipe/tap-overlay dismiss,
 * and Escape-to-close. On sm+ widths it centres as a modal card.
 */
export function BottomSheet({ open, title, onClose, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = (document.activeElement as HTMLElement) ?? null;

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !sheetRef.current) return;
      const focusables = Array.from(
        sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => !el.hasAttribute('aria-hidden'));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    // Move focus into the sheet on open
    window.setTimeout(() => {
      const focusables = sheetRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      focusables?.[0]?.focus();
    }, 0);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previousFocus.current?.focus?.();
    };
  }, [open, onClose]);

  return (
    <div
      aria-hidden={!open}
      className={cn(
        'fixed inset-0 z-50 transition-opacity duration-200',
        open
          ? 'opacity-100 pointer-events-auto'
          : 'opacity-0 pointer-events-none',
      )}
    >
      {/* Overlay */}
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-ink/50"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? 'Dialog'}
        className={cn(
          'absolute left-0 right-0 bottom-0 sm:top-1/2 sm:left-1/2 sm:bottom-auto sm:right-auto',
          'sm:-translate-x-1/2 sm:-translate-y-1/2',
          'bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md',
          'max-h-[90vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]',
          'transition-transform duration-[250ms] ease-out',
          open ? 'translate-y-0 sm:translate-y-[-50%]' : 'translate-y-full sm:translate-y-0',
        )}
      >
        <div className="flex justify-center pt-2 sm:hidden">
          <span aria-hidden className="h-1 w-10 rounded-full bg-border" />
        </div>
        {title !== undefined && (
          <header className="flex items-center justify-between px-5 pt-3 pb-2">
            <h2 className="font-display text-xl text-ink">{title}</h2>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="size-9 rounded-full hover:bg-forest-pale text-slate hover:text-forest flex items-center justify-center"
            >
              <X size={16} />
            </button>
          </header>
        )}
        <div className="px-5 pb-5">{children}</div>
      </div>
    </div>
  );
}
