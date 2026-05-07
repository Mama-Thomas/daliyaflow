import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button, Textarea } from '@/components/ui';
import { flagsApi, SuggestedFlag } from '@/api/handoff';
import { getApiErrorMessage } from '@/api/client';
import { cn } from '@/utils/cn';
import { useUIStore } from '@/store/uiStore';

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'mobility_decline', label: 'Mobility decline' },
  { value: 'fall_concern', label: 'Fall concern' },
  { value: 'confusion_cognitive_change', label: 'Confusion / cognitive change' },
  { value: 'medication_issue', label: 'Medication issue' },
  { value: 'refusal_to_eat', label: 'Refusal to eat' },
  { value: 'hydration_concern', label: 'Hydration concern' },
  { value: 'hygiene_self_neglect', label: 'Hygiene / self-neglect' },
  { value: 'unsafe_home_environment', label: 'Unsafe home environment' },
  { value: 'mood_agitation', label: 'Mood / agitation' },
  { value: 'missed_visit', label: 'Missed visit' },
  { value: 'caregiver_continuity_issue', label: 'Caregiver continuity issue' },
  { value: 'social_isolation', label: 'Social isolation' },
  { value: 'supervisor_follow_up_needed', label: 'Supervisor follow-up needed' },
];

const SEVERITIES: { value: 'low' | 'medium' | 'high'; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export interface ManualFlagFormProps {
  shiftId: string;
  onCreated: (flag: SuggestedFlag) => void;
  onCancel: () => void;
}

export function ManualFlagForm({
  shiftId,
  onCreated,
  onCancel,
}: ManualFlagFormProps) {
  const pushToast = useUIStore((s) => s.pushToast);
  const [category, setCategory] = useState('');
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high' | ''>('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      flagsApi.createManual({
        shift_id: shiftId,
        category,
        severity: severity as 'low' | 'medium' | 'high',
        extracted_reason: reason.trim(),
      }),
    onSuccess: (flag) => {
      pushToast({ variant: 'success', title: 'Alert added' });
      onCreated(flag);
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  const valid =
    category && severity && reason.trim().length >= 20;

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!valid) return;
        createMutation.mutate();
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="manual-flag-category" className="text-sm font-medium text-slate">
          Category
        </label>
        <select
          id="manual-flag-category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="border border-border rounded-md px-3 py-2 text-base bg-white text-ink"
          required
        >
          <option value="" disabled>
            Pick a category…
          </option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-slate">Severity</span>
        <div className="flex gap-2" role="radiogroup" aria-label="Severity">
          {SEVERITIES.map((s) => (
            <button
              key={s.value}
              role="radio"
              aria-checked={severity === s.value}
              type="button"
              onClick={() => setSeverity(s.value)}
              className={cn(
                'flex-1 px-3 py-2 rounded-md border-2 text-sm font-medium min-h-[44px] transition-colors',
                severity === s.value
                  ? s.value === 'high'
                    ? 'border-[var(--color-risk-high)] text-[var(--color-risk-high)] bg-[var(--color-risk-high-pale)]'
                    : s.value === 'medium'
                      ? 'border-[var(--color-risk-medium)] text-[var(--color-risk-medium)] bg-[var(--color-risk-medium-pale)]'
                      : 'border-[var(--color-risk-low)] text-[var(--color-risk-low)] bg-[var(--color-risk-low-pale)]'
                  : 'border-border text-slate hover:border-forest',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <Textarea
        label="What did you observe?"
        rows={4}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Describe what you observed..."
        helperText={
          reason.trim().length < 20
            ? `${reason.trim().length} / 20 characters minimum`
            : undefined
        }
      />

      {error && (
        <p
          role="alert"
          className="text-sm text-[var(--color-error)] bg-[var(--color-risk-high-pale)] border border-[var(--color-error-border)] rounded-md px-3 py-2"
        >
          {error}
        </p>
      )}

      <div className="flex gap-2 justify-end pt-2">
        <Button variant="ghost" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!valid}
          loading={createMutation.isPending}
        >
          Add alert
        </Button>
      </div>
    </form>
  );
}
