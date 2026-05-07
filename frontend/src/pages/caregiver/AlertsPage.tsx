import { KeyboardEvent, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CaregiverHeader } from '@/components/caregiver/Header';
import { Badge, BadgeVariant, Card, EmptyState, SkeletonCard } from '@/components/ui';
import { FlagDetailDrawer } from '@/components/flags/FlagDetailDrawer';
import { flagsListApi } from '@/api/flags';
import { SuggestedFlag } from '@/api/handoff';
import { cn } from '@/utils/cn';
import { formatCategory } from '@/utils/format';

type Filter = 'all' | 'confirmed' | 'pending' | 'escalated';

const filters: { id: Filter; label: string; queryStatus?: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending', queryStatus: 'suggested' },
  { id: 'confirmed', label: 'Confirmed', queryStatus: 'confirmed' },
  { id: 'escalated', label: 'Escalated', queryStatus: 'escalated' },
];

const severityVariant: Record<string, BadgeVariant> = {
  high: 'high',
  medium: 'medium',
  low: 'low',
};

export default function CaregiverAlertsPage() {
  const [active, setActive] = useState<Filter>('all');
  const [selectedFlag, setSelectedFlag] = useState<SuggestedFlag | null>(null);
  const status = filters.find((f) => f.id === active)?.queryStatus;

  const flagsQuery = useQuery({
    queryKey: ['caregiver-flags', active],
    queryFn: () => flagsListApi.list(status ? { status } : {}),
  });

  const drawerClientName = selectedFlag
    ? selectedFlag.client_preferred_name
      ? `${selectedFlag.client_preferred_name}${
          selectedFlag.client_last_initial
            ? ' ' + selectedFlag.client_last_initial + '.'
            : ''
        }`
      : undefined
    : undefined;
  const drawerCaregiverName = selectedFlag
    ? selectedFlag.is_own_note
      ? 'You'
      : selectedFlag.caregiver_first_name ?? undefined
    : undefined;

  return (
    <div>
      <CaregiverHeader title="Alerts" />
      <main className="px-5 py-6 space-y-4">
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setActive(f.id)}
              className={cn(
                'px-3 py-1 text-xs rounded-full border transition-colors min-h-[32px]',
                active === f.id
                  ? 'bg-forest text-white border-forest'
                  : 'bg-white text-slate border-border hover:border-forest hover:text-forest',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {flagsQuery.isLoading && <SkeletonCard />}
        {!flagsQuery.isLoading && (flagsQuery.data?.length ?? 0) === 0 && (
          <EmptyState
            title={
              active === 'all'
                ? 'No alerts yet.'
                : `No ${active} alerts right now.`
            }
            description="Alerts surfaced from your handoffs will show up here."
          />
        )}

        <div className="space-y-3">
          {(flagsQuery.data ?? []).map((f) => {
            const clientLabel =
              f.client_preferred_name || f.client_last_initial
                ? `${f.client_preferred_name ?? 'Client'}${
                    f.client_last_initial ? ' ' + f.client_last_initial + '.' : ''
                  }`
                : null;
            const originLabel = f.is_own_note
              ? 'Your note'
              : f.caregiver_first_name
                ? `From ${f.caregiver_first_name}`
                : null;

            const open = () => setSelectedFlag(f);
            const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                open();
              }
            };

            return (
              <Card
                key={f.id}
                interactive
                role="button"
                tabIndex={0}
                aria-label={`View details for ${formatCategory(f.category)} alert`}
                onClick={open}
                onKeyDown={onKey}
                className="p-4 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest"
              >
                {clientLabel && (
                  <div className="text-sm font-medium text-ink mb-1">
                    {clientLabel}
                  </div>
                )}
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="text-xs uppercase tracking-[0.05em] text-muted-text">
                    {formatCategory(f.category)}
                  </div>
                  <Badge variant={severityVariant[f.severity] ?? 'neutral'}>
                    {f.severity}
                  </Badge>
                </div>
                <p className="text-sm text-slate leading-relaxed mb-2">
                  {f.extracted_reason}
                </p>
                <div className="flex items-center justify-between gap-2 text-xs flex-wrap">
                  <Badge
                    variant={f.status === 'suggested' ? 'pending' : 'resolved'}
                  >
                    {f.status}
                  </Badge>
                  {originLabel && (
                    <span
                      className="px-2 py-0.5 rounded-full border text-xs"
                      style={{
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-muted-text)',
                        background: 'var(--color-surface)',
                      }}
                    >
                      {originLabel}
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </main>

      <FlagDetailDrawer
        open={!!selectedFlag}
        flag={selectedFlag}
        onClose={() => setSelectedFlag(null)}
        shiftContext={{
          client_name: drawerClientName,
          caregiver_name: drawerCaregiverName,
        }}
      />
    </div>
  );
}
