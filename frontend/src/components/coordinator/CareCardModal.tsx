import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  Printer,
  X,
} from 'lucide-react';
import { Button, Card, SkeletonCard } from '@/components/ui';
import { clientsApi } from '@/api/clients';
import { DISPLAY_TIME_ZONE } from '@/utils/format';

export function CareCardModal({
  clientId,
  onClose,
}: {
  clientId: string;
  onClose: () => void;
}) {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['carecard', clientId],
    queryFn: () => clientsApi.carecard(clientId),
    staleTime: 0,
  });

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-label="Shift briefing"
      className="fixed inset-0 z-50 bg-ink/60 flex items-end sm:items-center sm:justify-center print:bg-white"
    >
      <div className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-xl shadow-xl max-h-[90vh] overflow-y-auto print:max-h-none print:shadow-none print:w-full print:rounded-none">
        <header className="flex items-start justify-between gap-3 border-b border-border px-6 py-4 print:border-0">
          <div>
            <h2 className="font-display text-2xl text-ink">Shift briefing</h2>
            {data && (
              <p className="text-xs text-muted-text font-mono mt-1">
                Generated {new Date(data.generated_at).toLocaleString(undefined, { timeZone: DISPLAY_TIME_ZONE })}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="size-8 rounded-full hover:bg-forest-pale text-slate hover:text-forest flex items-center justify-center print:hidden"
          >
            <X size={16} />
          </button>
        </header>

        <div className="px-6 py-6 space-y-5">
          {isLoading || isFetching ? (
            <SkeletonCard />
          ) : isError ? (
            <Card>
              <p className="text-sm text-slate">
                Could not generate the briefing. Try again in a moment.
              </p>
              <Button
                size="sm"
                variant="secondary"
                className="mt-3"
                onClick={() => refetch()}
              >
                Retry
              </Button>
            </Card>
          ) : data ? (
            <>
              <p className="font-display italic text-lg text-forest leading-snug">
                {data.card.welcome_line}
              </p>

              <Section
                icon={<CheckCircle2 size={14} />}
                label="Key things to know"
                items={data.card.key_things_to_know}
                accent="forest"
              />

              <Section
                icon={<AlertTriangle size={14} />}
                label="Watch for"
                items={data.card.watch_for}
                accent="medium"
              />

              <Section
                icon={<Clock size={14} />}
                label="Pending tasks"
                items={data.card.pending_tasks}
                accent="forest"
              />

              {data.card.coordinator_note && (
                <div className="bg-gold-light rounded-md p-4">
                  <div className="text-xs uppercase tracking-[0.05em] text-[var(--color-gold)] mb-1">
                    Coordinator note
                  </div>
                  <p className="text-sm text-ink">{data.card.coordinator_note}</p>
                </div>
              )}

              <p className="text-[10px] text-muted-text text-center pt-4 border-t border-border">
                DaliyaFlow · Generated{' '}
                {new Date(data.generated_at).toLocaleString(undefined, { timeZone: DISPLAY_TIME_ZONE })}
              </p>
            </>
          ) : null}
        </div>

        <footer className="flex flex-wrap gap-2 justify-end border-t border-border px-6 py-3 print:hidden">
          <Button
            variant="ghost"
            leftIcon={<Copy size={14} />}
            onClick={() => {
              navigator.clipboard?.writeText(window.location.href);
            }}
          >
            Copy link
          </Button>
          <Button
            variant="secondary"
            leftIcon={<Printer size={14} />}
            onClick={() => window.print()}
          >
            Print
          </Button>
          <Button onClick={onClose}>Close</Button>
        </footer>
      </div>
    </div>
  );
}

function Section({
  icon,
  label,
  items,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  items: string[];
  accent: 'forest' | 'medium';
}) {
  const dedupedItems = Array.from(
    new Map(
      (items ?? []).map((it) => [it.trim().toLowerCase(), it.trim()]),
    ).values(),
  );

  if (!dedupedItems || dedupedItems.length === 0) return null;
  return (
    <section>
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.05em] text-slate mb-2">
        <span
          className={
            accent === 'forest'
              ? 'text-forest'
              : 'text-[var(--color-risk-medium)]'
          }
        >
          {icon}
        </span>
        {label}
      </div>
      <ul className="space-y-1.5 pl-1">
        {dedupedItems.map((it, i) => (
          <li
            key={i}
            className="flex items-start gap-2 text-sm text-ink leading-relaxed"
          >
            <span
              className={
                accent === 'forest'
                  ? 'text-forest mt-0.5'
                  : 'text-[var(--color-risk-medium)] mt-0.5'
              }
            >
              •
            </span>
            <span className="flex-1">{it}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
