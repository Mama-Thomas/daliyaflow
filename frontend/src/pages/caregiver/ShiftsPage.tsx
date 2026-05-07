import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { CaregiverHeader } from '@/components/caregiver/Header';
import { ShiftCard } from '@/components/caregiver/ShiftCard';
import { EmptyState, SkeletonCard } from '@/components/ui';
import { shiftsApi } from '@/api/shifts';
import { clientsApi } from '@/api/clients';

export default function CaregiverShiftsPage() {
  const user = useAuthStore((s) => s.user);

  const shiftsQuery = useQuery({
    queryKey: ['shifts', 'all', user?.id],
    queryFn: () => shiftsApi.list({ caregiver_id: user!.id, limit: 50 }),
    enabled: !!user,
  });

  const clientsQuery = useQuery({
    queryKey: ['clients'],
    queryFn: clientsApi.list,
  });

  const clientById = (id: string) =>
    clientsQuery.data?.find((c) => c.id === id);

  return (
    <div>
      <CaregiverHeader title="Your shifts" />
      <main className="px-5 py-6 space-y-3">
        {shiftsQuery.isLoading && (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}
        {!shiftsQuery.isLoading && (shiftsQuery.data?.length ?? 0) === 0 && (
          <EmptyState
            title="No shifts assigned yet"
            description="Once a coordinator schedules you, your shifts show up here."
          />
        )}
        {(shiftsQuery.data ?? []).map((s) => (
          <ShiftCard
            key={s.id}
            shift={s}
            client={clientById(s.client_id)}
          />
        ))}
      </main>
    </div>
  );
}
