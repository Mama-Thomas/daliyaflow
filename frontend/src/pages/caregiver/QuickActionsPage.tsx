import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Clock, ArrowRight } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { Button, Card, EmptyState, SkeletonCard } from '@/components/ui';
import { shiftsApi, Shift } from '@/api/shifts';
import { clientsApi } from '@/api/clients';
import { todayISODate } from '@/utils/format';

export default function QuickActionsPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  const shiftsQuery = useQuery({
    queryKey: ['shifts', 'today', 'quick-actions', user?.id],
    queryFn: () =>
      shiftsApi.list({ date: todayISODate(), caregiver_id: user!.id }),
    enabled: !!user,
  });

  const clientsQuery = useQuery({
    queryKey: ['clients'],
    queryFn: clientsApi.list,
  });

  const clients = clientsQuery.data ?? [];
  const clientById = (id: string) => clients.find((c) => c.id === id);

  const todaysShifts = shiftsQuery.data ?? [];
  const activeShift =
    todaysShifts.find((s) => s.status === 'in_progress') ?? null;
  const completedShifts = todaysShifts.filter((s) => s.status === 'completed');
  const upcomingShifts = todaysShifts.filter((s) => s.status === 'scheduled');

  function clientLabel(s: Shift) {
    const c = clientById(s.client_id);
    return c?.preferred_name || c?.first_name || 'Client';
  }

  function timeRange(s: Shift) {
    const t = (iso: string) =>
      new Date(iso).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      });
    return `${t(s.scheduled_start)} – ${t(s.scheduled_end)}`;
  }

  return (
    <div className="px-5 py-8 max-w-[420px] mx-auto">
      <h1 className="font-display text-2xl text-ink mb-6 text-center">
        What would you like to do?
      </h1>

      {shiftsQuery.isLoading && (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {!shiftsQuery.isLoading && (
        <div className="space-y-4">
          {/* Active shift — primary CTA */}
          {activeShift && (
            <Card className="border-2 border-forest">
              <div className="flex items-center gap-2 text-xs font-medium text-forest uppercase tracking-[0.05em] mb-2">
                <span
                  aria-hidden
                  className="size-2 rounded-full bg-forest animate-pulse"
                />
                In progress
              </div>
              <div className="font-display text-xl text-ink mb-1">
                {clientLabel(activeShift)}
              </div>
              <div className="text-sm text-muted-text font-mono mb-4">
                {timeRange(activeShift)}
              </div>
              <Button
                fullWidth
                size="lg"
                rightIcon={<ArrowRight size={16} />}
                onClick={() =>
                  navigate(`/caregiver/shifts/${activeShift.id}/submit`)
                }
              >
                Start handoff for {clientLabel(activeShift)}
              </Button>
            </Card>
          )}

          {/* Completed shifts today — secondary list */}
          {completedShifts.length > 0 && (
            <Card>
              <div className="font-medium text-ink mb-3">
                Completed shifts today
              </div>
              <div className="space-y-3">
                {completedShifts.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-3 pb-3 border-b border-border last:border-b-0 last:pb-0"
                  >
                    <div>
                      <div className="font-medium text-ink">
                        {clientLabel(s)}
                      </div>
                      <div className="text-xs text-muted-text font-mono mt-0.5 flex items-center gap-1">
                        <Clock size={10} />
                        {timeRange(s)}
                      </div>
                    </div>
                    <Link to={`/caregiver/shifts/${s.id}/submit`}>
                      <Button size="sm" variant="secondary">
                        Submit handoff
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Upcoming shifts hint */}
          {!activeShift &&
            completedShifts.length === 0 &&
            upcomingShifts.length > 0 && (
              <Card>
                <div className="font-medium text-ink mb-2">
                  Your next shift today
                </div>
                <div className="text-sm text-slate mb-1">
                  {clientLabel(upcomingShifts[0])}
                </div>
                <div className="text-xs text-muted-text font-mono mb-4">
                  {timeRange(upcomingShifts[0])}
                </div>
                <Link to="/caregiver/shifts">
                  <Button variant="ghost" fullWidth>
                    View all my shifts
                  </Button>
                </Link>
              </Card>
            )}

          {/* No shifts today */}
          {todaysShifts.length === 0 && (
            <EmptyState
              title="No shifts scheduled today"
              description="Check the Shifts tab for upcoming shifts."
              action={
                <Link to="/caregiver/shifts">
                  <Button variant="ghost">View upcoming shifts</Button>
                </Link>
              }
            />
          )}

          {/* Always-visible browse link */}
          <div className="text-center pt-2">
            <Link
              to="/caregiver/shifts"
              className="text-sm text-forest hover:text-forest-light underline-offset-2 hover:underline"
            >
              Browse all my shifts
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
