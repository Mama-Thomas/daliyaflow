import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Globe,
  Mic,
  X,
} from 'lucide-react';
import { dashboardApi } from '@/api/dashboard';
import { Badge, BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatCategory, relativeTime } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { RiskSeverity, RiskStatus } from '@/types';

export interface FlagDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  flag: {
    id: string;
    category: string;
    severity: RiskSeverity;
    extracted_reason: string;
    status: RiskStatus;
    shift_id: string;
    created_at?: string;
  } | null;
  shiftContext?: {
    caregiver_name?: string;
    client_name?: string;
    scheduled_start?: string;
  };
  onConfirm?: () => void;
  onDismiss?: () => void;
  onEscalate?: () => void;
  scrollToSourceNote?: boolean;
}

const severityToBadge: Record<RiskSeverity, BadgeVariant> = {
  high: 'high',
  medium: 'medium',
  low: 'low',
};

const severityPale: Record<RiskSeverity, string> = {
  high: 'var(--color-risk-high-pale)',
  medium: 'var(--color-risk-medium-pale)',
  low: 'var(--color-risk-low-pale)',
};

const severityColor: Record<RiskSeverity, string> = {
  high: 'var(--color-risk-high)',
  medium: 'var(--color-risk-medium)',
  low: 'var(--color-risk-low)',
};

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function FlagDetailDrawer({
  open,
  onClose,
  flag,
  shiftContext,
  onConfirm,
  onDismiss,
  onEscalate,
  scrollToSourceNote,
}: FlagDetailDrawerProps) {
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const sourceRef = useRef<HTMLDivElement | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [showFullNote, setShowFullNote] = useState(false);

  const rawNoteQuery = useQuery({
    queryKey: ['raw-note', flag?.shift_id],
    queryFn: () => dashboardApi.rawNote(flag!.shift_id),
    enabled: open && !!flag?.shift_id,
    retry: false,
  });

  useEffect(() => {
    if (!open) return;
    previousFocus.current = (document.activeElement as HTMLElement) ?? null;

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !drawerRef.current) return;
      const focusables = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => !el.hasAttribute('aria-hidden'));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    window.setTimeout(() => {
      const focusables = drawerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      focusables?.[0]?.focus();
      if (scrollToSourceNote && sourceRef.current) {
        sourceRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 50);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previousFocus.current?.focus?.();
    };
  }, [open, onClose, scrollToSourceNote]);

  if (!flag) return null;

  const severity = flag.severity;

  return (
    <div
      aria-hidden={!open}
      className={cn(
        'fixed inset-0 z-50 transition-opacity duration-200',
        open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
      )}
    >
      <button
        type="button"
        aria-label="Close drawer"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-ink/50"
      />

      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Flag details"
        className={cn(
          'absolute bg-white shadow-xl flex flex-col',
          // Mobile: bottom sheet
          'left-0 right-0 bottom-0 max-h-[90vh] rounded-t-2xl',
          // Desktop: right side drawer
          'sm:left-auto sm:top-0 sm:bottom-0 sm:right-0 sm:max-h-none sm:rounded-none sm:rounded-l-2xl sm:w-[480px]',
          'transition-transform duration-[250ms] ease-out',
          open
            ? 'translate-y-0 sm:translate-x-0'
            : 'translate-y-full sm:translate-y-0 sm:translate-x-full',
        )}
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <span
              aria-hidden
              className="size-2 rounded-full shrink-0"
              style={{ background: severityColor[severity] }}
            />
            <h2 className="font-display text-lg text-ink truncate">
              {formatCategory(flag.category)}
            </h2>
            <Badge variant={severityToBadge[severity]}>{severity}</Badge>
            <Badge variant={flag.status === 'suggested' ? 'pending' : 'neutral'}>
              {flag.status}
            </Badge>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="size-9 rounded-full hover:bg-forest-pale text-slate hover:text-forest flex items-center justify-center shrink-0"
          >
            <X size={16} />
          </button>
        </header>

        <div className="overflow-y-auto px-5 py-5 space-y-6">
          {/* Extracted reason */}
          <section>
            <p className="text-xs text-muted-text mb-2">
              AI extracted from shift note
            </p>
            <blockquote
              className="rounded-md p-4 text-sm text-ink leading-relaxed border-l-4"
              style={{
                background: severityPale[severity],
                borderLeftColor: severityColor[severity],
              }}
            >
              {flag.extracted_reason}
            </blockquote>
          </section>

          {/* Source note */}
          <section ref={sourceRef}>
            <h3 className="text-sm font-semibold text-slate mb-2">
              Original Shift Note
            </h3>

            {rawNoteQuery.isLoading && (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-9/12" />
              </div>
            )}

            {rawNoteQuery.isError && (
              <div
                className="rounded-md p-3 text-sm text-slate border"
                style={{
                  background: 'var(--color-surface)',
                  borderColor: 'var(--color-border)',
                }}
              >
                The original note could not be loaded.
              </div>
            )}

            {rawNoteQuery.data && (
              <SourceNoteBlock
                note={rawNoteQuery.data}
                expanded={showFullNote}
                onToggle={() => setShowFullNote((v) => !v)}
              />
            )}
          </section>

          {/* Shift context */}
          {(shiftContext?.client_name ||
            shiftContext?.caregiver_name ||
            shiftContext?.scheduled_start) && (
            <section className="text-sm text-slate space-y-1">
              <h3 className="text-sm font-semibold text-slate mb-2">
                Shift context
              </h3>
              {shiftContext.client_name && (
                <p>
                  Client: <span className="text-ink">{shiftContext.client_name}</span>
                </p>
              )}
              {shiftContext.caregiver_name && (
                <p>
                  Caregiver:{' '}
                  <span className="text-ink">{shiftContext.caregiver_name}</span>
                </p>
              )}
              {shiftContext.scheduled_start && (
                <p>
                  Shift:{' '}
                  <span className="text-ink font-mono text-xs">
                    {new Date(shiftContext.scheduled_start).toLocaleString(
                      undefined,
                      {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      },
                    )}
                  </span>
                </p>
              )}
              {flag.created_at && (
                <p className="text-xs text-muted-text font-mono">
                  Flagged {relativeTime(flag.created_at)}
                </p>
              )}
            </section>
          )}

          {/* Action buttons */}
          {flag.status === 'suggested' && (onConfirm || onDismiss || onEscalate) && (
            <section className="flex flex-wrap gap-2 pt-2 border-t border-border">
              {onConfirm && (
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<CheckCircle2 size={14} />}
                  className="text-[var(--color-risk-resolved)] hover:bg-[var(--color-risk-resolved-pale)]"
                  onClick={() => {
                    onConfirm();
                    onClose();
                  }}
                >
                  Confirm
                </Button>
              )}
              {onDismiss && (
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<X size={14} />}
                  onClick={() => {
                    onDismiss();
                    onClose();
                  }}
                >
                  Dismiss
                </Button>
              )}
              {onEscalate && (
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<AlertTriangle size={14} />}
                  className="text-[var(--color-risk-high)] hover:bg-[var(--color-risk-high-pale)]"
                  onClick={() => {
                    onEscalate();
                    onClose();
                  }}
                >
                  Escalate
                </Button>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function SourceNoteBlock({
  note,
  expanded,
  onToggle,
}: {
  note: {
    input_type: string;
    raw_text: string;
    transcript_confidence: number | null;
    original_language?: string | null;
    language_name?: string | null;
    original_text?: string | null;
    translated_text?: string | null;
  };
  expanded: boolean;
  onToggle: () => void;
}) {
  const isMultilingual =
    !!note.original_language &&
    note.original_language !== 'en' &&
    !!note.translated_text;

  const displayText = isMultilingual
    ? note.translated_text || note.raw_text
    : note.raw_text;
  const lines = displayText.split('\n');
  const isLong = displayText.length > 240 || lines.length > 3;
  const collapsed = isLong && !expanded;
  const visible = collapsed
    ? lines.slice(0, 3).join('\n').slice(0, 280) +
      (displayText.length > 280 ? '…' : '')
    : displayText;

  const lowConfidence =
    note.transcript_confidence !== null &&
    note.transcript_confidence < 0.7;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {note.input_type === 'voice' && (
          <Badge variant="neutral" className="!normal-case">
            <span className="inline-flex items-center gap-1">
              <Mic size={10} aria-hidden /> Voice note — transcribed
            </span>
          </Badge>
        )}
        {isMultilingual && (
          <Badge variant="neutral" className="!normal-case">
            <span className="inline-flex items-center gap-1">
              <Globe size={10} aria-hidden /> {note.language_name}
            </span>
          </Badge>
        )}
        {lowConfidence && (
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              background: 'var(--color-risk-medium-pale)',
              color: 'var(--color-warning)',
            }}
          >
            Low confidence transcript
          </span>
        )}
      </div>

      {isMultilingual && note.original_text ? (
        <>
          <p className="text-xs text-muted-text mt-1">
            Original note ({note.language_name})
          </p>
          <div
            className="rounded-md p-4 text-sm text-ink leading-relaxed whitespace-pre-wrap"
            style={{ background: 'var(--color-surface)' }}
          >
            {note.original_text}
          </div>
          <p className="text-xs text-muted-text mt-2">English translation</p>
          <div className="rounded-md p-4 text-sm text-ink leading-relaxed whitespace-pre-wrap bg-white border border-border">
            {visible}
          </div>
        </>
      ) : (
        <div
          className="rounded-md p-4 text-sm text-ink leading-relaxed whitespace-pre-wrap"
          style={{ background: 'var(--color-surface)' }}
        >
          {visible}
        </div>
      )}

      {isLong && (
        <button
          type="button"
          onClick={onToggle}
          className="text-xs text-forest hover:underline inline-flex items-center gap-1"
        >
          {expanded ? (
            <>
              <ChevronUp size={12} /> Show less
            </>
          ) : (
            <>
              <ChevronDown size={12} /> Show full note
            </>
          )}
        </button>
      )}
    </div>
  );
}

export function ViewSourceNoteButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      leftIcon={<FileText size={14} />}
      onClick={onClick}
      className={className}
    >
      View Source Note
    </Button>
  );
}
