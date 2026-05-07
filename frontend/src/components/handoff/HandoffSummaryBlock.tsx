import { ReactNode } from 'react';
import {
  ListChecks,
  ClipboardList,
  AlertCircle,
  ArrowRightCircle,
  FileText,
  Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/utils/cn';

export interface HandoffSummary {
  summary_overview: string;
  notable_changes?: string;
  tasks_completed?: string[];
  tasks_pending?: string[];
  follow_up_items?: string[];
  supervisor_attention_needed?: boolean;
  supervisor_attention_reason?: string;
}

export interface HandoffSummaryBlockProps {
  summary: HandoffSummary;
  generated?: boolean;
  onEdit?: () => void;
  onViewSourceNote?: () => void;
  className?: string;
}

function Section({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2 text-xs uppercase tracking-[0.05em] text-slate">
        <span className="text-forest">{icon}</span>
        {label}
      </div>
      <div className="text-base text-ink leading-relaxed">{children}</div>
    </div>
  );
}

function List({ items }: { items: string[] }) {
  if (items.length === 0) return <span className="text-muted-text italic">None</span>;
  return (
    <ul className="list-disc pl-5 space-y-1">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export function HandoffSummaryBlock({
  summary,
  generated,
  onEdit,
  onViewSourceNote,
  className,
}: HandoffSummaryBlockProps) {
  return (
    <div
      className={cn(
        'group relative rounded-lg border border-border bg-[var(--color-forest-pale)]/40 p-6 space-y-6',
        className,
      )}
    >
      {generated && (
        <div className="absolute right-3 top-3 text-xs italic text-muted-text">
          AI Generated
        </div>
      )}
      {onEdit && (
        <div className="absolute right-3 bottom-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Pencil size={14} />}
            onClick={onEdit}
          >
            Edit
          </Button>
        </div>
      )}

      <Section icon={<FileText size={14} />} label="Overview">
        {summary.summary_overview || (
          <span className="text-muted-text italic">No overview yet</span>
        )}
      </Section>

      {summary.notable_changes ? (
        <Section icon={<AlertCircle size={14} />} label="Notable Changes">
          {summary.notable_changes}
        </Section>
      ) : null}

      <Section icon={<ListChecks size={14} />} label="Tasks Completed">
        <List items={summary.tasks_completed ?? []} />
      </Section>

      <Section icon={<ClipboardList size={14} />} label="Tasks Pending">
        <List items={summary.tasks_pending ?? []} />
      </Section>

      <Section
        icon={<ArrowRightCircle size={14} />}
        label="Follow Up Items"
      >
        <List items={summary.follow_up_items ?? []} />
      </Section>

      {summary.supervisor_attention_needed && (
        <Section
          icon={<AlertCircle size={14} className="text-[var(--color-risk-high)]" />}
          label="Supervisor Attention"
        >
          <span className="text-[var(--color-risk-high)]">
            {summary.supervisor_attention_reason ||
              'Flagged for supervisor review.'}
          </span>
        </Section>
      )}

      {onViewSourceNote && (
        <div className="pt-2 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<FileText size={14} />}
            onClick={onViewSourceNote}
          >
            View Source Note
          </Button>
        </div>
      )}
    </div>
  );
}
