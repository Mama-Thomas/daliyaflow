import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, X } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { Card } from '@/components/ui/Card';
import { shiftsApi, shiftTemplatesApi, type ShiftTemplate } from '@/api/shifts';
import { clientsApi } from '@/api/clients';
import { useUIStore } from '@/store/uiStore';
import { invitationsApi } from '@/api/users';
import { cn } from '@/utils/cn';
import { ptWallTimeToUtcIso, todayPtIsoDate } from '@/utils/format';

export function CreateShiftModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pushToast = useUIStore((s) => s.pushToast);
  const qc = useQueryClient();

  const clientsQuery = useQuery({
    queryKey: ['clients-list'],
    queryFn: () => clientsApi.list(),
    enabled: open,
  });

  const usersQuery = useQuery({
    queryKey: ['team-users'],
    queryFn: invitationsApi.list,
    enabled: open,
  });

  const templatesQuery = useQuery({
    queryKey: ['shift-templates'],
    queryFn: shiftTemplatesApi.list,
    enabled: open,
  });

  const [date, setDate] = useState('');
  const [clientId, setClientId] = useState('');
  const [caregiverId, setCaregiverId] = useState('');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  useEffect(() => {
    if (!open) return;
    setDate(todayPtIsoDate());
    setClientId('');
    setCaregiverId('');
    setTemplateId(null);
    setCustomStart('');
    setCustomEnd('');
  }, [open]);

  const create = useMutation({
    mutationFn: () => {
      // Date + times entered in this modal are Pacific wall-clock —
      // matching how every shift renders elsewhere in the UI. Convert to
      // UTC at write time so the API layer keeps storing UTC. For the
      // template path the backend resolves the actual start/end from the
      // template; we anchor at 00:00 PT so the SHIFT date itself doesn't
      // skew by a day in case the backend retains our value.
      const startISO = templateId
        ? ptWallTimeToUtcIso(date, '00:00')
        : ptWallTimeToUtcIso(date, customStart);
      const endISO = templateId
        ? ptWallTimeToUtcIso(date, '00:00')
        : ptWallTimeToUtcIso(date, customEnd);
      return shiftsApi.create({
        client_id: clientId,
        caregiver_id: caregiverId,
        scheduled_start: startISO,
        scheduled_end: endISO,
        template_id: templateId ?? undefined,
      });
    },
    onSuccess: () => {
      pushToast({ variant: 'success', title: 'Shift created' });
      qc.invalidateQueries({ queryKey: ['shifts'] });
      onClose();
    },
    onError: () =>
      pushToast({ variant: 'error', title: 'Could not create shift' }),
  });

  if (!open) return null;

  const caregivers = (usersQuery.data ?? []).filter(
    (u) => u.role === 'caregiver' && u.status === 'active',
  );

  const canSubmit =
    Boolean(date && clientId && caregiverId) &&
    (templateId !== null || (customStart && customEnd));

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-[rgba(15,23,42,0.55)] px-4"
    >
      <div className="w-full max-w-lg bg-[var(--color-surface)] rounded-t-xl sm:rounded-xl shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Calendar size={16} style={{ color: 'var(--color-primary)' }} />
            <h2 className="font-display text-lg text-ink">Create shift</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-slate mb-1">
              Client
            </label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-white"
            >
              <option value="">Select a client…</option>
              {(clientsQuery.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.preferred_name || c.first_name} {c.last_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate mb-1">
              Caregiver
            </label>
            <select
              value={caregiverId}
              onChange={(e) => setCaregiverId(e.target.value)}
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-white"
            >
              <option value="">Select a caregiver…</option>
              {caregivers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.first_name} {u.last_name}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />

          <div>
            <span className="block text-sm font-medium text-slate mb-2">
              Shift template
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(templatesQuery.data ?? []).map((tpl) => (
                <TemplateCard
                  key={tpl.id}
                  template={tpl}
                  selected={templateId === tpl.id}
                  onClick={() => setTemplateId(tpl.id)}
                />
              ))}
              <button
                type="button"
                onClick={() => setTemplateId(null)}
                className={cn(
                  'rounded-md p-3 text-left transition-colors',
                )}
                style={{
                  border:
                    templateId === null
                      ? '2px solid var(--color-primary)'
                      : '1px solid var(--color-border)',
                  background:
                    templateId === null
                      ? 'var(--color-primary-pale, #EAF2FB)'
                      : 'transparent',
                }}
              >
                <div className="text-sm font-medium text-ink">
                  Custom times
                </div>
                <div className="text-xs text-muted-text mt-1">
                  Set start/end manually
                </div>
              </button>
            </div>
          </div>

          {templateId === null && (
            <div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Start time"
                  type="time"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
                <Input
                  label="End time"
                  type="time"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-text mt-1">
                Times are in Pacific time.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit}
            loading={create.isPending}
            onClick={() => create.mutate()}
          >
            Create shift
          </Button>
        </div>
      </div>
    </div>
  );
}

function TemplateCard({
  template,
  selected,
  onClick,
}: {
  template: ShiftTemplate;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md p-3 text-left transition-colors"
      style={{
        border: selected
          ? '2px solid var(--color-primary)'
          : '1px solid var(--color-border)',
        background: selected
          ? 'var(--color-primary-pale, #EAF2FB)'
          : 'transparent',
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="size-2 rounded-full"
          style={{ background: colorFor(template.color) }}
        />
        <div className="text-sm font-medium text-ink">{template.name}</div>
      </div>
      <div className="text-xs text-muted-text mt-1 font-mono">
        {trimSeconds(template.start_time)} – {trimSeconds(template.end_time)}
      </div>
    </button>
  );
}

function trimSeconds(t: string): string {
  return t.length > 5 ? t.slice(0, 5) : t;
}

export function colorFor(name: string | null | undefined): string {
  switch ((name ?? 'blue').toLowerCase()) {
    case 'blue':
      return 'var(--color-primary)';
    case 'purple':
      return '#7C3AED';
    case 'navy':
      return '#1E3A8A';
    case 'gold':
      return 'var(--color-gold)';
    case 'green':
      return '#059669';
    default:
      return 'var(--color-primary)';
  }
}

// Suppress unused-import warning for Card.
void Card;
