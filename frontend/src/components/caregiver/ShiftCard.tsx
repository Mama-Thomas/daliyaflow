import { Link } from 'react-router-dom';
import { ArrowRight, MapPin } from 'lucide-react';
import { Badge, BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/utils/cn';
import { clientShortName, formatTimeRange } from '@/utils/format';
import type { Shift } from '@/api/shifts';
import type { Client } from '@/api/clients';

const statusBadge: Record<Shift['status'], BadgeVariant> = {
  scheduled: 'pending',
  in_progress: 'neutral',
  completed: 'resolved',
  missed: 'high',
  at_risk: 'medium',
  covered: 'resolved',
};

const statusLabel: Record<Shift['status'], string> = {
  scheduled: 'Upcoming',
  in_progress: 'In progress',
  completed: 'Completed',
  missed: 'Missed',
  at_risk: 'At risk',
  covered: 'Covered',
};

export function ShiftCard({
  shift,
  client,
  submitted,
}: {
  shift: Shift;
  client?: Client;
  submitted?: boolean;
}) {
  const active =
    shift.status === 'in_progress' || shift.status === 'completed';
  return (
    <article
      className={cn(
        'bg-white rounded-lg shadow-sm p-4 border border-border animate-fade-in-up',
        active && 'border-l-4 border-l-forest',
      )}
    >
      <header className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="font-display text-lg text-ink truncate">
            {client
              ? clientShortName(
                  client.preferred_name || client.first_name,
                  client.last_name,
                )
              : 'Client'}
          </div>
          <div className="text-sm text-slate font-mono">
            {formatTimeRange(shift.scheduled_start, shift.scheduled_end)}
          </div>
        </div>
        <Badge variant={statusBadge[shift.status]}>
          {statusLabel[shift.status]}
        </Badge>
      </header>

      {client?.address_neighborhood && (
        <div className="flex items-center gap-1.5 text-xs text-muted-text mb-3">
          <MapPin size={12} />
          <span>{client.address_neighborhood}</span>
        </div>
      )}

      <div className="flex gap-2 pt-2 border-t border-border">
        {submitted ? (
          <Button
            variant="ghost"
            size="sm"
            rightIcon={<ArrowRight size={14} />}
          >
            <Link to={`/caregiver/shifts/${shift.id}/handoff`}>
              View handoff
            </Link>
          </Button>
        ) : active ? (
          <Link to={`/caregiver/shifts/${shift.id}/submit`} className="flex-1">
            <Button fullWidth size="sm">
              Start handoff
            </Button>
          </Link>
        ) : (
          <Link to={`/caregiver/shifts/${shift.id}`} className="flex-1">
            <Button variant="secondary" fullWidth size="sm">
              View shift
            </Button>
          </Link>
        )}
      </div>
    </article>
  );
}
