import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Clock, Minus } from 'lucide-react';
import { Card, SkeletonCard } from '@/components/ui';
import { dashboardApi } from '@/api/dashboard';
import { relativeTime, formatCategory } from '@/utils/format';
import { cn } from '@/utils/cn';

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: React.ReactNode;
}) {
  return (
    <Card className="!p-4">
      <div className="text-xs uppercase tracking-[0.05em] text-slate">
        {label}
      </div>
      <div className="font-display text-3xl text-ink mt-1">{value}</div>
      {detail && <div className="text-xs text-muted-text mt-1">{detail}</div>}
    </Card>
  );
}

function AvgReviewCard({ minutes }: { minutes: number | null }) {
  if (minutes === null || minutes === undefined) {
    return (
      <Card className="!p-4">
        <div className="text-xs uppercase tracking-[0.05em] text-slate">
          Avg review
        </div>
        <div className="font-display text-2xl text-muted-text mt-1">No data yet</div>
        <div className="text-xs text-muted-text mt-1">
          Once you action flags, average review time appears here.
        </div>
      </Card>
    );
  }

  const colour =
    minutes <= 10
      ? 'text-[var(--color-success)]'
      : minutes >= 30
        ? 'text-[var(--color-risk-medium)]'
        : 'text-ink';

  return (
    <Card className="!p-4">
      <div className="text-xs uppercase tracking-[0.05em] text-slate">
        Avg review
      </div>
      <div
        className={cn('font-display text-3xl mt-1 flex items-center gap-2', colour)}
      >
        <Clock size={18} aria-hidden />~{minutes}m
      </div>
      <div className="text-xs text-muted-text mt-1">last 7 days</div>
    </Card>
  );
}

function Delta({ value }: { value: number | null }) {
  if (value === null || value === undefined) return null;
  if (value === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-text">
        <Minus size={12} /> no change
      </span>
    );
  }
  const positive = value > 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1',
        positive ? 'text-[var(--color-risk-resolved)]' : 'text-[var(--color-risk-high)]',
      )}
    >
      {positive ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
      {Math.abs(value)} vs yesterday
    </span>
  );
}

export function QuickStats() {
  const summaryQuery = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: dashboardApi.summary,
    refetchInterval: 60_000,
  });

  if (summaryQuery.isLoading) return <SkeletonCard />;
  const data = summaryQuery.data;
  if (summaryQuery.isError || !data) {
    return (
      <Card>
        <p className="text-sm text-slate">Could not load stats.</p>
      </Card>
    );
  }

  const { high = 0, medium = 0, low = 0 } = data.open_flags_by_severity ?? {};

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Submissions today"
          value={data.submissions_today}
          detail={<Delta value={null} />}
        />
        <StatCard
          label="Open flags"
          value={high + medium + low}
          detail={
            <span>
              {high} high · {medium} med · {low} low
            </span>
          }
        />
        <StatCard label="Shifts at risk" value={data.shifts_at_risk} />
        <AvgReviewCard minutes={data.avg_review_time_minutes} />
      </div>

      <Card>
        <h3 className="font-display text-base text-ink mb-2">
          Recent coordinator actions
        </h3>
        {data.recent_actions.length === 0 ? (
          <p className="text-sm text-muted-text italic">No actions logged yet.</p>
        ) : (
          <ul className="space-y-2">
            {data.recent_actions.map((a) => (
              <li
                key={a.id}
                className="text-sm text-slate border-l-2 border-forest-pale pl-3"
              >
                <div className="font-medium text-ink capitalize">
                  {formatCategory(a.action_type)}
                </div>
                {a.note && (
                  <p className="text-xs text-muted-text line-clamp-2">{a.note}</p>
                )}
                <p className="text-[10px] text-muted-text font-mono mt-0.5">
                  {relativeTime(a.created_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
        <a
          href="/coordinator/flags"
          className="text-xs text-forest hover:underline inline-block mt-3"
        >
          View full log →
        </a>
      </Card>
    </div>
  );
}
