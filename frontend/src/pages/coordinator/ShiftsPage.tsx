import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Briefcase, Plus } from 'lucide-react';
import {
  Badge,
  BadgeVariant,
  Button,
  Card,
  EmptyState,
  Input,
  SkeletonCard,
} from '@/components/ui';
import { shiftsApi } from '@/api/shifts';
import { clientsApi } from '@/api/clients';
import { CareCardModal } from '@/components/coordinator/CareCardModal';
import { CreateShiftModal, colorFor } from '@/components/coordinator/CreateShiftModal';
import { useAuthStore } from '@/store/authStore';
import {
  clientShortName,
  formatTimeRange,
  formatYmdAsDate,
  todayISODate,
} from '@/utils/format';
import { useUIStore } from '@/store/uiStore';
import { cn } from '@/utils/cn';

const statusBadge: Record<string, BadgeVariant> = {
  scheduled: 'pending',
  in_progress: 'neutral',
  completed: 'resolved',
  missed: 'high',
  at_risk: 'medium',
  covered: 'resolved',
};

export default function CoordinatorShiftsPage() {
  const qc = useQueryClient();
  const pushToast = useUIStore((s) => s.pushToast);
  const [date, setDate] = useState(todayISODate());
  const [careCardClient, setCareCardClient] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const role = useAuthStore((s) => s.user?.role);
  const canCreate =
    role === 'admin' || role === 'coordinator' || role === 'supervisor';

  const shiftsQuery = useQuery({
    queryKey: ['shifts-by-date', date],
    queryFn: () => shiftsApi.list({ date, limit: 100 }),
  });

  const clientsQuery = useQuery({
    queryKey: ['clients'],
    queryFn: clientsApi.list,
  });

  const atRiskQuery = useQuery({
    queryKey: ['shifts-at-risk'],
    queryFn: () => shiftsApi.list({ status: 'at_risk', limit: 50 }),
    refetchInterval: 60_000,
  });

  const markAtRisk = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      shiftsApi.markAtRisk(id, reason),
    onSuccess: () => {
      pushToast({ variant: 'success', title: 'Shift marked at risk' });
      qc.invalidateQueries({ queryKey: ['shifts-by-date'] });
      qc.invalidateQueries({ queryKey: ['shifts-at-risk'] });
    },
    onError: () =>
      pushToast({ variant: 'error', title: 'Could not update shift' }),
  });

  const updateStatus = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: 'covered' | 'completed' | 'missed';
    }) => shiftsApi.patch(id, { status }),
    onSuccess: () => {
      pushToast({ variant: 'success', title: 'Shift updated' });
      qc.invalidateQueries({ queryKey: ['shifts-by-date'] });
      qc.invalidateQueries({ queryKey: ['shifts-at-risk'] });
    },
  });

  const clientById = (id: string) =>
    clientsQuery.data?.find((c) => c.id === id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-2xl text-ink">Shifts</h1>
        <div className="flex items-end gap-3">
          <Input
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          {canCreate && (
            <Button leftIcon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>
              Create shift
            </Button>
          )}
        </div>
      </div>

      <CreateShiftModal open={createOpen} onClose={() => setCreateOpen(false)} />

      <section>
        <h2 className="font-display text-lg text-ink mb-3">
          Shifts on {formatYmdAsDate(date)}
        </h2>
        {shiftsQuery.isLoading ? (
          <SkeletonCard />
        ) : (shiftsQuery.data?.length ?? 0) === 0 ? (
          <EmptyState
            title="No shifts on this date"
            description="Pick another day or check back later."
          />
        ) : (
          <Card className="!p-0">
            <ul className="divide-y divide-border">
              {(shiftsQuery.data ?? []).map((s) => {
                const c = clientById(s.client_id);
                return (
                  <li
                    key={s.id}
                    className="px-4 sm:px-6 py-4 flex flex-wrap items-center gap-3 justify-between"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-ink truncate flex items-center gap-2">
                        {s.template_name && (
                          <span
                            className="size-2 rounded-full inline-block"
                            style={{ background: colorFor(null) }}
                          />
                        )}
                        {c
                          ? clientShortName(
                              c.preferred_name || c.first_name,
                              c.last_name,
                            )
                          : 'Client'}
                      </div>
                      <div className="text-xs text-muted-text font-mono">
                        {s.template_name ? (
                          <>
                            {s.template_name} ·{' '}
                            {formatTimeRange(
                              s.scheduled_start,
                              s.scheduled_end,
                            )}
                          </>
                        ) : (
                          formatTimeRange(s.scheduled_start, s.scheduled_end)
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                      <Badge variant={statusBadge[s.status] ?? 'neutral'}>
                        {s.status}
                      </Badge>
                      {(s.status === 'scheduled' ||
                        s.status === 'in_progress') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const reason = window.prompt(
                              'Why is this shift at risk?',
                            );
                            if (reason)
                              markAtRisk.mutate({ id: s.id, reason });
                          }}
                        >
                          Mark at risk
                        </Button>
                      )}
                      {s.status === 'at_risk' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            updateStatus.mutate({ id: s.id, status: 'covered' })
                          }
                        >
                          Mark covered
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>

      <section>
        <h2 className="font-display text-lg text-ink mb-3">At-risk board</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KanbanColumn title="At Risk" hint="Need coverage">
            {(atRiskQuery.data ?? [])
              .filter((s) => s.status === 'at_risk')
              .map((s) => {
                const c = clientById(s.client_id);
                return (
                  <KanbanCard
                    key={s.id}
                    title={
                      c
                        ? clientShortName(
                            c.preferred_name || c.first_name,
                            c.last_name,
                          )
                        : 'Client'
                    }
                    when={formatTimeRange(s.scheduled_start, s.scheduled_end)}
                    reason={s.call_out_reason}
                    onCareCard={() => setCareCardClient(s.client_id)}
                    onCovered={() =>
                      updateStatus.mutate({ id: s.id, status: 'covered' })
                    }
                  />
                );
              })}
          </KanbanColumn>
          <KanbanColumn title="Coverage In Progress" hint="Working on it">
            {(() => {
              const inProgress = (shiftsQuery.data ?? []).filter(
                (s) => s.status === 'in_progress',
              );
              if (inProgress.length === 0) {
                return (
                  <p
                    className="text-xs italic px-1"
                    style={{ color: 'var(--color-muted-text)' }}
                  >
                    No shifts in progress
                  </p>
                );
              }
              return inProgress.map((s) => {
                const c = clientById(s.client_id);
                return (
                  <div
                    key={s.id}
                    className="bg-white border border-border rounded-md px-3 py-2"
                  >
                    <div className="text-sm text-ink">
                      {c
                        ? clientShortName(
                            c.preferred_name || c.first_name,
                            c.last_name,
                          )
                        : 'Client'}
                    </div>
                    <div className="text-xs text-muted-text font-mono">
                      {formatTimeRange(s.scheduled_start, s.scheduled_end)}
                    </div>
                  </div>
                );
              });
            })()}
          </KanbanColumn>
          <KanbanColumn title="Resolved" hint="Closed today">
            {(shiftsQuery.data ?? [])
              .filter((s) => s.status === 'covered' || s.status === 'completed')
              .map((s) => {
                const c = clientById(s.client_id);
                return (
                  <div
                    key={s.id}
                    className="bg-white border border-border rounded-md px-3 py-2"
                  >
                    <div className="text-sm text-ink">
                      {c
                        ? clientShortName(
                            c.preferred_name || c.first_name,
                            c.last_name,
                          )
                        : 'Client'}
                    </div>
                    <div className="text-xs text-muted-text font-mono">
                      {formatTimeRange(s.scheduled_start, s.scheduled_end)}
                    </div>
                  </div>
                );
              })}
          </KanbanColumn>
        </div>
      </section>

      {careCardClient && (
        <CareCardModal
          clientId={careCardClient}
          onClose={() => setCareCardClient(null)}
        />
      )}
    </div>
  );
}

function KanbanColumn({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-forest-pale/40 rounded-lg p-3">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-display text-base text-forest">{title}</h3>
        <span className="text-[10px] text-muted-text uppercase tracking-[0.05em]">
          {hint}
        </span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function KanbanCard({
  title,
  when,
  reason,
  onCareCard,
  onCovered,
}: {
  title: string;
  when: string;
  reason: string | null;
  onCareCard: () => void;
  onCovered: () => void;
}) {
  return (
    <div className={cn('bg-white border border-border rounded-md p-3 space-y-2')}>
      <div>
        <div className="text-sm font-medium text-ink">{title}</div>
        <div className="text-xs text-muted-text font-mono">{when}</div>
      </div>
      {reason && <p className="text-xs text-slate line-clamp-2">{reason}</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          leftIcon={<Briefcase size={12} />}
          onClick={onCareCard}
        >
          CareCard
        </Button>
        <Button size="sm" onClick={onCovered}>
          Mark covered
        </Button>
      </div>
    </div>
  );
}
