import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  BadgeVariant,
  Button,
  Card,
  EmptyState,
  SkeletonCard,
} from '@/components/ui';
import { continuityApi } from '@/api/coordinator';
import { formatCategory, relativeTime } from '@/utils/format';
import { useUIStore } from '@/store/uiStore';
import { cn } from '@/utils/cn';

const STATUS_FILTERS = ['all', 'open', 'in_progress', 'resolved'] as const;
const SEVERITY_FILTERS = ['all', 'high', 'medium', 'low'] as const;

const sevVariant: Record<string, BadgeVariant> = {
  high: 'high',
  medium: 'medium',
  low: 'low',
};

export default function ContinuityPage() {
  const qc = useQueryClient();
  const pushToast = useUIStore((s) => s.pushToast);
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>('open');
  const [severity, setSeverity] = useState<(typeof SEVERITY_FILTERS)[number]>(
    'all',
  );

  const eventsQuery = useQuery({
    queryKey: ['continuity-events', status, severity],
    queryFn: () =>
      continuityApi.list({
        status: status === 'all' ? undefined : status,
        severity: severity === 'all' ? undefined : severity,
      }),
  });

  const resolve = useMutation({
    mutationFn: (id: string) => continuityApi.patch(id, 'resolved'),
    onSuccess: () => {
      pushToast({ variant: 'success', title: 'Event resolved' });
      qc.invalidateQueries({ queryKey: ['continuity-events'] });
    },
    onError: () =>
      pushToast({ variant: 'error', title: 'Could not resolve event' }),
  });

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl text-ink">Continuity</h1>

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <span className="text-xs text-slate uppercase tracking-[0.05em]">
              Status
            </span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {STATUS_FILTERS.map((s) => (
                <Pill
                  key={s}
                  active={status === s}
                  label={s}
                  onClick={() => setStatus(s)}
                />
              ))}
            </div>
          </div>
          <div>
            <span className="text-xs text-slate uppercase tracking-[0.05em]">
              Severity
            </span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {SEVERITY_FILTERS.map((s) => (
                <Pill
                  key={s}
                  active={severity === s}
                  label={s}
                  onClick={() => setSeverity(s)}
                />
              ))}
            </div>
          </div>
        </div>
      </Card>

      {eventsQuery.isLoading ? (
        <SkeletonCard />
      ) : (eventsQuery.data?.length ?? 0) === 0 ? (
        <EmptyState
          title="No continuity events match this filter"
          description="Events get created automatically when shifts go at-risk."
        />
      ) : (
        <ul className="space-y-3">
          {(eventsQuery.data ?? []).map((e) => (
            <li
              key={e.id}
              className="bg-white border border-border rounded-lg px-4 py-3 flex flex-wrap items-center gap-3 justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-ink">
                    {formatCategory(e.category)}
                  </span>
                  <Badge variant={sevVariant[e.severity] ?? 'neutral'}>
                    {e.severity}
                  </Badge>
                  <Badge
                    variant={
                      e.status === 'resolved'
                        ? 'resolved'
                        : e.status === 'in_progress'
                          ? 'pending'
                          : 'high'
                    }
                  >
                    {e.status}
                  </Badge>
                </div>
                <p className="text-sm text-slate line-clamp-2 mt-1">
                  {e.description}
                </p>
                <p className="text-[11px] text-muted-text font-mono mt-1">
                  Open {relativeTime(e.created_at)}
                </p>
              </div>
              {e.status !== 'resolved' && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => resolve.mutate(e.id)}
                  loading={resolve.isPending}
                >
                  Resolve
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Pill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1 text-xs rounded-full border transition-colors min-h-[32px] capitalize',
        active
          ? 'bg-forest text-white border-forest'
          : 'bg-white text-slate border-border hover:border-forest hover:text-forest',
      )}
    >
      {label.replaceAll('_', ' ')}
    </button>
  );
}
