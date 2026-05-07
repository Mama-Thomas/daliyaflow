import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { CaregiverHeader } from '@/components/caregiver/Header';
import { ShiftCard } from '@/components/caregiver/ShiftCard';
import { EmptyState, SkeletonCard } from '@/components/ui';
import { shiftsApi } from '@/api/shifts';
import { clientsApi } from '@/api/clients';
import { flagsListApi } from '@/api/flags';
import { handoffApi } from '@/api/handoff';
import {
  fullDate,
  timeOfDayGreeting,
  todayISODate,
  relativeTime,
} from '@/utils/format';

export default function CaregiverHomePage() {
  const user = useAuthStore((s) => s.user);

  const shiftsQuery = useQuery({
    queryKey: ['shifts', 'today', user?.id],
    queryFn: () =>
      shiftsApi.list({ date: todayISODate(), caregiver_id: user!.id }),
    enabled: !!user,
  });

  const clientsQuery = useQuery({
    queryKey: ['clients'],
    queryFn: clientsApi.list,
  });

  const recentFlagsQuery = useQuery({
    queryKey: ['flags', 'unreviewed', 'count'],
    queryFn: () => flagsListApi.list({ status: 'suggested' }),
  });

  const recentSubmissionsQuery = useQuery({
    queryKey: ['shared-submissions', user?.id],
    queryFn: () => handoffApi.sharedSubmissions(5),
    enabled: !!user,
  });

  const clients = clientsQuery.data ?? [];
  const clientById = (id: string) => clients.find((c) => c.id === id);

  const greeting = `${timeOfDayGreeting()}, ${user?.first_name ?? 'there'}`;

  return (
    <div>
      <CaregiverHeader
        title={greeting}
        subtitle={fullDate()}
        unreadCount={recentFlagsQuery.data?.length}
      />

      <main className="px-5 py-6 space-y-8">
        {/* Stat strip */}
        <section>
          <div className="overflow-x-auto -mx-5 px-5">
            <div className="flex gap-3 min-w-max">
              <StatChip label="Shifts today" value={shiftsQuery.data?.length ?? 0} />
              <StatChip
                label="Submitted"
                value={recentSubmissionsQuery.data?.length ?? 0}
              />
              <StatChip
                label="Open flags"
                value={recentFlagsQuery.data?.length ?? 0}
              />
            </div>
          </div>
        </section>

        {/* Today's shifts */}
        <section className="space-y-3">
          <h2 className="font-display text-xl text-ink">Your shifts today</h2>

          {shiftsQuery.isLoading && (
            <div className="space-y-3">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          )}

          {shiftsQuery.isError && (
            <p className="text-sm text-[var(--color-error)]">
              Could not load your shifts. Pull to refresh.
            </p>
          )}

          {!shiftsQuery.isLoading && (shiftsQuery.data?.length ?? 0) === 0 && (
            <EmptyState
              title="No shifts scheduled today"
              description="Check back later or look at upcoming shifts in the Shifts tab."
            />
          )}

          {(shiftsQuery.data ?? []).map((s) => (
            <ShiftCard
              key={s.id}
              shift={s}
              client={clientById(s.client_id)}
            />
          ))}
        </section>

        {/* Recent submissions */}
        <section className="space-y-3">
          <h2 className="font-display text-xl text-ink">Recent submissions</h2>

          {recentSubmissionsQuery.isLoading && <SkeletonCard />}

          {!recentSubmissionsQuery.isLoading &&
            (recentSubmissionsQuery.data?.length ?? 0) === 0 && (
              <EmptyState
                title="Nothing submitted recently"
                description="Recent submissions for shared clients will appear here."
              />
            )}

          {(recentSubmissionsQuery.data ?? []).slice(0, 5).map((s) => {
            const clientLabel = s.client_preferred_name
              ? `${s.client_preferred_name}${s.client_last_initial ? ' ' + s.client_last_initial + '.' : ''}`
              : 'Client';
            const byLabel = s.is_own_submission
              ? 'by you'
              : `by ${s.caregiver_first_name}`;
            const when = s.finalized_at ?? s.created_at;
            return (
              <Link
                key={s.handoff_id}
                to={`/caregiver/shifts/${s.shift_id}/handoff`}
                className="block bg-white border border-border rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-ink truncate">
                      {clientLabel}
                    </div>
                    <div className="text-xs text-muted-text font-mono mt-0.5">
                      {relativeTime(when)}
                    </div>
                  </div>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full border shrink-0"
                    style={{
                      borderColor: 'var(--color-border)',
                      color: s.is_own_submission
                        ? 'var(--color-forest)'
                        : 'var(--color-muted-text)',
                      background: s.is_own_submission
                        ? 'var(--color-forest-pale)'
                        : 'var(--color-surface)',
                    }}
                  >
                    {byLabel}
                  </span>
                </div>
              </Link>
            );
          })}
        </section>
      </main>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-forest-pale rounded-lg px-4 py-3 min-w-[120px]">
      <div className="text-xs text-slate uppercase tracking-[0.05em]">
        {label}
      </div>
      <div className="font-mono text-2xl text-forest mt-1">{value}</div>
    </div>
  );
}
