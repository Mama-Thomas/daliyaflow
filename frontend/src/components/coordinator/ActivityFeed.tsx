import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Badge, Card, EmptyState, SkeletonCard } from '@/components/ui';
import { shiftsApi } from '@/api/shifts';
import { clientsApi } from '@/api/clients';
import { flagsListApi } from '@/api/flags';
import { clientShortName, formatTimeRange, relativeTime } from '@/utils/format';
import { cn } from '@/utils/cn';

type Filter = 'all' | 'flagged' | 'pending' | 'reviewed';

const filters: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'flagged', label: 'Flagged' },
  { id: 'pending', label: 'Pending review' },
  { id: 'reviewed', label: 'Reviewed' },
];

export function ActivityFeed() {
  const [active, setActive] = useState<Filter>('all');

  const shiftsQuery = useQuery({
    queryKey: ['shifts', 'today-completed'],
    queryFn: () => shiftsApi.list({ status: 'completed', limit: 50 }),
    refetchInterval: 60_000,
  });

  const flagsQuery = useQuery({
    queryKey: ['flags', 'today'],
    queryFn: () => flagsListApi.list({ limit: 200 }),
    refetchInterval: 60_000,
  });

  const clientsQuery = useQuery({
    queryKey: ['clients'],
    queryFn: clientsApi.list,
  });

  const clientById = (id: string) =>
    clientsQuery.data?.find((c) => c.id === id);

  const flagsByShift = useMemo(() => {
    const m: Record<
      string,
      { high: number; medium: number; low: number; unreviewed: number }
    > = {};
    for (const f of flagsQuery.data ?? []) {
      const sid = (f as unknown as { shift_id: string }).shift_id;
      const slot =
        m[sid] ??
        (m[sid] = { high: 0, medium: 0, low: 0, unreviewed: 0 });
      slot[f.severity] += 1;
      if (f.status === 'suggested') slot.unreviewed += 1;
    }
    return m;
  }, [flagsQuery.data]);

  const filtered = (shiftsQuery.data ?? []).filter((s) => {
    const counts = flagsByShift[s.id];
    if (active === 'all') return true;
    if (active === 'flagged') return !!counts && counts.high + counts.medium > 0;
    if (active === 'pending') return !!counts && counts.unreviewed > 0;
    if (active === 'reviewed') return !!counts && counts.unreviewed === 0;
    return true;
  });

  return (
    <Card className="!p-0">
      <div className="px-6 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center gap-3">
        <h3 className="font-display text-lg text-ink flex-1">
          Today's submissions
          {shiftsQuery.data && (
            <span className="text-muted-text text-sm ml-2 font-body font-normal">
              ({shiftsQuery.data.length})
            </span>
          )}
        </h3>
        <div className="flex gap-1.5 overflow-x-auto -mx-6 px-6 sm:mx-0 sm:px-0">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setActive(f.id)}
              className={cn(
                'px-3 py-1 text-xs rounded-full border transition-colors min-h-[32px] whitespace-nowrap',
                active === f.id
                  ? 'bg-forest text-white border-forest'
                  : 'bg-white text-slate border-border hover:border-forest hover:text-forest',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 py-4">
        {shiftsQuery.isLoading ? (
          <div className="space-y-3">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No submissions yet today"
            description="Submissions from caregivers will appear here as they come in."
          />
        ) : (
          <ul className="space-y-3">
            {filtered.map((s) => {
              const client = clientById(s.client_id);
              const counts = flagsByShift[s.id];
              const hasHighUnread =
                !!counts && counts.high > 0 && counts.unreviewed > 0;
              return (
                <li
                  key={s.id}
                  className={cn(
                    'bg-white rounded-md border border-border p-4 hover:shadow-md transition-shadow',
                    hasHighUnread && 'border-l-4 border-l-[var(--color-risk-high)]',
                  )}
                >
                  <Link
                    to={`/coordinator/clients/${s.client_id}`}
                    className="block"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-ink truncate">
                          {client
                            ? clientShortName(
                                client.preferred_name || client.first_name,
                                client.last_name,
                              )
                            : 'Client'}
                        </div>
                        <div className="text-xs text-muted-text font-mono mt-0.5">
                          {formatTimeRange(s.scheduled_start, s.scheduled_end)}
                          {' · '}
                          {relativeTime(s.updated_at)}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {counts && counts.high > 0 && (
                          <Badge variant="high">{counts.high} high</Badge>
                        )}
                        {counts && counts.medium > 0 && (
                          <Badge variant="medium">{counts.medium} med</Badge>
                        )}
                        {counts && counts.low > 0 && (
                          <Badge variant="low">{counts.low} low</Badge>
                        )}
                        <Badge
                          variant={
                            counts && counts.unreviewed > 0
                              ? 'pending'
                              : 'resolved'
                          }
                        >
                          {counts && counts.unreviewed > 0
                            ? 'pending review'
                            : 'reviewed'}
                        </Badge>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
