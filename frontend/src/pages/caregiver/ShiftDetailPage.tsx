import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Info,
  MapPin,
  RefreshCw,
} from 'lucide-react';
import { Badge, Button, Card, EmptyState, SkeletonCard } from '@/components/ui';
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

export default function ShiftDetailPage() {
  const { shiftId = '' } = useParams<{ shiftId: string }>();
  const navigate = useNavigate();
  const [priorOpen, setPriorOpen] = useState(false);
  // Sprint 8: Care Brief is collapsed by default — caregivers expand if they
  // want the AI-generated context for the next visit.
  const [careBriefOpen, setCareBriefOpen] = useState(false);
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);

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

  const priorHandoffsQuery = useQuery({
    queryKey: ['client-handoff-history', shiftQuery.data?.client_id],
    queryFn: () => clientsApi.handoffHistory(shiftQuery.data!.client_id, 5),
    enabled: !!shiftQuery.data?.client_id,
  });

  // Sprint 8: caregiver-accessible Care Brief + recent shift notes.
  const careCardQuery = useQuery({
    queryKey: ['client-carecard', shiftQuery.data?.client_id],
    queryFn: () => clientsApi.carecard(shiftQuery.data!.client_id),
    enabled: !!shiftQuery.data?.client_id && careBriefOpen,
  });

  const shiftBriefQuery = useQuery({
    queryKey: ['client-shift-brief', shiftQuery.data?.client_id],
    queryFn: () => clientsApi.shiftBrief(shiftQuery.data!.client_id),
    enabled: !!shiftQuery.data?.client_id,
  });

  const shift = shiftQuery.data;
  const client = clientQuery.data;
  const handoff = handoffQuery.data;
  const priorHandoffs = priorHandoffsQuery.data ?? [];
  const submitted = handoff?.status === 'complete';
  const canStart =
    shift && (shift.status === 'in_progress' || shift.status === 'completed');

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
        <h1 className="font-display text-lg text-ink">Shift detail</h1>
      </header>

      <main className="px-5 py-6 space-y-6">
        {shiftQuery.isLoading && <SkeletonCard />}
        {shift && client && (
          <>
            <section>
              <div className="flex items-center justify-between gap-2 mb-1">
                <h2 className="font-display text-2xl text-ink">
                  {clientShortName(
                    client.preferred_name || client.first_name,
                    client.last_name,
                  )}
                </h2>
                <Badge variant="neutral">{client.status}</Badge>
              </div>
              <div className="text-sm text-slate font-mono">
                {fullDate(new Date(shift.scheduled_start))} ·{' '}
                {formatTimeRange(shift.scheduled_start, shift.scheduled_end)}
              </div>
              {client.address_neighborhood && (
                <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-text">
                  <MapPin size={12} />
                  <span>{client.address_neighborhood}</span>
                </div>
              )}
            </section>

            {client.care_context_summary && (
              <Card>
                <h3 className="text-xs uppercase tracking-[0.05em] text-muted-text mb-2">
                  Care context
                </h3>
                <p className="text-sm text-ink leading-relaxed">
                  {client.care_context_summary}
                </p>
              </Card>
            )}

            <section>
              <button
                type="button"
                onClick={() => setPriorOpen((v) => !v)}
                className="flex items-center gap-2 w-full text-left bg-white border border-border rounded-lg px-4 py-3 hover:shadow-sm"
                aria-expanded={priorOpen}
              >
                {priorOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <div className="flex-1">
                  <div className="text-sm font-medium text-ink">
                    Prior handoff for this client
                  </div>
                  <div className="text-xs text-muted-text mt-0.5">
                    {priorHandoffs.length === 0
                      ? 'No prior handoff on record'
                      : `${priorHandoffs.length} previous submission${priorHandoffs.length > 1 ? 's' : ''}`}
                  </div>
                </div>
              </button>

              {priorOpen && (
                <div className="mt-3 space-y-3">
                  {priorHandoffs.length === 0 ? (
                    <EmptyState
                      title="No prior handoff on record"
                      description="This is the first visit on file."
                    />
                  ) : (
                    priorHandoffs.slice(0, 1).map((h) => (
                      <HandoffSummaryBlock
                        key={h.handoff_id}
                        summary={h.summary as never}
                      />
                    ))
                  )}
                  {priorHandoffs.length > 1 && (
                    <Link
                      to={`/caregiver/clients/${client.id}/handoffs`}
                      className="text-sm text-forest hover:underline"
                    >
                      See full history →
                    </Link>
                  )}
                </div>
              )}
            </section>

            {/* Sprint 8: AI-generated Care Brief — caregivers can pull a
             *  fresh AI summary of who this client is, what to know, and what
             *  to watch for. Collapsed by default, generated on expand. */}
            <section>
              <button
                type="button"
                onClick={() => setCareBriefOpen((v) => !v)}
                className="flex items-center gap-2 w-full text-left bg-white border border-border rounded-lg px-4 py-3 hover:shadow-sm"
                aria-expanded={careBriefOpen}
              >
                {careBriefOpen ? (
                  <ChevronDown size={16} />
                ) : (
                  <ChevronRight size={16} />
                )}
                <Info size={14} className="text-forest" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-ink">Care brief</div>
                  <div className="text-xs text-muted-text mt-0.5">
                    AI-generated summary for this shift
                  </div>
                </div>
              </button>

              {careBriefOpen && (
                <div className="mt-3 space-y-3">
                  {careCardQuery.isLoading && <SkeletonCard />}
                  {careCardQuery.isError && (
                    <Card>
                      <p className="text-sm text-[var(--color-error)]">
                        Could not load the care brief. Try refreshing.
                      </p>
                    </Card>
                  )}
                  {careCardQuery.data && (
                    <Card>
                      <p className="text-sm text-ink leading-relaxed">
                        {careCardQuery.data.card.welcome_line}
                      </p>
                      {careCardQuery.data.card.key_things_to_know.length > 0 && (
                        <div className="mt-4">
                          <div className="text-xs uppercase tracking-[0.05em] text-muted-text mb-2">
                            Key things to know
                          </div>
                          <ul className="space-y-1.5">
                            {careCardQuery.data.card.key_things_to_know.map(
                              (k, i) => (
                                <li
                                  key={i}
                                  className="text-sm text-slate flex gap-2"
                                >
                                  <span aria-hidden className="text-forest">
                                    •
                                  </span>
                                  <span>{k}</span>
                                </li>
                              ),
                            )}
                          </ul>
                        </div>
                      )}
                      {careCardQuery.data.card.watch_for.length > 0 && (
                        <div className="mt-4">
                          <div className="text-xs uppercase tracking-[0.05em] text-muted-text mb-2">
                            Watch for
                          </div>
                          <ul className="space-y-1.5">
                            {careCardQuery.data.card.watch_for.map((w, i) => (
                              <li
                                key={i}
                                className="text-sm text-slate flex gap-2"
                              >
                                <AlertTriangle
                                  size={12}
                                  className="text-[var(--color-risk-medium)] mt-0.5 flex-shrink-0"
                                />
                                <span>{w}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                        <p className="text-xs italic text-muted-text">
                          Generated by AI — updated with each shift
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          leftIcon={<RefreshCw size={12} />}
                          loading={careCardQuery.isFetching}
                          onClick={() => careCardQuery.refetch()}
                        >
                          Refresh brief
                        </Button>
                      </div>
                    </Card>
                  )}
                </div>
              )}
            </section>

            {/* Sprint 8: recent shift notes from any caregiver — structured
             *  summary only, never the raw note text. Helps the next
             *  caregiver pick up where the last one left off. */}
            <section>
              <h3 className="text-sm font-medium text-ink mb-2">
                Recent notes from other caregivers
              </h3>
              {shiftBriefQuery.isLoading && <SkeletonCard />}
              {shiftBriefQuery.data && (
                <div className="space-y-2">
                  {shiftBriefQuery.data.entries.length === 0 ? (
                    <EmptyState
                      title="No prior notes yet"
                      description="You'll be the first to submit for this client."
                    />
                  ) : (
                    shiftBriefQuery.data.entries.map((e) => {
                      const isOpen = expandedNoteId === e.handoff_id;
                      return (
                        <Card
                          key={e.handoff_id}
                          interactive
                          className="cursor-pointer"
                          onClick={() =>
                            setExpandedNoteId(isOpen ? null : e.handoff_id)
                          }
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 text-xs text-muted-text mb-1 font-mono">
                                <span>
                                  {e.caregiver_first_name}{' '}
                                  {e.caregiver_last_initial}
                                  {e.caregiver_last_initial ? '.' : ''}
                                </span>
                                <span aria-hidden>·</span>
                                <span>{e.shift_date}</span>
                              </div>
                              <p
                                className={
                                  isOpen
                                    ? 'text-sm text-ink leading-relaxed'
                                    : 'text-sm text-ink leading-relaxed line-clamp-2'
                                }
                              >
                                {e.summary_overview ||
                                  '(No summary recorded)'}
                              </p>
                              {isOpen && e.notable_changes && (
                                <div className="mt-2 text-sm text-slate leading-relaxed">
                                  <span className="text-xs uppercase tracking-[0.05em] text-muted-text mr-1">
                                    Notable changes:
                                  </span>
                                  {e.notable_changes}
                                </div>
                              )}
                              {isOpen && e.risk_flags.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {e.risk_flags.map((f, i) => (
                                    <Badge
                                      key={i}
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
                                  ))}
                                </div>
                              )}
                            </div>
                            <ChevronRight
                              size={14}
                              className={
                                'text-muted-text mt-0.5 transition-transform ' +
                                (isOpen ? 'rotate-90' : '')
                              }
                            />
                          </div>
                        </Card>
                      );
                    })
                  )}
                </div>
              )}
              {shiftBriefQuery.data?.entries &&
                shiftBriefQuery.data.entries.length >= 3 && (
                  <Link
                    to={`/caregiver/clients/${client.id}/handoffs`}
                    className="inline-block mt-3 text-sm text-forest hover:underline"
                  >
                    View all notes →
                  </Link>
                )}
            </section>

            <section className="pt-2">
              {submitted ? (
                <Button
                  variant="secondary"
                  fullWidth
                  size="lg"
                  onClick={() =>
                    navigate(`/caregiver/shifts/${shift.id}/handoff`)
                  }
                >
                  View submitted handoff
                </Button>
              ) : (
                <Button
                  fullWidth
                  size="lg"
                  disabled={!canStart}
                  onClick={() =>
                    navigate(`/caregiver/shifts/${shift.id}/submit`)
                  }
                  title={
                    canStart
                      ? undefined
                      : 'Handoff opens once the shift starts.'
                  }
                >
                  {canStart ? 'Start handoff' : 'Handoff opens at shift start'}
                </Button>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
