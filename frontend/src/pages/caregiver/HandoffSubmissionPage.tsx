import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronLeft,
  FileText,
  Globe,
  Loader2,
  Mic,
  Pencil,
  Plus,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { HandoffSummaryBlock } from '@/components/handoff/HandoffSummaryBlock';
import { RiskFlagCard } from '@/components/flags/RiskFlagCard';
import { VoiceNoteRecorder } from '@/components/handoff/VoiceNoteRecorder';
import { StepIndicator } from '@/components/handoff/StepIndicator';
import { ManualFlagForm } from '@/components/flags/ManualFlagForm';
import {
  handoffApi,
  flagsApi,
  HandoffStatus,
  NoteLanguageMeta,
  SuggestedFlag,
  TranslateResult,
} from '@/api/handoff';
import { shiftsApi } from '@/api/shifts';
import { clientsApi } from '@/api/clients';
import { DISPLAY_TIME_ZONE, formatCategory, fullDate } from '@/utils/format';
import { getApiErrorMessage } from '@/api/client';
import { cn } from '@/utils/cn';

const PLACEHOLDER =
  'What happened this shift?\n' +
  'Any changes since last time?\n' +
  'What should the next caregiver know?\n' +
  'Anything not completed?\n' +
  'Any concerns to flag?';

type Step = 1 | 2 | 3 | 'done';

const LANGUAGE_OPTIONS: { code: string; label: string }[] = [
  { code: 'en', label: 'English (default)' },
  { code: 'fr', label: 'French' },
  { code: 'es', label: 'Spanish' },
  { code: 'zh', label: 'Chinese (Simplified)' },
  { code: 'tl', label: 'Tagalog' },
  { code: 'ar', label: 'Arabic' },
  { code: 'am', label: 'Amharic' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'other', label: 'Other' },
];

function languageLabelFor(code: string): string {
  return LANGUAGE_OPTIONS.find((o) => o.code === code)?.label ?? code;
}

const TRANSLATE_CONFIDENCE_THRESHOLD = 0.7;

const PROGRESS_MESSAGES = [
  { atSec: 0, text: 'Analyzing your notes...' },
  { atSec: 3, text: 'Structuring handoff...' },
  { atSec: 6, text: 'Extracting risk signals...' },
  { atSec: 10, text: 'Almost ready...' },
];

function progressLabelFor(elapsedSec: number) {
  let label = PROGRESS_MESSAGES[0].text;
  for (const m of PROGRESS_MESSAGES) {
    if (elapsedSec >= m.atSec) label = m.text;
  }
  return label;
}

const SUPPORTS_RECORDER =
  typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined';

function draftKey(shiftId: string) {
  return `daliyaflow:draft:${shiftId}`;
}

interface NoteQualityIssue {
  type: 'too_short' | 'missing_tasks' | 'missing_followup';
  message: string;
}

function checkNoteQuality(text: string): NoteQualityIssue[] {
  const issues: NoteQualityIssue[] = [];
  const words = text.trim().split(/\s+/).filter(Boolean);

  if (words.length < 30) {
    issues.push({
      type: 'too_short',
      message: 'Your note is quite short. More detail helps the next caregiver.',
    });
  }

  const hasTask = /complet|finish|did|gave|helped|assist/i.test(text);
  if (!hasTask) {
    issues.push({
      type: 'missing_tasks',
      message: 'Consider adding what tasks you completed this shift.',
    });
  }

  const hasConcern = /concern|watch|note|follow|check|monitor/i.test(text);
  const isSubstantial = text.length > 100;
  if (isSubstantial && !hasConcern) {
    issues.push({
      type: 'missing_followup',
      message: 'Is there anything for the next caregiver to watch for?',
    });
  }

  return issues;
}

export default function HandoffSubmissionPage() {
  const { shiftId = '' } = useParams<{ shiftId: string }>();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>(1);
  const [mode, setMode] = useState<'text' | 'voice'>(
    SUPPORTS_RECORDER ? 'text' : 'text',
  );
  const [text, setText] = useState('');
  const [audio, setAudio] = useState<Blob | null>(null);
  const [transcriptDraft, setTranscriptDraft] = useState('');
  const [transcriptStatus, setTranscriptStatus] = useState<
    'idle' | 'transcribing' | 'ready' | 'unavailable'
  >('idle');
  const [transcriptMessage, setTranscriptMessage] = useState<string>('');
  // Sprint 8 / Step 7: history of past completed transcript sessions so a
  // re-record APPENDS rather than replaces. Joined with a "— continued —"
  // separator on display and on submit.
  const [transcriptHistory, setTranscriptHistory] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reviewedFlags, setReviewedFlags] = useState<
    Record<string, 'confirmed' | 'dismissed' | 'escalated'>
  >({});
  const [editingSection, setEditingSection] = useState<null | string>(null);
  const [sectionEdits, setSectionEdits] = useState<
    Record<string, string | string[]>
  >({});
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [progressStartedAt, setProgressStartedAt] = useState<Date | null>(null);
  const [progressTick, setProgressTick] = useState(0);
  const progressTimer = useRef<number | null>(null);
  const [manualSheetOpen, setManualSheetOpen] = useState(false);
  const [manualFlags, setManualFlags] = useState<SuggestedFlag[]>([]);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [showNudge, setShowNudge] = useState(false);
  const [nudgeIssues, setNudgeIssues] = useState<NoteQualityIssue[]>([]);
  const [textLanguage, setTextLanguage] = useState<string>('en');
  const [pendingTranslation, setPendingTranslation] =
    useState<TranslateResult | null>(null);
  const [originalDraft, setOriginalDraft] = useState<string>('');
  const [englishDraft, setEnglishDraft] = useState<string>('');
  const [englishEditable, setEnglishEditable] = useState(false);

  function goToStep(next: Step) {
    const numericNext = next === 'done' ? 4 : next;
    const numericCurrent = step === 'done' ? 4 : step;
    setDirection(numericNext > numericCurrent ? 'forward' : 'back');
    setStep(next);
  }

  // Hydrate draft from localStorage on mount
  useEffect(() => {
    try {
      const cached = window.localStorage.getItem(draftKey(shiftId));
      if (cached) setText(cached);
    } catch {
      /* ignore */
    }
  }, [shiftId]);

  // Autosave every 10s when editing
  useEffect(() => {
    if (step !== 1 || mode !== 'text') return;
    const id = window.setInterval(() => {
      if (text.length > 0) {
        try {
          window.localStorage.setItem(draftKey(shiftId), text);
          setSavedAt(new Date());
        } catch {
          /* ignore */
        }
      }
    }, 10_000);
    return () => window.clearInterval(id);
  }, [text, step, mode, shiftId]);

  const translateMutation = useMutation({
    mutationFn: (vars: { text: string; sourceLang?: string }) =>
      handoffApi.translate(shiftId, vars.text, vars.sourceLang),
  });

  function handleTranslationResult(
    result: TranslateResult,
    context: 'text' | 'voice',
  ) {
    const isEnglish = result.detected_language === 'en';
    const lowConfidence = result.confidence < TRANSLATE_CONFIDENCE_THRESHOLD;
    if (isEnglish || lowConfidence) {
      // Skip the review step — proceed as English. The note text is what
      // it already is (transcript or text input).
      setPendingTranslation(null);
      void context;
      return;
    }
    setPendingTranslation(result);
    setOriginalDraft(result.original_text);
    setEnglishDraft(result.translated_text);
    setEnglishEditable(false);
    void context;
  }

  const transcribeMutation = useMutation({
    mutationFn: (blob: Blob) => handoffApi.transcribeVoice(shiftId, blob),
    onMutate: () => {
      setTranscriptStatus('transcribing');
      setTranscriptMessage('');
    },
    onSuccess: async (data) => {
      if (!data.available || (data.transcript ?? '').trim().length === 0) {
        setTranscriptStatus('unavailable');
        setTranscriptMessage(
          data.message ||
            'Transcription unavailable — summarize what you said (optional).',
        );
      } else {
        setTranscriptStatus('ready');
        // Step 7 — append on re-record. Combine prior history with the new
        // final transcript so subsequent recordings extend, not erase.
        const combined = [...transcriptHistory, data.transcript]
          .filter((s) => s && s.trim().length > 0)
          .join(' — continued — ');
        setTranscriptDraft(combined);
        setTranscriptHistory((h) => [...h, data.transcript]);
        // Auto-detect language. If non-English with confidence, the
        // translation review UI will swap in.
        try {
          const result = await translateMutation.mutateAsync({
            text: combined,
          });
          handleTranslationResult(result, 'voice');
        } catch {
          // Translation is best-effort — silently treat as English.
        }
      }
    },
    onError: () => {
      setTranscriptStatus('unavailable');
      setTranscriptMessage(
        'Transcription unavailable — summarize what you said (optional).',
      );
    },
  });

  // Auto-transcribe whenever a fresh blob arrives.
  useEffect(() => {
    if (mode !== 'voice' || !audio) return;
    transcribeMutation.mutate(audio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audio]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      // Translation flow: if a translation has been confirmed, store English
      // as raw_text (so the AI pipeline reads it natively) plus the
      // language metadata for source-note display.
      let langMeta: NoteLanguageMeta | undefined;
      let englishText = text;
      let voiceTranscript = transcriptDraft || text;
      if (pendingTranslation && englishDraft) {
        langMeta = {
          original_language: pendingTranslation.detected_language,
          language_name: pendingTranslation.language_name,
          original_text: originalDraft,
          translated_text: englishDraft,
        };
        englishText = englishDraft;
        voiceTranscript = englishDraft;
      } else if (mode === 'text' && textLanguage === 'en') {
        langMeta = { original_language: 'en' };
      }
      if (mode === 'voice' && audio) {
        return handoffApi.submitVoice(
          shiftId,
          audio,
          voiceTranscript,
          langMeta,
        );
      }
      return handoffApi.submitText(shiftId, englishText, langMeta);
    },
    onSuccess: () => {
      goToStep(2);
      setError(null);
      setProgressStartedAt(new Date());
      try {
        window.localStorage.removeItem(draftKey(shiftId));
      } catch {
        /* ignore */
      }
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  // Drive the friendly progress message while polling
  useEffect(() => {
    if (step !== 2 || !progressStartedAt) return;
    progressTimer.current = window.setInterval(() => {
      setProgressTick((t) => t + 1);
    }, 1000);
    return () => {
      if (progressTimer.current) window.clearInterval(progressTimer.current);
    };
  }, [step, progressStartedAt]);

  const elapsedSec = progressStartedAt
    ? Math.floor((Date.now() - progressStartedAt.getTime()) / 1000)
    : 0;

  // Sprint 8: pull shift + client so the success screen can show the
  // client's preferred name + shift date and any high-severity context.
  const shiftQuery = useQuery({
    queryKey: ['shift', shiftId],
    queryFn: () => shiftsApi.get(shiftId),
  });

  const clientQuery = useQuery({
    queryKey: ['client', shiftQuery.data?.client_id],
    queryFn: () => clientsApi.get(shiftQuery.data!.client_id),
    enabled: !!shiftQuery.data?.client_id,
  });

  const statusQuery = useQuery<HandoffStatus>({
    queryKey: ['handoff-status', shiftId],
    queryFn: () => handoffApi.pollStatus(shiftId),
    enabled: step === 2,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 2000;
      if (data.status === 'complete' || data.status === 'failed') return false;
      return 2000;
    },
  });

  const handoff = statusQuery.data;
  const baseSummary = handoff?.handoff_summary ?? null;
  const summary = useMemo(() => {
    if (!baseSummary) return null;
    return {
      ...baseSummary,
      ...sectionEdits,
    };
  }, [baseSummary, sectionEdits]);

  const flags: SuggestedFlag[] = [
    ...(handoff?.suggested_flags ?? []),
    ...manualFlags,
  ];
  const allFlagsReviewed =
    flags.length === 0 ||
    flags.every(
      (f) => reviewedFlags[f.id] !== undefined || f.status !== 'suggested',
    );

  const finalizeMutation = useMutation({
    mutationFn: () => {
      if (!handoff?.handoff_id) throw new Error('Handoff is not ready yet.');
      return handoffApi.finalize(handoff.handoff_id);
    },
    onSuccess: () => goToStep('done'),
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  const flagMutation = useMutation({
    mutationFn: ({
      flagId,
      action,
    }: {
      flagId: string;
      action: 'confirmed' | 'dismissed' | 'escalated';
    }) => flagsApi.patch(flagId, { status: action }),
    onSuccess: (_, { flagId, action }) => {
      setReviewedFlags((s) => ({ ...s, [flagId]: action }));
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  const charCount = text.length;
  const wordCount = useMemo(
    () => text.trim().split(/\s+/).filter(Boolean).length,
    [text],
  );
  const showWordNudge = step === 1 && mode === 'text' && wordCount > 0 && wordCount < 20;

  return (
    <div className="min-h-screen bg-surface pb-32">
      <header className="sticky top-0 z-10 bg-white border-b border-border px-3 py-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="size-10 rounded-full hover:bg-forest-pale text-slate hover:text-forest flex items-center justify-center"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="flex-1">
          <StepIndicator
            current={step === 'done' ? 3 : step}
            total={3}
            labels={['Capture', 'Review', 'Flags']}
          />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {error && (
          <div
            role="alert"
            className="text-sm text-[var(--color-error)] bg-[var(--color-risk-high-pale)] border border-[var(--color-error-border)] rounded-md px-3 py-2"
          >
            {error}
          </div>
        )}

        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={String(step)}
            custom={direction}
            variants={{
              enter: (d: 'forward' | 'back') => ({
                x: d === 'forward' ? '100%' : '-100%',
                opacity: 0,
              }),
              center: { x: 0, opacity: 1 },
              exit: (d: 'forward' | 'back') => ({
                x: d === 'forward' ? '-100%' : '100%',
                opacity: 0,
              }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="space-y-5"
          >

        {step === 1 && pendingTranslation && (
          <Card>
            <div className="mb-4 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-forest bg-forest-pale">
                <Globe size={12} aria-hidden /> Detected:{' '}
                {pendingTranslation.language_name}
              </span>
            </div>
            <h1 className="font-display text-2xl text-ink mb-1">
              Confirm your translation
            </h1>
            <p className="text-sm text-slate mb-5">
              We translated your note to English so the next caregiver and
              your coordinator can read it. Edit either side if anything
              needs fixing.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-md p-3 bg-surface border border-border">
                <h3 className="text-xs font-semibold text-slate mb-2 uppercase tracking-wide">
                  Your note in {pendingTranslation.language_name}
                </h3>
                <Textarea
                  rows={8}
                  value={originalDraft}
                  onChange={(e) => setOriginalDraft(e.target.value)}
                />
              </div>
              <div className="rounded-md p-3 bg-white border border-border">
                <h3 className="text-xs font-semibold text-slate mb-2 uppercase tracking-wide">
                  Translated to English
                </h3>
                <Textarea
                  rows={8}
                  value={englishDraft}
                  onChange={(e) => setEnglishDraft(e.target.value)}
                  disabled={!englishEditable}
                />
              </div>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <Button
                size="lg"
                fullWidth
                loading={submitMutation.isPending}
                onClick={() => {
                  setError(null);
                  submitMutation.mutate();
                }}
              >
                Looks good, continue
              </Button>
              <Button
                variant="ghost"
                size="lg"
                onClick={() => setEnglishEditable(true)}
                disabled={englishEditable}
              >
                {englishEditable ? 'Editing translation' : 'Edit translation'}
              </Button>
            </div>
            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={() => {
                  setPendingTranslation(null);
                  setEnglishEditable(false);
                }}
                className="text-xs text-slate hover:text-forest"
              >
                Back to edit raw note
              </button>
            </div>
          </Card>
        )}

        {step === 1 && !pendingTranslation && (
          <Card>
            <h1 className="font-display text-2xl text-ink mb-1">
              Capture your shift note
            </h1>
            <p className="text-sm text-slate mb-5">
              Tell us how the shift went. We'll structure it into a handoff in a moment.
            </p>

            <div
              role="tablist"
              aria-label="Input mode"
              className="inline-flex bg-forest-pale rounded-md p-1 mb-4"
            >
              {(['text', 'voice'] as const).map((m) => (
                <button
                  key={m}
                  role="tab"
                  type="button"
                  aria-selected={mode === m}
                  onClick={() => setMode(m)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors min-h-[36px]',
                    mode === m
                      ? 'bg-white text-forest shadow-xs'
                      : 'text-slate hover:text-forest',
                  )}
                >
                  {m === 'text' ? <FileText size={14} /> : <Mic size={14} />}
                  {m === 'text' ? 'Text' : 'Voice'}
                </button>
              ))}
            </div>

            {mode === 'text' ? (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <label
                    htmlFor="note-language"
                    className="inline-flex items-center gap-1.5 text-xs text-slate"
                  >
                    <Globe size={14} className="text-forest" /> Language
                  </label>
                  <select
                    id="note-language"
                    value={textLanguage}
                    onChange={(e) => setTextLanguage(e.target.value)}
                    className="text-sm rounded-md border border-border bg-white px-2 py-1.5 text-ink focus:outline-none focus:border-forest"
                  >
                    {LANGUAGE_OPTIONS.map((o) => (
                      <option key={o.code} value={o.code}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <Textarea
                  label="Shift notes"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={9}
                  placeholder={
                    textLanguage === 'en' || textLanguage === 'other'
                      ? PLACEHOLDER
                      : `Type your note in ${languageLabelFor(textLanguage)}...`
                  }
                />
                <div className="flex items-center justify-between text-xs mt-2">
                  <span className="text-muted-text">
                    {savedAt
                      ? `Draft saved ${savedAt.toLocaleTimeString(undefined, {
                          hour: 'numeric',
                          minute: '2-digit',
                          timeZone: DISPLAY_TIME_ZONE,
                        })}`
                      : ''}
                  </span>
                  <span
                    className={cn(
                      'font-mono',
                      charCount >= 50 ? 'text-forest' : 'text-muted-text',
                    )}
                  >
                    {charCount.toLocaleString()} / 10,000
                  </span>
                </div>
                {showWordNudge && (
                  <p className="text-xs text-[var(--color-warning)] mt-2">
                    Add a little more detail — at least 20 words helps the AI build
                    a useful handoff.
                  </p>
                )}
              </>
            ) : SUPPORTS_RECORDER ? (
              <>
                <VoiceNoteRecorder
                  onComplete={(blob) => {
                    setAudio(blob);
                    setTranscriptStatus('idle');
                    setTranscriptMessage('');
                  }}
                  onError={(msg) => setError(msg)}
                />
                {audio && transcriptStatus === 'transcribing' && (
                  <div
                    role="status"
                    aria-live="polite"
                    className="mt-3 rounded-md border border-border bg-forest-pale/50 px-4 py-3 text-sm text-slate flex items-center gap-2"
                  >
                    <Loader2
                      size={14}
                      className="animate-spin text-forest"
                      aria-hidden
                    />
                    Transcribing...
                  </div>
                )}
                {audio && transcriptStatus === 'ready' && (
                  <>
                    <Textarea
                      label="Transcript — tap to edit"
                      value={transcriptDraft}
                      onChange={(e) => setTranscriptDraft(e.target.value)}
                      rows={4}
                      placeholder="Tap to edit the transcript."
                      helperText={
                        transcriptHistory.length > 1
                          ? `Combined from ${transcriptHistory.length} recordings — tap record again to add more, or clear below.`
                          : 'Tap record again to add more — new audio appends to this transcript.'
                      }
                    />
                    <div className="mt-2 flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setTranscriptDraft('');
                          setTranscriptHistory([]);
                        }}
                      >
                        Clear transcript
                      </Button>
                    </div>
                  </>
                )}
                {audio && transcriptStatus === 'unavailable' && (
                  <Textarea
                    label="Transcript (optional)"
                    value={transcriptDraft}
                    onChange={(e) => setTranscriptDraft(e.target.value)}
                    rows={4}
                    placeholder={
                      transcriptMessage ||
                      'Transcription unavailable — summarize what you said (optional)'
                    }
                    helperText={transcriptMessage || undefined}
                  />
                )}
              </>
            ) : (
              <div className="rounded-md bg-gold-light p-4 text-sm text-ink">
                <p className="font-medium mb-1">
                  Voice recording isn't supported on this browser.
                </p>
                <p className="text-slate">
                  Please switch to text mode and we'll generate the handoff from your
                  written note.
                </p>
              </div>
            )}

            {showNudge && nudgeIssues.length > 0 && (
              <div
                role="status"
                className="mt-4 rounded-md p-4"
                style={{
                  background: 'var(--color-gold-light)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <p
                  className="text-sm font-medium mb-2"
                  style={{ color: 'var(--color-text)' }}
                >
                  A few quick suggestions
                </p>
                <ul className="text-sm list-disc list-inside space-y-1">
                  {nudgeIssues.map((i) => (
                    <li key={i.type} style={{ color: 'var(--color-text)' }}>
                      {i.message}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowNudge(false)}
                  >
                    Add more detail
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setShowNudge(false);
                      setError(null);
                      submitMutation.mutate();
                    }}
                  >
                    Continue anyway
                  </Button>
                </div>
              </div>
            )}

            <div className="mt-6">
              <Button
                fullWidth
                size="lg"
                loading={
                  submitMutation.isPending || translateMutation.isPending
                }
                disabled={
                  mode === 'text'
                    ? charCount < 50
                    : // Voice mode: need an audio blob, transcription must
                      // not still be running, and (transcript ready OR the
                      // user can submit without one — Whisper unavailable
                      // path is allowed).
                      !audio ||
                      transcriptStatus === 'transcribing' ||
                      transcriptStatus === 'idle' ||
                      translateMutation.isPending
                }
                onClick={async () => {
                  setError(null);
                  if (mode === 'text') {
                    if (textLanguage !== 'en') {
                      // Non-English text path: translate first, then either
                      // show review (non-English detected) or submit
                      // directly (English detected / low confidence).
                      try {
                        const result = await translateMutation.mutateAsync({
                          text,
                          sourceLang:
                            textLanguage === 'other' ? undefined : textLanguage,
                        });
                        if (
                          result.detected_language === 'en' ||
                          result.confidence < TRANSLATE_CONFIDENCE_THRESHOLD
                        ) {
                          submitMutation.mutate();
                          return;
                        }
                        handleTranslationResult(result, 'text');
                        return;
                      } catch (err) {
                        setError(getApiErrorMessage(err));
                        return;
                      }
                    }
                    const issues = checkNoteQuality(text);
                    if (issues.length > 0 && !showNudge) {
                      setNudgeIssues(issues);
                      setShowNudge(true);
                      return;
                    }
                  }
                  submitMutation.mutate();
                }}
              >
                {submitMutation.isPending
                  ? 'Generating...'
                  : translateMutation.isPending
                    ? 'Translating...'
                    : 'Generate handoff'}
              </Button>
            </div>
          </Card>
        )}

        {step === 2 && (
          <>
            <h1 className="font-display text-2xl text-ink">
              Review your handoff
            </h1>
            <p className="text-sm text-slate">
              Tap any section to edit before you send it on.
            </p>

            {!handoff || handoff.status !== 'complete' ? (
              <Card>
                <Skeleton className="h-5 w-1/3 mb-4" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-2/3" />
                <p className="text-xs text-muted-text mt-6 italic font-mono">
                  {progressLabelFor(elapsedSec)}{' '}
                  <span aria-hidden>{'.'.repeat((progressTick % 3) + 1)}</span>
                </p>
              </Card>
            ) : (
              <>
                <SummaryReview
                  summary={summary as never}
                  onEditSection={(label) => setEditingSection(label)}
                />
                <p className="text-xs text-muted-text italic">
                  AI suggestions are a starting point. Review and edit before submitting.
                </p>
                <div className="flex gap-3">
                  <Button
                    variant="secondary"
                    leftIcon={<Pencil size={14} />}
                    onClick={() => goToStep(1)}
                  >
                    Edit raw note
                  </Button>
                  <Button
                    fullWidth
                    onClick={() => goToStep(3)}
                    disabled={!handoff.handoff_id}
                  >
                    Looks good, review flags
                  </Button>
                </div>
              </>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="font-display text-2xl text-ink">
              Suggested alerts
            </h1>
            <p className="text-sm text-slate">
              Review each alert before submitting. You can confirm, dismiss, or
              escalate.
            </p>
            {flags.length > 0 && (
              <div className="text-xs font-mono text-slate">
                {Object.keys(reviewedFlags).length} of {flags.length} reviewed
              </div>
            )}

            {flags.length === 0 && (
              <Card>
                <p className="text-sm text-slate">
                  No alerts were detected for this shift. You can still add one
                  manually below.
                </p>
              </Card>
            )}

            <div className="space-y-3">
              {flags.map((f) => {
                const action = reviewedFlags[f.id];
                const isReviewed = !!action || f.status !== 'suggested';
                return (
                  <RiskFlagCard
                    key={f.id}
                    category={f.category}
                    severity={f.severity}
                    reason={f.extracted_reason}
                    status={action ?? (isReviewed ? f.status : 'suggested')}
                    onConfirm={
                      isReviewed
                        ? undefined
                        : () =>
                            flagMutation.mutate({
                              flagId: f.id,
                              action: 'confirmed',
                            })
                    }
                    onDismiss={
                      isReviewed
                        ? undefined
                        : () =>
                            flagMutation.mutate({
                              flagId: f.id,
                              action: 'dismissed',
                            })
                    }
                    onEscalate={
                      isReviewed
                        ? undefined
                        : () =>
                            flagMutation.mutate({
                              flagId: f.id,
                              action: 'escalated',
                            })
                    }
                  />
                );
              })}
            </div>

            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Plus size={14} />}
              onClick={() => setManualSheetOpen(true)}
            >
              Add a flag manually
            </Button>

            <BottomSheet
              open={manualSheetOpen}
              title="Add an alert"
              onClose={() => setManualSheetOpen(false)}
            >
              <ManualFlagForm
                shiftId={shiftId}
                onCreated={(flag) => {
                  setManualFlags((s) => [...s, flag]);
                  setReviewedFlags((s) => ({ ...s, [flag.id]: 'confirmed' }));
                  setManualSheetOpen(false);
                }}
                onCancel={() => setManualSheetOpen(false)}
              />
            </BottomSheet>

            <div className="pt-4">
              <Button
                fullWidth
                size="lg"
                loading={finalizeMutation.isPending}
                disabled={!allFlagsReviewed}
                onClick={() => finalizeMutation.mutate()}
              >
                Submit handoff
              </Button>
              {!allFlagsReviewed && (
                <p className="text-xs text-muted-text mt-2 text-center">
                  Review every alert before submitting.
                </p>
              )}
            </div>
          </>
        )}

        {step === 'done' && (
          <SubmissionSuccess
            clientName={
              clientQuery.data?.preferred_name ||
              clientQuery.data?.first_name ||
              null
            }
            shiftDate={
              shiftQuery.data?.scheduled_start
                ? fullDate(new Date(shiftQuery.data.scheduled_start))
                : null
            }
            highConfirmedCategories={flags
              .filter(
                (f) =>
                  f.severity === 'high' &&
                  reviewedFlags[f.id] === 'confirmed',
              )
              .map((f) => formatCategory(f.category))}
            supervisorAttention={Boolean(
              (summary as { supervisor_attention_needed?: boolean })
                ?.supervisor_attention_needed,
            )}
            onHome={() => navigate('/caregiver/home')}
            onView={() =>
              handoff?.handoff_id &&
              navigate(`/caregiver/shifts/${shiftId}`)
            }
          />
        )}
          </motion.div>
        </AnimatePresence>

        {editingSection !== null && summary && (
          <SectionEditModal
            label={editingSection}
            initial={
              (summary as Record<string, unknown>)[editingSection] as unknown
            }
            onCancel={() => setEditingSection(null)}
            onSave={(value) => {
              setSectionEdits((s) => ({ ...s, [editingSection]: value }));
              setEditingSection(null);
            }}
          />
        )}
      </main>
    </div>
  );
}

function SummaryReview({
  summary,
  onEditSection,
}: {
  summary: {
    summary_overview?: string;
    notable_changes?: string;
    tasks_completed?: string[];
    tasks_pending?: string[];
    follow_up_items?: string[];
    supervisor_attention_needed?: boolean;
    supervisor_attention_reason?: string;
    confidence_score?: number;
  };
  onEditSection: (label: string) => void;
}) {
  const lowConfidence =
    typeof summary.confidence_score === 'number' &&
    summary.confidence_score < 0.7;

  return (
    <div className="space-y-3">
      {lowConfidence && (
        <div
          role="status"
          className="flex items-start gap-2 text-xs text-[var(--color-gold)] bg-gold-light rounded-md px-3 py-2"
        >
          <AlertTriangle size={14} className="mt-0.5" />
          <span>
            Review carefully — the AI flagged this as a low-confidence
            generation.
          </span>
        </div>
      )}
      <HandoffSummaryBlock
        summary={summary as never}
        generated
        onEdit={() => onEditSection('summary_overview')}
      />
      <details className="text-xs text-muted-text">
        <summary className="cursor-pointer">Edit other sections</summary>
        <div className="flex flex-wrap gap-2 mt-2">
          {[
            'summary_overview',
            'notable_changes',
            'tasks_completed',
            'tasks_pending',
            'follow_up_items',
            'supervisor_attention_reason',
          ].map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => onEditSection(label)}
              className="px-2 py-1 rounded-md border border-border text-slate hover:text-forest hover:border-forest"
            >
              {label.replaceAll('_', ' ')}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}

function SectionEditModal({
  label,
  initial,
  onCancel,
  onSave,
}: {
  label: string;
  initial: unknown;
  onCancel: () => void;
  onSave: (value: string | string[]) => void;
}) {
  const isList = Array.isArray(initial);
  const [value, setValue] = useState<string>(
    isList ? (initial as string[]).join('\n') : (initial as string) ?? '',
  );

  return (
    <div className="fixed inset-0 z-50 bg-ink/50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-xl p-5 animate-fade-in-up">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="font-display text-lg text-ink capitalize">
            {label.replaceAll('_', ' ')}
          </h3>
          <Badge variant="pending">Edited</Badge>
        </div>
        <Textarea
          rows={6}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          helperText={
            isList
              ? 'One item per line.'
              : 'Plain text.'
          }
        />
        <div className="mt-4 flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              const next = isList
                ? value
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean)
                : value;
              onSave(next);
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function SubmissionSuccess({
  clientName,
  shiftDate,
  highConfirmedCategories,
  supervisorAttention,
  onHome,
  onView,
}: {
  clientName: string | null;
  shiftDate: string | null;
  highConfirmedCategories: string[];
  supervisorAttention: boolean;
  onHome: () => void;
  onView: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6"
    >
      <DahliaBloom />

      <div className="mt-6 daliya-success-text-fade">
        <h2 className="font-display text-2xl text-ink mb-1">
          Handoff submitted
        </h2>
        {(clientName || shiftDate) && (
          <p className="text-base text-muted-text">
            {clientName}
            {clientName && shiftDate ? ' · ' : ''}
            {shiftDate}
          </p>
        )}
        {highConfirmedCategories.length > 0 && (
          <p className="mt-3 text-sm text-forest">
            Your coordinator has been notified about{' '}
            {humanList(highConfirmedCategories)}
          </p>
        )}
        {supervisorAttention && (
          <p className="mt-2 text-sm text-[var(--color-gold)]">
            Flagged for supervisor review
          </p>
        )}
      </div>

      <div className="mt-8 flex flex-col gap-2 w-full max-w-xs daliya-success-text-fade">
        <Button fullWidth onClick={onHome}>
          Back to home
        </Button>
        <Button variant="ghost" fullWidth onClick={onView}>
          View submitted handoff
        </Button>
      </div>
    </div>
  );
}

function humanList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * A subtle dahlia that blooms open — eight petals stagger-animate from the
 * center outward (~80ms per petal). One accent petal in gold, the rest in
 * primary at 20% opacity. Total bloom: ~880ms; the surrounding text waits
 * to fade in until ~1000ms.
 *
 * Keyframes are scoped via a single inline <style> block so this component
 * stays self-contained — the success screen is a one-off moment and does
 * not need first-class entries in tokens.css / globals.css.
 */
function DahliaBloom() {
  const petals = Array.from({ length: 8 }, (_, i) => {
    const angle = (i * 360) / 8;
    const isAccent = i === 1; // single gold accent petal
    const delay = i * 80; // ms — outward stagger
    return { angle, isAccent, delay };
  });

  return (
    <div
      aria-hidden
      className="relative size-[80px]"
      style={{
        // Trigger the cascade once on mount.
        animation: 'daliya-success-fade 600ms ease-out both',
      }}
    >
      <style>{`
        @keyframes daliya-petal-bloom {
          0%   { transform: translate(-50%, -50%) rotate(var(--angle)) scale(0.3); opacity: 0; }
          100% { transform: translate(-50%, -50%) rotate(var(--angle)) scale(1);   opacity: 1; }
        }
        @keyframes daliya-success-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .daliya-success-text-fade {
          animation: daliya-text-fade 500ms ease-out 1000ms both;
        }
        @keyframes daliya-text-fade {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      {petals.map((p, i) => (
        <span
          key={i}
          className="absolute left-1/2 top-1/2"
          style={
            {
              '--angle': `${p.angle}deg`,
              width: '20px',
              height: '40px',
              borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%',
              transformOrigin: '50% 100%',
              background: p.isAccent
                ? 'var(--color-gold)'
                : 'rgba(43,108,176,0.20)',
              animation: `daliya-petal-bloom 600ms ease-out ${p.delay}ms both`,
              transform: 'translate(-50%, -50%)',
            } as React.CSSProperties
          }
        />
      ))}
      {/* small center disc */}
      <span
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: '12px',
          height: '12px',
          background: 'var(--color-primary)',
          opacity: 0.85,
          animation:
            'daliya-petal-bloom 500ms ease-out 720ms both',
          // re-use --angle so the keyframe’s rotate(var(--angle)) is a no-op for the disc
          // (just a 0deg rotation). It still animates scale + opacity from 0.3→1.
          // eslint-disable-next-line
          ['--angle' as never]: '0deg',
        }}
      />
    </div>
  );
}
