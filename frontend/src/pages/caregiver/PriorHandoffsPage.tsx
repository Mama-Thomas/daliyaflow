import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, EmptyState, SkeletonCard } from '@/components/ui';
import { HandoffSummaryBlock } from '@/components/handoff/HandoffSummaryBlock';
import { clientsApi } from '@/api/clients';
import { cn } from '@/utils/cn';

export default function PriorHandoffsPage() {
  const { clientId = '' } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [openId, setOpenId] = useState<string | null>(null);

  const historyQuery = useQuery({
    queryKey: ['client-handoff-history', clientId],
    queryFn: () => clientsApi.handoffHistory(clientId, 50),
  });

  return (
    <div>
      <header className="sticky top-0 z-10 bg-white border-b border-border px-3 py-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="size-10 rounded-full hover:bg-forest-pale text-slate hover:text-forest flex items-center justify-center"
        >
          <ChevronLeft size={18} />
        </button>
        <h1 className="font-display text-lg text-ink">Prior handoffs</h1>
      </header>

      <main className="px-5 py-6 space-y-3">
        {historyQuery.isLoading && (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}
        {!historyQuery.isLoading && (historyQuery.data?.length ?? 0) === 0 && (
          <EmptyState
            title="No prior handoffs for this client"
            description="Submitted handoffs will appear here in time order."
          />
        )}

        <ol className="relative border-l-2 border-border pl-4 space-y-4">
          {(historyQuery.data ?? []).map((h) => {
            const date = new Date(h.created_at);
            const open = openId === h.handoff_id;
            return (
              <li key={h.handoff_id} className="relative">
                <span className="absolute -left-[22px] top-2 size-3 rounded-full bg-forest" />
                <Card className="p-4">
                  <button
                    type="button"
                    className="flex items-center justify-between w-full"
                    onClick={() =>
                      setOpenId(open ? null : h.handoff_id)
                    }
                    aria-expanded={open}
                  >
                    <div className="text-left">
                      <div className="text-sm font-medium text-ink">
                        {date.toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </div>
                      <div className="text-xs text-muted-text">
                        Caregiver: {h.caregiver.first_name}{' '}
                        {h.caregiver.last_initial}
                      </div>
                    </div>
                    <span className={cn('text-slate transition-transform', open && 'rotate-90')}>
                      <ChevronRight size={16} />
                    </span>
                  </button>

                  {open && (
                    <div className="mt-4">
                      <HandoffSummaryBlock summary={h.summary as never} />
                    </div>
                  )}
                  {!open && (
                    <span className="sr-only">
                      <ChevronDown size={14} />
                    </span>
                  )}
                </Card>
              </li>
            );
          })}
        </ol>
      </main>
    </div>
  );
}
