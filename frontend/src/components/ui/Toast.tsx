import { useEffect } from 'react';
import { CheckCircle2, AlertTriangle, X, Info } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { cn } from '@/utils/cn';

const ICONS = {
  success: CheckCircle2,
  error: X,
  warning: AlertTriangle,
  info: Info,
} as const;

const STYLES = {
  success:
    'bg-white border-l-4 border-l-[var(--color-success)] text-ink',
  error: 'bg-white border-l-4 border-l-[var(--color-risk-high)] text-ink',
  warning: 'bg-white border-l-4 border-l-[var(--color-warning)] text-ink',
  info: 'bg-white border-l-4 border-l-[var(--color-info)] text-ink',
} as const;

const ICON_COLORS = {
  success: 'text-[var(--color-success)]',
  error: 'text-[var(--color-risk-high)]',
  warning: 'text-[var(--color-warning)]',
  info: 'text-[var(--color-info)]',
} as const;

export function ToastViewport() {
  const toasts = useUIStore((s) => s.toasts);
  const dismissToast = useUIStore((s) => s.dismissToast);

  return (
    <div
      aria-live="polite"
      aria-relevant="additions"
      className="fixed top-4 left-1/2 -translate-x-1/2 sm:left-auto sm:right-4 sm:translate-x-0 z-50 flex flex-col gap-2 w-[min(360px,calc(100vw-2rem))]"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} dismissToast={dismissToast} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  dismissToast,
}: {
  toast: { id: string; variant: keyof typeof STYLES; title: string; message?: string };
  dismissToast: (id: string) => void;
}) {
  const onDismiss = () => dismissToast(toast.id);

  useEffect(() => {
    const id = window.setTimeout(onDismiss, 4000);
    return () => window.clearTimeout(id);
  }, [onDismiss]);

  const Icon = ICONS[toast.variant];
  return (
    <div
      role="status"
      className={cn(
        'rounded-lg shadow-md px-4 py-3 flex items-start gap-3 animate-fade-in-up',
        STYLES[toast.variant],
      )}
    >
      <Icon size={18} className={cn('mt-0.5 shrink-0', ICON_COLORS[toast.variant])} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{toast.title}</div>
        {toast.message && (
          <div className="text-xs text-slate mt-0.5">{toast.message}</div>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        className="text-mist hover:text-ink p-0.5"
        onClick={onDismiss}
      >
        <X size={14} />
      </button>
    </div>
  );
}