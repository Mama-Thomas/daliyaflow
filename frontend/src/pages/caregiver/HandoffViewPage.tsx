import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Badge, Card, EmptyState, SkeletonCard } from '@/components/ui';
import { HandoffSummaryBlock } from '@/components/handoff/HandoffSummaryBlock';
import { shiftsApi } from '@/api/shifts';
import { clientsApi } from '@/api/clients';
import { handoffApi } from '@/api/handoff';
import {
  clientShortName,
  formatCategory,
  formatTimeRange,
  fullDate,
} from '@/utils/format';

export default function HandoffViewPage() {
  const { shiftId = '' } = useParams<{ shiftId: string }>();
  const navigate = useNavigate();

  const shiftQuery = useQuery({
    queryKey: ['shift', shiftId],
    queryFn: () => shiftsApi.get(shiftId),
  });

  const clientQuery = useQuery({
    queryKey: ['client', shiftQuery.data?.client_id],
    queryFn: () => clientsApi.get(shiftQuery.data!.client_id),
    enabled: !!shiftQuery.data?.client_id,
  });

  const handoffQuery = useQuery({
    queryKey: ['shift-handoff', shiftId],
    queryFn: () => handoffApi.pollStatus(shiftId),
  });

  const shift = shiftQuery.data;
  const client = clientQuery.data;
  const handoff = handoffQuery.data;
  const confirmedFlags = (handoff?.suggested_flags ?? []).filter(
    (f) => f.status === 'confirmed' || f.status === 'escalated' || f.status === 'resolved',
  );

  return (
    <div className="pb-12">
      <header className="sticky top-0 z-10 bg-white border-b border-border px-3 py-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="size-10 rounded-full hover:bg-forest-pale text-slate hover:text-forest flex items-center justify-center"
        >
          <ChevronLeft size={18} />
        </button>
        <h1 className="font-display text-lg text-ink">Submitted handoff</h1>
      </header>

      <main className="px-5 py-6 space-y-6">
        {(shiftQuery.isLoading || handoffQuery.isLoading) && <SkeletonCard />}

        {shift && client && (
          <section>
            <div className="flex items-center justify-between gap-2 mb-1">
              <h2 className="font-display text-2xl text-ink">
                {clientShortName(
                  client.preferred_name || client.first_name,
                  client.last_name,
                )}
              </h2>
              <Badge variant="resolved">Submitted</Badge>
            </div>
            <div className="text-sm text-slate font-mono">
              {fullDate(new Date(shift.scheduled_start))} ·{' '}
              {formatTimeRange(shift.scheduled_start, shift.scheduled_end)}
            </div>
          </section>
        )}

        {handoff?.status === 'complete' && handoff.handoff_summary ? (
          <>
            <HandoffSummaryBlock summary={handoff.handoff_summary} />

            <section>
              <h3 className="text-xs uppercase tracking-[0.05em] text-muted-text mb-2">
                Confirmed risk flags
              </h3>
              {confirmedFlags.length === 0 ? (
                <Card>
                  <p
                    className="text-sm italic"
                    style={{ color: 'var(--color-muted-text)' }}
                  >
                    No confirmed flags for this shift.
                  </p>
                </Card>
              ) : (
                <div className="space-y-2">
                  {confirmedFlags.map((f) => (
                    <Card key={f.id}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <Badge
                          variant={
                            f.severity === 'high'
                              ? 'high'
                              : f.severity === 'medium'
                                ? 'medium'
                                : 'low'
                          }
                        >
                          {formatCategory(f.category)}
                        </Badge>
                        <span className="text-xs text-muted-text capitalize">
                          {f.status}
                        </span>
                      </div>
                      <p className="text-sm text-ink leading-relaxed">
                        {f.extracted_reason}
                      </p>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : (
          !handoffQuery.isLoading && (
            <EmptyState
              title="No submitted handoff yet"
              description="This shift has no finalized handoff on record."
            />
          )
        )}
      </main>
    </div>
  );
}
