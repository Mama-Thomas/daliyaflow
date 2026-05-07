import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, Leaf, RefreshCw, Users } from 'lucide-react';
import { Card, EmptyState, SkeletonCard } from '@/components/ui';
import { dashboardApi, ShiftBriefClient } from '@/api/dashboard';
import { clientsApi } from '@/api/clients';
import { fullDate, relativeTime } from '@/utils/format';
import { cn } from '@/utils/cn';

function briefGreeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return 'Morning Brief';
  if (h < 18) return 'Afternoon Brief';
  return 'Evening Brief';
}

const severityColor: Record<'high' | 'medium' | 'low', string> = {
  high: 'var(--color-risk-high)',
  medium: 'var(--color-risk-medium)',
  low: 'var(--color-risk-low)',
};

function ClientBriefRow({ entry }: { entry: ShiftBriefClient }) {
  const counts = useMemo(() => {
    const c: Record<'high' | 'medium' | 'low', number> = {
      high: 0,
      medium: 0,
      low: 0,
    };
    for (const f of entry.new_flags) c[f.severity] += 1;
    return c;
  }, [entry.new_flags]);

  const dotColor = severityColor[entry.highest_severity];
  const isHigh = entry.highest_severity === 'high';

  return (
    <li>
      <Link
        to={`/coordinator/clients/${entry.client_id}`}
        className={cn(
          'flex items-start gap-3 px-5 py-4 border-b border-border last:border-b-0',
          'transition-colors hover:bg-forest-pale/40',
          isHigh && 'bg-[var(--color-risk-high-pale)]/40',
        )}
      >
        <span
          className="mt-1.5 size-2 rounded-full shrink-0"
          aria-hidden
          style={{ background: dotColor }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-ink">
              {entry.client_name}
            </span>
            {counts.high > 0 && (
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{
                  background: 'var(--color-risk-high-pale)',
                  color: 'var(--color-risk-high)',
                }}
              >
                {counts.high} high
              </span>
            )}
            {counts.medium > 0 && (
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{
                  background: 'var(--color-risk-medium-pale)',
                  color: 'var(--color-risk-medium)',
                }}
              >
                {counts.medium} medium
              </span>
            )}
            {counts.low > 0 && (
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{
                  background: 'var(--color-risk-low-pale)',
                  color: 'var(--color-risk-low)',
                }}
              >
                {counts.low} low
              </span>
            )}
            {entry.continuity_break && (
              <span
                className="text-xs px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                style={{
                  background: 'var(--color-gold-light)',
                  color: 'var(--color-gold)',
                }}
              >
                <Users size={10} aria-hidden /> New caregiver
              </span>
            )}
          </div>
          {entry.caregivers_today.length > 0 && (
            <p className="text-xs text-muted-text mt-1">
              {entry.caregivers_today.join(', ')}
            </p>
          )}
        </div>
        {entry.last_handoff_at && (
          <span className="text-[11px] text-muted-text font-mono shrink-0">
            {relativeTime(entry.last_handoff_at)}
          </span>
        )}
      </Link>
    </li>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderListItems(items: string[]): string {
  if (!items || items.length === 0) return '<p class="empty">None recorded.</p>';
  return (
    '<ul>' +
    items.map((i) => `<li>${escapeHtml(i)}</li>`).join('') +
    '</ul>'
  );
}

export function ShiftBriefCard() {
  const briefQuery = useQuery({
    queryKey: ['shift-brief'],
    queryFn: dashboardApi.shiftBrief,
    refetchInterval: 5 * 60_000,
  });

  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);

  const greeting = briefGreeting();
  const date = fullDate();
  const clients = briefQuery.data?.clients ?? [];
  const fetchedAt = briefQuery.dataUpdatedAt
    ? new Date(briefQuery.dataUpdatedAt).toISOString()
    : null;

  const handleDownloadAll = async () => {
    if (clients.length < 2 || downloading) return;
    setDownloading(true);
    setProgress(0);
    type BriefingResult =
      | { ok: true; clientName: string; card: import('@/api/clients').CareCardPayload }
      | { ok: false; clientName: string };
    const results: BriefingResult[] = [];
    for (let i = 0; i < clients.length; i += 1) {
      const c = clients[i];
      setProgress(i);
      try {
        const res = await clientsApi.carecard(c.client_id);
        results.push({ ok: true, clientName: c.client_name, card: res.card });
      } catch {
        results.push({ ok: false, clientName: c.client_name });
      }
    }
    setProgress(clients.length);

    const sections = results
      .map((r) => {
        if (!r.ok) {
          return `
            <section class="briefing">
              <h1>${escapeHtml(r.clientName)}</h1>
              <p class="error">Could not generate briefing for this client. Skipped.</p>
            </section>
          `;
        }
        const card = r.card;
        return `
          <section class="briefing">
            <h1>${escapeHtml(r.clientName)}</h1>
            <p class="welcome">${escapeHtml(card.welcome_line || '')}</p>
            <h2>Key things to know</h2>
            ${renderListItems(card.key_things_to_know)}
            <h2>Watch for</h2>
            ${renderListItems(card.watch_for)}
            <h2>Pending tasks</h2>
            ${renderListItems(card.pending_tasks)}
            ${
              card.coordinator_note
                ? `<h2>Coordinator note</h2><p>${escapeHtml(card.coordinator_note)}</p>`
                : ''
            }
          </section>
        `;
      })
      .join('');

    const generatedAt = new Date().toLocaleString();
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>CareCard Briefings — ${escapeHtml(date)}</title>
<style>
  @media print {
    @page { margin: 0.5in; }
    .briefing { page-break-after: always; }
    .briefing:last-child { page-break-after: auto; }
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    color: #1A2332;
    margin: 0;
    padding: 0.75in;
    line-height: 1.5;
  }
  header.doc-header {
    border-bottom: 2px solid #2B6CB0;
    padding-bottom: 12px;
    margin-bottom: 24px;
  }
  header.doc-header h1 {
    margin: 0;
    font-size: 22px;
    color: #2B6CB0;
  }
  header.doc-header p { margin: 4px 0 0; color: #5A6B7C; font-size: 13px; }
  section.briefing { padding: 12px 0; }
  section.briefing h1 {
    font-size: 24px;
    color: #1A2332;
    margin: 0 0 8px;
    border-bottom: 1px solid #E2E8F0;
    padding-bottom: 6px;
  }
  section.briefing h2 {
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #5A6B7C;
    margin: 18px 0 6px;
  }
  section.briefing p.welcome { font-size: 15px; margin: 0 0 6px; }
  section.briefing p.error { color: #B91C1C; font-style: italic; }
  section.briefing ul { padding-left: 20px; margin: 4px 0; }
  section.briefing li { margin: 2px 0; }
  section.briefing p.empty { color: #94A3B8; font-style: italic; margin: 4px 0; }
</style>
</head>
<body>
  <header class="doc-header">
    <h1>CareCard Briefings</h1>
    <p>${escapeHtml(date)} · Generated ${escapeHtml(generatedAt)}</p>
  </header>
  ${sections}
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.print(); }, 250);
    });
  <\/script>
</body>
</html>`;

    const printWin = window.open('', '_blank');
    if (printWin) {
      printWin.document.open();
      printWin.document.write(html);
      printWin.document.close();
    } else {
      // Popup blocked: fall back to a Blob URL the user can open manually.
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    }
    setDownloading(false);
  };

  if (briefQuery.isLoading) {
    return <SkeletonCard />;
  }
  if (briefQuery.isError) {
    return (
      <Card>
        <button
          type="button"
          onClick={() => briefQuery.refetch()}
          className="text-sm text-slate hover:text-forest"
        >
          Could not load brief. Tap to retry.
        </button>
      </Card>
    );
  }

  return (
    <Card className="!p-0">
      <header className="px-5 py-4 border-b border-border">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-display text-xl text-ink">{greeting}</h2>
            <p className="text-sm text-muted-text mt-0.5">
              {clients.length === 0
                ? 'All caught up — no new flags today'
                : `${clients.length} client${clients.length === 1 ? '' : 's'} need${clients.length === 1 ? 's' : ''} attention today`}
            </p>
          </div>
          <span className="text-sm text-muted-text font-mono">{date}</span>
        </div>
      </header>

      {clients.length === 0 ? (
        <div className="py-6">
          <EmptyState
            icon={<Leaf size={20} />}
            title="All caught up"
            description="No new flags today."
          />
        </div>
      ) : (
        <ul>
          {clients.map((c) => (
            <ClientBriefRow key={c.client_id} entry={c} />
          ))}
        </ul>
      )}

      <footer className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border text-xs text-muted-text flex-wrap">
        <span>
          {fetchedAt
            ? `Last updated ${relativeTime(fetchedAt)}`
            : 'Awaiting first refresh'}
        </span>
        <div className="flex items-center gap-2">
          {clients.length >= 2 && (
            <button
              type="button"
              onClick={handleDownloadAll}
              disabled={downloading}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border',
                'text-xs text-slate hover:text-forest hover:border-forest transition-colors',
                'disabled:opacity-60 disabled:cursor-not-allowed',
              )}
            >
              <Download
                size={12}
                className={downloading ? 'animate-pulse' : ''}
                aria-hidden
              />
              {downloading
                ? `Generating briefings for ${clients.length} clients… (${progress}/${clients.length})`
                : 'Download All Briefings'}
            </button>
          )}
          <button
            type="button"
            aria-label="Refresh brief"
            onClick={() => briefQuery.refetch()}
            className="size-7 rounded-full hover:bg-forest-pale text-slate hover:text-forest flex items-center justify-center"
          >
            <RefreshCw size={12} className={briefQuery.isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </footer>
    </Card>
  );
}
