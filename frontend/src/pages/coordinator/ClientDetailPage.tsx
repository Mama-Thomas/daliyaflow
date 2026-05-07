import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Briefcase, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  BadgeVariant,
  Button,
  Card,
  EmptyState,
  SkeletonCard,
  Textarea,
} from '@/components/ui';
import { HandoffSummaryBlock } from '@/components/handoff/HandoffSummaryBlock';
import { RiskFlagCard } from '@/components/flags/RiskFlagCard';
import { FlagDetailDrawer } from '@/components/flags/FlagDetailDrawer';
import { CareCardModal } from '@/components/coordinator/CareCardModal';
import { clientsApi } from '@/api/clients';
import { handoffApi, flagsApi } from '@/api/handoff';
import { flagsListApi } from '@/api/flags';
import { coordinatorApi } from '@/api/coordinator';
import { shiftsApi } from '@/api/shifts';
import {
  DISPLAY_TIME_ZONE,
  formatCategory,
  relativeTime,
  formatTimeRange,
} from '@/utils/format';
import { useUIStore } from '@/store/uiStore';
import { cn } from '@/utils/cn';

type Tab = 'handoff' | 'flags' | 'shifts' | 'notes';

export default function ClientDetailPage() {
  const { clientId = '' } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pushToast = useUIStore((s) => s.pushToast);
  const [tab, setTab] = useState<Tab>('handoff');
  const [careCardOpen, setCareCardOpen] = useState(false);
  const [actionDraft, setActionDraft] = useState('');
  const [actionType, setActionType] = useState('coordinator_review');
  const [contextExpanded, setContextExpanded] = useState(false);
  const [drawerFlag, setDrawerFlag] = useState<
    | (null | {
        id: string;
        category: string;
        severity: 'high' | 'medium' | 'low';
        extracted_reason: string;
        status: 'suggested' | 'confirmed' | 'dismissed' | 'escalated' | 'resolved';
        shift_id: string;
        created_at?: string;
      })
  >(null);
  const [drawerScrollToSource, setDrawerScrollToSource] = useState(false);

  const clientQuery = useQuery({
    queryKey: ['client', clientId],
    queryFn: () => clientsApi.get(clientId),
    enabled: !!clientId,
  });

  const handoffsQuery = useQuery({
    queryKey: ['client-handoff-history', clientId],
    queryFn: () => clientsApi.handoffHistory(clientId, 25),
    enabled: !!clientId,
  });

  const latestShiftId = handoffsQuery.data?.[0]?.shift_id;

  const latestStatusQuery = useQuery({
    queryKey: ['shift-handoff', latestShiftId],
    queryFn: () => handoffApi.pollStatus(latestShiftId!),
    enabled: !!latestShiftId,
  });

  const flagsQuery = useQuery({
    queryKey: ['client-flags', clientId, tab],
    queryFn: () => flagsListApi.list({ client_id: clientId, limit: 100 }),
    enabled: !!clientId && (tab === 'flags' || tab === 'handoff'),
  });

  const shiftsQuery = useQuery({
    queryKey: ['client-shifts', clientId],
    queryFn: () => shiftsApi.list({ client_id: clientId, limit: 50 }),
    enabled: !!clientId && tab === 'shifts',
  });

  const actionsQuery = useQuery({
    queryKey: ['client-actions', clientId],
    queryFn: () =>
      coordinatorApi.listActions({
        related_type: 'client',
        related_id: clientId,
      }),
    enabled: !!clientId && (tab === 'notes' || tab === 'handoff'),
  });

  const flagPatch = useMutation({
    mutationFn: (vars: {
      flagId: string;
      action: 'confirmed' | 'dismissed' | 'escalated' | 'resolved';
    }) => flagsApi.patch(vars.flagId, { status: vars.action }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-flags', clientId] });
      pushToast({ variant: 'success', title: 'Flag updated' });
    },
    onError: () =>
      pushToast({ variant: 'error', title: 'Could not update flag' }),
  });

  const logAction = useMutation({
    mutationFn: () =>
      coordinatorApi.createAction({
        related_object_type: 'client',
        related_object_id: clientId,
        action_type: actionType,
        note: actionDraft.trim() || undefined,
      }),
    onSuccess: () => {
      setActionDraft('');
      qc.invalidateQueries({ queryKey: ['client-actions', clientId] });
      pushToast({ variant: 'success', title: 'Action logged' });
    },
    onError: () =>
      pushToast({ variant: 'error', title: 'Could not log action' }),
  });

  const client = clientQuery.data;
  const latestHandoff = latestStatusQuery.data;
  const flags = flagsQuery.data ?? [];

  const latestFlagsByCategory = useMemo(() => {
    const latest = new Map<string, (typeof flags)[number]>();

    for (const flag of flags) {
      const existing = latest.get(flag.category);

      const flagTime = new Date(
        (flag as { created_at?: string }).created_at ?? '',
      ).getTime();
      const existingTime = existing
        ? new Date(
            (existing as { created_at?: string }).created_at ?? '',
          ).getTime()
        : -Infinity;

      if (!existing || flagTime > existingTime) {
        latest.set(flag.category, flag);
      }
    }

    return Array.from(latest.values());
  }, [flags]);

  const handoffSummary =
    latestHandoff?.status === 'complete'
      ? latestHandoff.handoff_summary
      : null;

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => navigate('/coordinator/clients')}
        className="inline-flex items-center gap-1 text-sm text-slate hover:text-forest"
      >
        <ChevronLeft size={14} /> All clients
      </button>

      {clientQuery.isLoading && <SkeletonCard />}
      {client && (
        <>
          <header className="flex flex-wrap gap-4 items-start justify-between">
            <div className="min-w-0">
              <h1 className="font-display text-3xl text-ink">
                {client.preferred_name || client.first_name}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-slate">
                  {client.first_name} {client.last_name}
                </span>
                <Badge variant="neutral">{client.status}</Badge>
              </div>
              {client.care_context_summary && (
                <p
                  className={cn(
                    'text-sm text-slate mt-3 max-w-2xl leading-relaxed',
                    !contextExpanded && 'line-clamp-2',
                  )}
                >
                  {client.care_context_summary}
                </p>
              )}
              {client.care_context_summary && (
                <button
                  type="button"
                  className="text-xs text-forest hover:underline mt-1"
                  onClick={() => setContextExpanded((v) => !v)}
                >
                  {contextExpanded ? 'Show less' : 'Show full context'}
                </button>
              )}
            </div>
            <Button
              variant="secondary"
              leftIcon={<Briefcase size={14} />}
              className="!border-[var(--color-gold)] !text-[var(--color-gold)] hover:!bg-gold-light"
              onClick={() => setCareCardOpen(true)}
            >
              Generate CareCard
            </Button>
          </header>

          <div className="border-b border-border sticky top-14 bg-surface z-10">
            <nav className="flex gap-1 overflow-x-auto" aria-label="Sections">
              {(
                [
                  { id: 'handoff', label: 'Latest handoff' },
                  { id: 'flags', label: 'Flag history' },
                  { id: 'shifts', label: 'Shift timeline' },
                  { id: 'notes', label: 'Notes' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'px-3 py-2 text-sm border-b-2 transition-colors whitespace-nowrap min-h-[40px]',
                    tab === t.id
                      ? 'border-forest text-forest font-medium'
                      : 'border-transparent text-slate hover:text-forest',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </nav>
          </div>

          {tab === 'handoff' && (
            <section className="space-y-4">
              {!handoffSummary ? (
                <EmptyState
                  title="No handoff submitted yet"
                  description="The latest handoff for this client will appear here."
                />
              ) : (
                <HandoffSummaryBlock
                  summary={handoffSummary as never}
                  onViewSourceNote={
                    latestShiftId
                      ? () => {
                          // Open the drawer scoped to a synthetic flag pointer
                          // for the source note section.
                          const firstFlag = latestFlagsByCategory[0];
                          setDrawerFlag(
                            firstFlag
                              ? {
                                  id: firstFlag.id,
                                  category: firstFlag.category,
                                  severity: firstFlag.severity,
                                  extracted_reason:
                                    firstFlag.extracted_reason,
                                  status: firstFlag.status,
                                  shift_id: latestShiftId,
                                  created_at: (
                                    firstFlag as { created_at?: string }
                                  ).created_at,
                                }
                              : {
                                  id: 'source-note',
                                  category: 'source_note',
                                  severity: 'low',
                                  extracted_reason:
                                    'Viewing the original shift note for this handoff.',
                                  status: 'confirmed',
                                  shift_id: latestShiftId,
                                },
                          );
                          setDrawerScrollToSource(true);
                        }
                      : undefined
                  }
                />
              )}

              <h3 className="font-display text-lg text-ink">Risk flags</h3>
              {latestFlagsByCategory.length === 0 ? (
                <Card>
                  <p className="text-sm text-slate">
                    No risk flags on file for this client.
                  </p>
                </Card>
              ) : (
                <div className="space-y-3">
                  {latestFlagsByCategory.map((f) => (
                    <RiskFlagCard
                      key={f.id}
                      category={f.category}
                      severity={f.severity}
                      reason={f.extracted_reason}
                      status={f.status}
                      onClick={
                        latestShiftId
                          ? () => {
                              setDrawerFlag({
                                id: f.id,
                                category: f.category,
                                severity: f.severity,
                                extracted_reason: f.extracted_reason,
                                status: f.status,
                                shift_id: latestShiftId,
                                created_at: (f as { created_at?: string })
                                  .created_at,
                              });
                              setDrawerScrollToSource(false);
                            }
                          : undefined
                      }
                      onConfirm={
                        f.status === 'suggested'
                          ? () =>
                              flagPatch.mutate({
                                flagId: f.id,
                                action: 'confirmed',
                              })
                          : undefined
                      }
                      onDismiss={
                        f.status === 'suggested'
                          ? () =>
                              flagPatch.mutate({
                                flagId: f.id,
                                action: 'dismissed',
                              })
                          : undefined
                      }
                      onEscalate={
                        f.status === 'suggested' || f.status === 'confirmed'
                          ? () =>
                              flagPatch.mutate({
                                flagId: f.id,
                                action: 'escalated',
                              })
                          : undefined
                      }
                    />
                  ))}
                </div>
              )}

              <h3 className="font-display text-lg text-ink mt-2">
                Coordinator action log
              </h3>
              <Card>
                <div className="flex flex-col sm:flex-row gap-2 mb-3">
                  <select
                    value={actionType}
                    onChange={(e) => setActionType(e.target.value)}
                    className="border border-border rounded-md px-3 py-2 text-sm bg-white"
                  >
                    <option value="coordinator_review">Reviewed</option>
                    <option value="follow_up_called">Follow-up call</option>
                    <option value="family_notified">Family notified</option>
                    <option value="supervisor_notified">Supervisor notified</option>
                    <option value="other">Other</option>
                  </select>
                  <Textarea
                    rows={2}
                    value={actionDraft}
                    onChange={(e) => setActionDraft(e.target.value)}
                    placeholder="Optional note..."
                    className="flex-1"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    size="sm"
                    loading={logAction.isPending}
                    onClick={() => logAction.mutate()}
                  >
                    Log action
                  </Button>
                </div>
              </Card>
              <ul className="space-y-2">
                {(actionsQuery.data ?? []).slice(0, 10).map((a) => (
                  <li
                    key={a.id}
                    className="bg-white border border-border rounded-md px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-ink capitalize">
                        {formatCategory(a.action_type)}
                      </span>
                      <span className="text-xs text-muted-text font-mono">
                        {relativeTime(a.created_at)}
                      </span>
                    </div>
                    {a.note && (
                      <p className="text-sm text-slate mt-1">{a.note}</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {tab === 'flags' && <FlagHistoryTab flags={flags} />}

          {tab === 'shifts' && (
            <section>
              {(shiftsQuery.data ?? []).length === 0 ? (
                <EmptyState
                  title="No shifts on file"
                  description="Once shifts are scheduled they show up here."
                />
              ) : (
                <Card className="!p-0">
                  <ul className="divide-y divide-border">
                    {(shiftsQuery.data ?? []).map((s) => (
                      <li
                        key={s.id}
                        className="px-6 py-4 flex flex-wrap items-center justify-between gap-3"
                      >
                        <div>
                          <div className="text-sm font-medium text-ink">
                            {new Date(s.scheduled_start).toLocaleDateString(undefined, { timeZone: DISPLAY_TIME_ZONE })}
                          </div>
                          <div className="text-xs text-muted-text font-mono">
                            {formatTimeRange(s.scheduled_start, s.scheduled_end)}
                          </div>
                        </div>
                        <Badge variant="neutral">{formatCategory(s.status)}</Badge>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </section>
          )}

          {tab === 'notes' && (
            <NotesTab
              actions={actionsQuery.data ?? []}
              draft={actionDraft}
              setDraft={setActionDraft}
              onSubmit={() => logAction.mutate()}
              submitting={logAction.isPending}
            />
          )}
        </>
      )}

      {careCardOpen && (
        <CareCardModal
          clientId={clientId}
          onClose={() => setCareCardOpen(false)}
        />
      )}

      <FlagDetailDrawer
        open={!!drawerFlag}
        flag={drawerFlag}
        onClose={() => {
          setDrawerFlag(null);
          setDrawerScrollToSource(false);
        }}
        scrollToSourceNote={drawerScrollToSource}
        shiftContext={{
          client_name: client
            ? `${client.preferred_name || client.first_name} ${client.last_name}`
            : undefined,
        }}
        onConfirm={
          drawerFlag && drawerFlag.status === 'suggested'
            ? () =>
                flagPatch.mutate({ flagId: drawerFlag.id, action: 'confirmed' })
            : undefined
        }
        onDismiss={
          drawerFlag && drawerFlag.status === 'suggested'
            ? () =>
                flagPatch.mutate({ flagId: drawerFlag.id, action: 'dismissed' })
            : undefined
        }
        onEscalate={
          drawerFlag &&
          (drawerFlag.status === 'suggested' || drawerFlag.status === 'confirmed')
            ? () =>
                flagPatch.mutate({ flagId: drawerFlag.id, action: 'escalated' })
            : undefined
        }
      />
    </div>
  );
}

function FlagHistoryTab({
  flags,
}: {
  flags: Array<{
    id: string;
    category: string;
    severity: 'high' | 'medium' | 'low';
    extracted_reason: string;
    status: string;
    created_at?: string;
  }>;
}) {
  const [filter, setFilter] = useState<string>('all');
  const filtered =
    filter === 'all' ? flags : flags.filter((f) => f.status === filter);

  const severityVariant: Record<string, BadgeVariant> = {
    high: 'high',
    medium: 'medium',
    low: 'low',
  };

  function formatExactTimestamp(createdAt?: string) {
    if (!createdAt) return 'Unknown time';
    const d = new Date(createdAt);
    if (Number.isNaN(d.getTime())) return 'Unknown time';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: DISPLAY_TIME_ZONE,
    }).format(d);
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {['all', 'confirmed', 'dismissed', 'escalated', 'resolved'].map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={cn(
              'px-3 py-1 text-xs rounded-full border transition-colors min-h-[32px] capitalize',
              filter === id
                ? 'bg-forest text-white border-forest'
                : 'bg-white text-slate border-border hover:border-forest hover:text-forest',
            )}
          >
            {id}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          title="No flags in this filter"
          description="Try a different status filter."
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map((f) => (
            <li
              key={f.id}
              className={cn(
                'bg-white border border-border rounded-lg p-4 border-l-4',
                f.severity === 'high' && 'border-l-[var(--color-risk-high)]',
                f.severity === 'medium' && 'border-l-[var(--color-risk-medium)]',
                f.severity === 'low' && 'border-l-[var(--color-risk-low)]',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-ink">
                    {formatCategory(f.category)}
                  </div>
                  <p className="text-sm text-slate mt-1">
                    {f.extracted_reason}
                  </p>
                </div>
                <div className="flex flex-col gap-1 items-end">
                  <Badge variant={severityVariant[f.severity] ?? 'neutral'}>
                    {f.severity}
                  </Badge>
                  <Badge
                    variant={
                      f.status === 'confirmed'
                        ? 'resolved'
                        : f.status === 'escalated'
                          ? 'high'
                          : 'neutral'
                    }
                  >
                    {f.status}
                  </Badge>
                  <div className="text-right mt-1">
                    <div className="text-[11px] font-mono text-muted-text">
                      {relativeTime(f.created_at ?? '')}
                    </div>
                    <div className="text-[11px] text-slate">
                      {formatExactTimestamp(f.created_at)}
                    </div>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NotesTab({
  actions,
  draft,
  setDraft,
  onSubmit,
  submitting,
}: {
  actions: Array<{
    id: string;
    action_type: string;
    note: string | null;
    created_at: string;
  }>;
  draft: string;
  setDraft: (s: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  return (
    <section className="space-y-4">
      <Card>
        <Textarea
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a coordinator note about this client..."
        />
        <div className="mt-3 flex justify-end">
          <Button size="sm" loading={submitting} onClick={onSubmit}>
            Add note
          </Button>
        </div>
      </Card>
      {actions.length === 0 ? (
        <EmptyState
          title="No notes yet"
          description="Add coordinator notes to keep the team aligned on this client."
        />
      ) : (
        <ul className="space-y-2">
          {actions.map((a) => (
            <li
              key={a.id}
              className="bg-white border border-border rounded-md px-4 py-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink capitalize">
                  {formatCategory(a.action_type)}
                </span>
                <span className="text-xs text-muted-text font-mono">
                  {relativeTime(a.created_at)}
                </span>
              </div>
              {a.note && <p className="text-sm text-slate mt-1">{a.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
