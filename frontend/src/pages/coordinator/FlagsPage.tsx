import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  BadgeVariant,
  Button,
  Card,
  EmptyState,
  Input,
  SkeletonCard,
} from '@/components/ui';
import { flagsListApi } from '@/api/flags';
import { clientsApi } from '@/api/clients';
import { DISPLAY_TIME_ZONE, formatCategory, relativeTime } from '@/utils/format';
import { useUIStore } from '@/store/uiStore';
import { cn } from '@/utils/cn';

const STATUS_FILTERS = [
  'all',
  'suggested',
  'confirmed',
  'dismissed',
  'escalated',
  'resolved',
] as const;

const SEVERITY_FILTERS = ['all', 'high', 'medium', 'low'] as const;

const severityVariant: Record<string, BadgeVariant> = {
  high: 'high',
  medium: 'medium',
  low: 'low',
};

export default function FlagsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const pushToast = useUIStore((s) => s.pushToast);
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>('all');
  const [severity, setSeverity] = useState<(typeof SEVERITY_FILTERS)[number]>(
    'all',
  );
  const [clientFilter, setClientFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);

  const clientsQuery = useQuery({
    queryKey: ['clients'],
    queryFn: clientsApi.list,
  });

  const matchingClient = useMemo(() => {
    if (!clientFilter) return null;
    return clientsQuery.data?.find((c) =>
      `${c.preferred_name ?? ''} ${c.first_name} ${c.last_name}`
        .toLowerCase()
        .includes(clientFilter.toLowerCase()),
    );
  }, [clientFilter, clientsQuery.data]);

  const flagsQuery = useQuery({
    queryKey: [
      'flags-page',
      status,
      severity,
      matchingClient?.id,
      dateFrom,
      dateTo,
      page,
    ],
    queryFn: () =>
      flagsListApi.list({
        status: status === 'all' ? undefined : status,
        severity: severity === 'all' ? undefined : severity,
        client_id: matchingClient?.id,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        limit: 25,
        offset: page * 25,
      }),
  });

  const clientsById = useMemo(() => {
    return new Map((clientsQuery.data ?? []).map((c) => [c.id, c]));
  }, [clientsQuery.data]);

  const dedupedFlags = useMemo(() => {
    const seen = new Set<string>();

    return (flagsQuery.data ?? []).filter((f) => {
      const clientId = (f as { client_id?: string }).client_id ?? '';
      const createdAt = (f as { created_at?: string }).created_at ?? '';
      const reason = (f.extracted_reason ?? '').trim().toLowerCase();

      const key = [clientId, f.category, f.severity, reason, createdAt].join('::');

      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [flagsQuery.data]);

  function getClientName(f: { client_id?: string }) {
    const client = f.client_id ? clientsById.get(f.client_id) : undefined;
    if (!client) return 'Unknown resident';
    return client.preferred_name || `${client.first_name} ${client.last_name}`;
  }

  function formatExactTimestamp(createdAt?: string) {
    if (!createdAt) return 'Unknown time';
    const d = new Date(createdAt);
    if (Number.isNaN(d.getTime())) return 'Unknown time';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: DISPLAY_TIME_ZONE,
    }).format(d);
  }

  function openFlagClient(f: { client_id?: string }) {
    if (!f.client_id) return;
    navigate(`/coordinator/clients/${f.client_id}`);
  }

  const bulkPatch = useMutation({
    mutationFn: async (action: 'confirmed' | 'dismissed') => {
      await Promise.all(
        Array.from(selected).map((id) =>
          flagsListApi.patchStatus(id, action),
        ),
      );
    },
    onSuccess: () => {
      pushToast({ variant: 'success', title: 'Bulk action applied' });
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['flags-page'] });
    },
    onError: () =>
      pushToast({ variant: 'error', title: 'Bulk action failed' }),
  });

  function toggleSelect(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-ink">Flags</h1>
        <Button variant="ghost" size="sm" disabled>
          Export
        </Button>
      </div>

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2 flex flex-col gap-1">
            <span className="text-xs text-slate uppercase tracking-[0.05em]">
              Status
            </span>
            <div className="flex flex-wrap gap-1.5">
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
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate uppercase tracking-[0.05em]">
              Severity
            </span>
            <div className="flex flex-wrap gap-1.5">
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
          <Input
            label="Client"
            placeholder="Search by name..."
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            helperText={
              matchingClient
                ? `Filtering by ${matchingClient.preferred_name || matchingClient.first_name}`
                : undefined
            }
          />
          <Input
            label="From"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <Input
            label="To"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
      </Card>

      {selected.size > 0 && (
        <Card className="!py-3 flex items-center gap-3">
          <span className="text-sm text-ink">{selected.size} selected</span>
          <Button
            size="sm"
            variant="secondary"
            loading={bulkPatch.isPending}
            onClick={() => bulkPatch.mutate('confirmed')}
          >
            Confirm
          </Button>
          <Button
            size="sm"
            variant="ghost"
            loading={bulkPatch.isPending}
            onClick={() => bulkPatch.mutate('dismissed')}
          >
            Dismiss
          </Button>
        </Card>
      )}

      {flagsQuery.isLoading ? (
        <SkeletonCard />
      ) : dedupedFlags.length === 0 ? (
        <EmptyState
          title="No flags match these filters"
          description="Try widening the date range or clearing filters."
        />
      ) : (
        <Card className="!p-0">
          {/* Mobile: card list */}
          <ul className="divide-y divide-border md:hidden">
            {dedupedFlags.map((f) => (
              <li
                key={f.id}
                className="p-4 min-h-[44px] cursor-pointer transition-colors hover:bg-forest-pale/30 active:bg-forest-pale/50"
                role="button"
                tabIndex={0}
                onClick={() => openFlagClient(f as { client_id?: string })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openFlagClient(f as { client_id?: string });
                  }
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.05em] text-muted-text">
                      {getClientName(f as { client_id?: string })}
                    </div>
                    <div className="text-sm font-medium text-ink mt-0.5">
                      {formatCategory(f.category)}
                    </div>
                    <p className="text-xs text-slate line-clamp-2 mt-0.5">
                      {f.extracted_reason}
                    </p>
                  </div>
                  <Badge variant={severityVariant[f.severity] ?? 'neutral'}>
                    {f.severity}
                  </Badge>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <Badge variant="neutral">{f.status}</Badge>
                  <div className="text-right">
                    <div className="text-[11px] font-mono text-muted-text">
                      {relativeTime(
                        (f as unknown as { created_at?: string }).created_at ??
                          '',
                      )}
                    </div>
                    <div className="text-[11px] text-slate mt-0.5">
                      {formatExactTimestamp(
                        (f as unknown as { created_at?: string }).created_at,
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-[0.05em] text-muted-text">
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left w-8"></th>
                  <th className="px-4 py-3 text-left">Client</th>
                  <th className="px-4 py-3 text-left">Category</th>
                  <th className="px-4 py-3 text-left">Severity</th>
                  <th className="px-4 py-3 text-left">Reason</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">When</th>
                </tr>
              </thead>
              <tbody>
                {dedupedFlags.map((f) => (
                  <tr
                    key={f.id}
                    className="border-b border-border last:border-b-0 hover:bg-forest-pale/40 cursor-pointer"
                    onClick={() => openFlagClient(f as { client_id?: string })}
                  >
                    <td className="px-4 py-3 align-top">
                      <input
                        type="checkbox"
                        aria-label={`Select ${f.category}`}
                        checked={selected.has(f.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleSelect(f.id)}
                      />
                    </td>
                    <td className="px-4 py-3 align-top text-ink">
                      {getClientName(f as { client_id?: string })}
                    </td>
                    <td className="px-4 py-3 align-top text-ink">
                      {formatCategory(f.category)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Badge variant={severityVariant[f.severity] ?? 'neutral'}>
                        {f.severity}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 align-top text-slate max-w-[420px]">
                      <p className="line-clamp-2">{f.extracted_reason}</p>
                    </td>
                    <td className="px-4 py-3 align-top capitalize">
                      <Badge variant="neutral">{f.status}</Badge>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="text-xs text-muted-text font-mono">
                        {relativeTime(
                          (f as unknown as { created_at?: string }).created_at ??
                            '',
                        )}
                      </div>
                      <div className="text-[11px] text-slate mt-0.5">
                        {formatExactTimestamp(
                          (f as unknown as { created_at?: string }).created_at,
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <Button
          variant="secondary"
          size="sm"
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          Previous
        </Button>
        <span className="text-xs text-muted-text font-mono">Page {page + 1}</span>
        <Button
          variant="secondary"
          size="sm"
          disabled={(flagsQuery.data?.length ?? 0) < 25}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>
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
      {label}
    </button>
  );
}
