import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, ArrowRight } from 'lucide-react';
import { Badge, Card, EmptyState, SkeletonCard } from '@/components/ui';
import { dashboardApi, PriorityItem } from '@/api/dashboard';
import { formatCategory, relativeTime } from '@/utils/format';

function severityDot(severity: 'high' | 'medium' | 'low') {
  const map = {
    high: 'bg-[var(--color-risk-high)]',
    medium: 'bg-[var(--color-risk-medium)]',
    low: 'bg-[var(--color-risk-low)]',
  };
  return map[severity];
}

function FlagItem({ item }: { item: Extract<PriorityItem, { type: 'flag' }> }) {
  return (
    <li className="flex items-start gap-3 py-3 border-b border-border last:border-b-0">
      <span
        className={`mt-1.5 size-2 rounded-full shrink-0 ${severityDot(item.severity)}`}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm text-ink truncate">
            {formatCategory(item.category)}
          </span>
          <Badge variant={item.severity}>{item.severity}</Badge>
        </div>
        <p className="text-sm text-slate line-clamp-2">{item.extracted_reason}</p>
        <p className="text-[11px] text-muted-text font-mono mt-1">
          {relativeTime(item.created_at)}
        </p>
      </div>
      <Link
        to={`/coordinator/clients/${item.client_id}`}
        className="text-xs text-forest hover:underline inline-flex items-center gap-1 shrink-0"
      >
        Review <ArrowRight size={12} />
      </Link>
    </li>
  );
}

function ShiftItem({
  item,
}: {
  item: Extract<PriorityItem, { type: 'shift_at_risk' }>;
}) {
  const start = new Date(item.scheduled_start).toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
  return (
    <li className="flex items-start gap-3 py-3 border-b border-border last:border-b-0">
      <span className="mt-1 size-7 rounded-md bg-gold-light text-[var(--color-gold)] flex items-center justify-center shrink-0">
        <CalendarClock size={14} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink">Shift at risk</span>
          <Badge variant="pending">cover needed</Badge>
        </div>
        <p className="text-xs text-slate font-mono">{start}</p>
        {item.call_out_reason && (
          <p className="text-sm text-slate line-clamp-1 mt-0.5">
            {item.call_out_reason}
          </p>
        )}
      </div>
      <Link
        to={`/coordinator/shifts`}
        className="text-xs text-forest hover:underline inline-flex items-center gap-1 shrink-0"
      >
        Assign <ArrowRight size={12} />
      </Link>
    </li>
  );
}

export function PriorityQueue() {
  const queueQuery = useQuery({
    queryKey: ['dashboard-priority-queue'],
    queryFn: dashboardApi.priorityQueue,
    refetchInterval: 60_000,
  });

  if (queueQuery.isLoading) return <SkeletonCard />;
  if (queueQuery.isError || !queueQuery.data) {
    return (
      <Card>
        <p className="text-sm text-slate">
          Could not load the priority queue. Try again in a moment.
        </p>
      </Card>
    );
  }

  const { items } = queueQuery.data;
  const flagItems = items.filter(
    (i): i is Extract<PriorityItem, { type: 'flag' }> => i.type === 'flag',
  );
  const shiftItems = items.filter(
    (i): i is Extract<PriorityItem, { type: 'shift_at_risk' }> =>
      i.type === 'shift_at_risk',
  );

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<AlertTriangle size={20} />}
        title="All clear"
        description="No flagged shifts today. We'll surface anything urgent here."
      />
    );
  }

  return (
    <Card className="!p-0">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <h3 className="font-display text-lg text-ink">Needs attention</h3>
        {flagItems.length > 0 && (
          <Badge variant="high">{flagItems.length} unread</Badge>
        )}
      </div>
      {flagItems.length > 0 && (
        <div className="px-6 pb-2">
          <h4 className="text-xs uppercase tracking-[0.05em] text-muted-text py-3">
            High severity flags
          </h4>
          <ul>
            {flagItems.slice(0, 10).map((item) => (
              <FlagItem key={item.id} item={item} />
            ))}
          </ul>
          <Link
            to="/coordinator/flags"
            className="text-xs text-forest hover:underline inline-block mt-3"
          >
            View all flags →
          </Link>
        </div>
      )}
      {shiftItems.length > 0 && (
        <div className="px-6 pb-4">
          <h4 className="text-xs uppercase tracking-[0.05em] text-muted-text py-3">
            At-risk shifts
          </h4>
          <ul>
            {shiftItems.slice(0, 5).map((item) => (
              <ShiftItem key={item.id} item={item} />
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
