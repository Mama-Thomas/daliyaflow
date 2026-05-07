import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { Card, EmptyState, SkeletonCard } from '@/components/ui';
import { clientsApi } from '@/api/clients';

export default function ClientsPage() {
  const clientsQuery = useQuery({
    queryKey: ['clients'],
    queryFn: clientsApi.list,
  });

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl text-ink">Clients</h1>

      {clientsQuery.isLoading && <SkeletonCard />}
      {!clientsQuery.isLoading && (clientsQuery.data?.length ?? 0) === 0 && (
        <EmptyState
          title="No clients yet"
          description="Add a client from Settings to start scheduling shifts."
        />
      )}

      <Card className="!p-0">
        <ul className="divide-y divide-border">
          {(clientsQuery.data ?? []).map((c) => (
            <li key={c.id}>
              <Link
                to={`/coordinator/clients/${c.id}`}
                className="flex items-center justify-between px-6 py-4 hover:bg-forest-pale/40 transition-colors"
              >
                <div>
                  <div className="font-medium text-ink">
                    {c.preferred_name || c.first_name} {c.last_name}
                  </div>
                  <div className="text-xs text-muted-text">
                    {c.address_neighborhood ?? '—'}
                  </div>
                </div>
                <ChevronRight size={16} className="text-mist" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
