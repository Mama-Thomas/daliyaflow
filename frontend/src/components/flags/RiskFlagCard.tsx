import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { Badge, BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/utils/cn';
import type { RiskSeverity, RiskStatus } from '@/types';

export interface RiskFlagCardProps {
  category: string;
  severity: RiskSeverity;
  reason: string;
  status: RiskStatus;
  onConfirm?: () => void;
  onDismiss?: () => void;
  onEscalate?: () => void;
  onClick?: () => void;
  className?: string;
}

const severityBorderColor: Record<RiskSeverity, string> = {
  high: 'border-l-[var(--color-risk-high)]',
  medium: 'border-l-[var(--color-risk-medium)]',
  low: 'border-l-[var(--color-risk-low)]',
};

const severityBadge: Record<RiskSeverity, BadgeVariant> = {
  high: 'high',
  medium: 'medium',
  low: 'low',
};

function readableCategory(category: string): string {
  return category.replaceAll('_', ' ');
}

export function RiskFlagCard({
  category,
  severity,
  reason,
  status,
  onConfirm,
  onDismiss,
  onEscalate,
  onClick,
  className,
}: RiskFlagCardProps) {
  const showPulse = severity === 'high' && status === 'suggested';
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={cn(
        'bg-white rounded-lg border border-border shadow-sm p-5 border-l-4 animate-fade-in-up',
        severityBorderColor[severity],
        showPulse && 'animate-risk-pulse',
        onClick && 'cursor-pointer hover:shadow-md transition-shadow',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 text-sm font-medium text-ink">
          <AlertTriangle size={16} className="text-[var(--color-risk-medium)]" />
          <span className="capitalize">{readableCategory(category)}</span>
        </div>
        <Badge variant={severityBadge[severity]}>{severity}</Badge>
      </div>
      <p className="text-sm text-slate leading-relaxed mb-4">{reason}</p>
      {status === 'suggested' && (
        <div
          className="flex flex-wrap gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          {onConfirm && (
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<CheckCircle2 size={14} />}
              className="text-[var(--color-risk-resolved)] hover:bg-[var(--color-risk-resolved-pale)]"
              onClick={onConfirm}
            >
              Confirm
            </Button>
          )}
          {onDismiss && (
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<X size={14} />}
              onClick={onDismiss}
            >
              Dismiss
            </Button>
          )}
          {onEscalate && (
            <Button
              variant="ghost"
              size="sm"
              className="text-[var(--color-risk-high)] hover:bg-[var(--color-risk-high-pale)]"
              onClick={onEscalate}
            >
              Escalate
            </Button>
          )}
        </div>
      )}
      {status !== 'suggested' && (
        <Badge
          variant={status === 'dismissed' ? 'neutral' : 'resolved'}
          className="mt-1"
        >
          {status}
        </Badge>
      )}
    </div>
  );
}
