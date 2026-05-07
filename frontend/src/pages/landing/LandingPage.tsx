import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import {
  AlertTriangle,
  BarChart2,
  CheckCircle2,
  ClipboardList,
  FileText,
  Leaf,
  Loader2,
  Mic,
  Shield,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';
import { apiClient } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Input } from '@/components/ui/Input';
import { HandoffSummaryBlock } from '@/components/handoff/HandoffSummaryBlock';
import { RiskFlagCard } from '@/components/flags/RiskFlagCard';
import { VoiceNoteRecorder } from '@/components/handoff/VoiceNoteRecorder';
import { waitlistApi } from '@/api/users';
import { useUIStore } from '@/store/uiStore';
import { cn } from '@/utils/cn';

type DemoFlag = {
  category: string;
  severity: 'high' | 'medium' | 'low';
  extracted_reason: string;
};

interface DemoResult {
  summary_overview: string;
  notable_changes?: string;
  tasks_completed?: string[];
  tasks_pending?: string[];
  follow_up_items?: string[];
  supervisor_attention_needed?: boolean;
  risk_flags?: DemoFlag[];
}

const EXAMPLES = {
  routine: {
    label: 'Routine shift',
    text: "Got there at 9am. Mr. Harold was in good spirits today. Helped him shower — he needed a bit more assistance than usual and seemed unsteady on his feet. Ate all his breakfast. Gave him his morning meds, no problem. His daughter called and he seemed happy after. Left at 3. Moved some clutter in the living room so he has a clear path to the bathroom.",
  },
  medication: {
    label: 'Medication concern',
    text: "Arrived 10:30am. James was asleep, let him sleep until 11. Lunch was good, he ate well. He refused his exercises, said his back hurt too much. I could not find his evening blood pressure medication — checked the usual spot and the bathroom cabinet, not there. Called the coordinator but no answer. Left a note on the fridge. Had to leave at 2:30 for my next shift.",
  },
  cognitive: {
    label: 'Cognitive change',
    text: "Ms. Eleanor was really confused when I got there — didn't know what day it was and kept asking for her husband who passed last year. She refused lunch, barely touched it. Got agitated around 2pm but calmed down when I talked to her quietly. Meds were fine. The apartment smelled off — checked and the bathroom trash hadn't been emptied in days.",
  },
};

const VOICE_SCRIPT = `I just finished my shift with Dorothy. She was in okay spirits today but seemed more tired than usual. She ate about half her lunch and refused her afternoon snack. I noticed she was having trouble getting up from her chair — took a few tries. Her morning medications were given without any issues. The family called to check in and she seemed happy to hear from them.`;

const POLLING_MESSAGES = [
  'Analyzing your note...',
  'Structuring handoff...',
  'Extracting risk signals...',
];

export default function LandingPage() {
  return (
    <div className="bg-white text-ink">
      <NavBar />
      <main>
        <Hero />
        <Problem />
        <Solution />
        <DemoSection />
        <Features />
        <RequestAccess />
      </main>
      <Footer />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Nav

function NavBar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav
      className={cn(
        'sticky top-0 z-30 bg-white transition-shadow',
        scrolled && 'shadow-sm',
      )}
    >
      <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <span className="font-display text-xl text-forest">DaliyaFlow</span>
        </Link>
        <div className="hidden sm:block">
          <Link to="/auth/sign-in">
            <Button variant="ghost" size="sm">
              Sign In
            </Button>
          </Link>
        </div>
        <button
          type="button"
          aria-label="Open menu"
          className="sm:hidden size-9 rounded-md hover:bg-forest-pale flex items-center justify-center"
          onClick={() => setOpen((v) => !v)}
        >
          <span aria-hidden className="text-slate text-xl">
            ≡
          </span>
        </button>
      </div>
      {open && (
        <div className="sm:hidden border-t border-border px-5 py-3 bg-white">
          <Link
            to="/auth/sign-in"
            className="block text-sm text-ink"
            onClick={() => setOpen(false)}
          >
            Sign In
          </Link>
        </div>
      )}
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero

function Hero() {
  return (
    <section
      className="relative overflow-hidden"
      style={{
        background:
          'linear-gradient(180deg, var(--color-forest-pale) 0%, #ffffff 100%)',
      }}
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, var(--color-ink) 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
      />
      <div className="relative max-w-6xl mx-auto px-5 py-16 sm:py-24 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-ink leading-tight">
            Every shift note, turned into a safe handoff.
          </h1>
          <p className="mt-5 text-lg sm:text-xl text-slate max-w-[560px]">
            DaliyaFlow helps senior care teams in home care, assisted living,
            memory care, and adult family homes. We help teams capture what
            happened, surface what matters, and respond faster when care
            continuity is at risk.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href="#demo">
              <Button>See it in action</Button>
            </a>
            <a href="#access">
              <Button variant="ghost">Request access</Button>
            </a>
          </div>
          <p className="mt-4 text-sm text-muted-text">
            Built by someone who has been there.
          </p>
          <p className="mt-1 text-xs text-muted-text">
            Our founder spent years as a caregiver before building this.
          </p>
        </div>
        <HeroIllustration />
      </div>
    </section>
  );
}

function HeroIllustration() {
  // A realistic in-app mockup. Mirrors the production HandoffSummaryBlock +
  // RiskFlagCard so visitors see what DaliyaFlow actually produces, not an
  // abstract stand-in.
  return (
    <div className="flex justify-center lg:justify-end">
      <div
        aria-hidden
        className="w-full max-w-[380px] rounded-xl border border-border bg-white p-5 animate-fade-in-up"
        style={{ boxShadow: 'var(--shadow-lg)' }}
      >
        {/* Header bar — mimics the in-app handoff summary header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div
              className="size-8 rounded-full flex items-center justify-center text-white"
              style={{ background: 'var(--color-primary)' }}
            >
              <Leaf size={14} />
            </div>
            <div>
              <div className="font-display text-sm text-ink leading-tight">
                Handoff for Dorothy M.
              </div>
              <div className="text-[10px] text-muted-text font-mono">
                Today · 9:00 – 3:00
              </div>
            </div>
          </div>
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-[0.05em]"
            style={{
              background: 'var(--color-primary-pale)',
              color: 'var(--color-primary)',
            }}
          >
            AI generated
          </span>
        </div>

        {/* Summary block */}
        <div
          className="rounded-md p-3 mb-3"
          style={{ background: 'var(--color-primary-pale)' }}
        >
          <div className="text-[10px] uppercase tracking-[0.05em] text-muted-text mb-1">
            Overview
          </div>
          <p className="text-xs text-ink leading-relaxed">
            Shift completed. Dorothy was tired but cooperative. Ate half her
            lunch and refused her afternoon snack.
          </p>
        </div>

        <div className="rounded-md border border-border p-3 mb-4">
          <div className="text-[10px] uppercase tracking-[0.05em] text-muted-text mb-1">
            Notable changes
          </div>
          <p className="text-xs text-slate leading-relaxed">
            Difficulty rising from chair · reduced appetite · no medication
            issues today.
          </p>
        </div>

        {/* Risk flag chips */}
        <div className="text-[10px] uppercase tracking-[0.05em] text-muted-text mb-2">
          Suggested risk flags
        </div>
        <div className="space-y-2">
          <div
            className="rounded-md border border-border bg-white pl-3 pr-3 py-2 flex items-center justify-between"
            style={{ borderLeft: '4px solid var(--color-risk-high)' }}
          >
            <div>
              <div className="text-xs font-medium text-ink">
                Medication Issue
              </div>
              <div className="text-[10px] text-muted-text mt-0.5">
                "could not find evening blood pressure med"
              </div>
            </div>
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-[0.05em]"
              style={{
                background: 'var(--color-risk-high-pale)',
                color: 'var(--color-risk-high)',
              }}
            >
              High
            </span>
          </div>
          <div
            className="rounded-md border border-border bg-white pl-3 pr-3 py-2 flex items-center justify-between"
            style={{ borderLeft: '4px solid var(--color-risk-medium)' }}
          >
            <div>
              <div className="text-xs font-medium text-ink">Fall Concern</div>
              <div className="text-[10px] text-muted-text mt-0.5">
                "trouble getting up from chair"
              </div>
            </div>
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-[0.05em]"
              style={{
                background: 'var(--color-risk-medium-pale)',
                color: 'var(--color-risk-medium)',
              }}
            >
              Medium
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Problem

function Problem() {
  const items = [
    {
      icon: <ClipboardList size={20} />,
      title: "Notes that don't travel",
      body: "Rushed texts, verbal handoffs, and buried shift notes mean the next caregiver starts without context.",
    },
    {
      icon: <AlertTriangle size={20} />,
      title: 'Risks that go unseen',
      body: 'Signs of decline, medication issues, and unsafe conditions hide in free text until something goes wrong.',
    },
    {
      icon: <Users size={20} />,
      title: 'Coordinators playing catch-up',
      body: "Without a clear view of what happened across all shifts, coordinators spend their morning chasing information instead of acting on it.",
    },
  ];
  return (
    <section className="py-20 bg-surface">
      <div className="max-w-6xl mx-auto px-5">
        <SectionLabel>The problem</SectionLabel>
        <h2 className="font-display text-3xl sm:text-4xl text-ink mt-3 max-w-3xl">
          Critical information gets lost between shifts.
        </h2>
        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-5">
          {items.map((it) => (
            <ProblemCard key={it.title} {...it} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ProblemCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="bg-white border border-border rounded-lg shadow-sm p-6">
      <div
        className="size-10 rounded-full flex items-center justify-center mb-4"
        style={{
          background: 'var(--color-forest-pale)',
          color: 'var(--color-forest)',
        }}
      >
        {icon}
      </div>
      <h3 className="font-display text-lg text-ink mb-2">{title}</h3>
      <p className="text-sm text-slate leading-relaxed">{body}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Solution

function Solution() {
  const steps = [
    {
      icon: <Mic size={20} />,
      title: 'Caregiver submits a note',
      body: 'Text or voice, at the end of every shift. Structured prompts reduce blank-screen friction.',
    },
    {
      icon: <Zap size={20} className="text-[var(--color-gold)]" />,
      title: 'AI structures the handoff',
      body: 'DaliyaFlow extracts what happened, what changed, what needs follow-up, and what to watch for next.',
    },
    {
      icon: <Shield size={20} />,
      title: 'Coordinator sees what matters',
      body: 'High priority flags surface first. Continuity breaks are visible. Nothing important gets buried.',
    },
  ];
  return (
    <section className="py-20">
      <div className="max-w-6xl mx-auto px-5">
        <SectionLabel>How it works</SectionLabel>
        <h2 className="font-display text-3xl sm:text-4xl text-ink mt-3 max-w-3xl">
          From messy note to structured handoff in seconds.
        </h2>
        <ol className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {steps.map((step, i) => (
            <li key={step.title} className="relative">
              <div
                aria-hidden
                className="absolute -top-2 -left-2 font-display text-6xl"
                style={{ color: 'var(--color-forest-pale)' }}
              >
                {i + 1}
              </div>
              <div className="relative bg-white border border-border rounded-lg shadow-sm p-6">
                <div
                  className="size-10 rounded-full flex items-center justify-center mb-4"
                  style={{
                    background: 'var(--color-forest-pale)',
                    color: 'var(--color-forest)',
                  }}
                >
                  {step.icon}
                </div>
                <h3 className="font-display text-lg text-ink mb-2">
                  {step.title}
                </h3>
                <p className="text-sm text-slate leading-relaxed">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Demo

type DemoMode = 'text' | 'voice';
type VoiceState = 'idle' | 'transcribing' | 'ready' | 'unavailable';

const SUPPORTS_RECORDER =
  typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined';

function DemoSection() {
  const [text, setText] = useState('');
  const [generations, setGenerations] = useState(0);
  const [progressIdx, setProgressIdx] = useState(0);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);
  const [mode, setMode] = useState<DemoMode>('text');
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [voiceMessage, setVoiceMessage] = useState<string>('');

  const limitReached = generations >= 3;

  const transcribeMutation = useMutation({
    mutationFn: async (
      blob: Blob,
    ): Promise<{
      transcript: string;
      confidence: number;
      available: boolean;
      message: string | null;
    }> => {
      const fd = new FormData();
      fd.append('audio', blob, 'demo-recording.webm');
      const { data } = await apiClient.post<{
        transcript: string;
        confidence: number;
        available: boolean;
        message: string | null;
      }>('/demo/transcribe', fd);
      return data;
    },
    onMutate: () => {
      setVoiceState('transcribing');
      setVoiceMessage('');
    },
    onSuccess: (data) => {
      if (!data.available || (data.transcript ?? '').trim().length === 0) {
        setVoiceState('unavailable');
        setVoiceMessage(
          data.message ?? 'Voice demo unavailable — type a note instead.',
        );
      } else {
        setVoiceState('ready');
        setText(data.transcript);
      }
    },
    onError: () => {
      setVoiceState('unavailable');
      setVoiceMessage('Voice demo unavailable — type a note instead.');
    },
  });

  const mutation = useMutation({
    mutationFn: async (note: string): Promise<DemoResult> => {
      const { data } = await apiClient.post<DemoResult>(
        '/demo/handoff',
        { note },
      );
      return data;
    },
    onMutate: () => {
      setError(null);
      setResult(null);
      setProgressIdx(0);
      let i = 0;
      intervalRef.current = window.setInterval(() => {
        i = (i + 1) % POLLING_MESSAGES.length;
        setProgressIdx(i);
      }, 1500);
    },
    onSettled: () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    },
    onSuccess: (data) => {
      setResult(data);
      setGenerations((n) => n + 1);
    },
    onError: () => {
      setError('Demo unavailable right now. Sign up to get full access.');
    },
  });

  function fillExample(key: keyof typeof EXAMPLES) {
    setText(EXAMPLES[key].text);
  }

  function generate() {
    if (limitReached || mutation.isPending || text.trim().length < 20) return;
    mutation.mutate(text.trim());
  }

  return (
    <section id="demo" className="py-20 bg-surface scroll-mt-20">
      <div className="max-w-6xl mx-auto px-5">
        <SectionLabel>Try it yourself</SectionLabel>
        <h2 className="font-display text-3xl sm:text-4xl text-ink mt-3 max-w-3xl">
          Paste or type a caregiver shift note below and see DaliyaFlow generate
          a structured handoff and risk flags in real time.
        </h2>

        <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input */}
          <div className="bg-white border border-border rounded-lg shadow-sm p-5">
            <div
              role="tablist"
              aria-label="Demo input mode"
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

            {mode === 'voice' && SUPPORTS_RECORDER && (
              <div className="mb-4">
                <VoiceScriptHint />
                <VoiceNoteRecorder
                  onComplete={(blob) => transcribeMutation.mutate(blob)}
                  onError={(msg) => {
                    setVoiceState('unavailable');
                    setVoiceMessage(msg);
                  }}
                />
                {voiceState === 'transcribing' && (
                  <div
                    role="status"
                    aria-live="polite"
                    className="rounded-md border border-border bg-forest-pale/50 px-4 py-3 text-sm text-slate flex items-center gap-2"
                  >
                    <Loader2
                      size={14}
                      className="animate-spin text-forest"
                      aria-hidden
                    />
                    Transcribing...
                  </div>
                )}
                {voiceState === 'ready' && (
                  <p className="text-xs text-muted-text mt-1">
                    Transcript filled in below — edit if needed, then Generate.
                  </p>
                )}
                {voiceState === 'unavailable' && (
                  <div
                    role="alert"
                    className="rounded-md p-3 text-sm"
                    style={{
                      background: 'var(--color-gold-light)',
                      color: 'var(--color-ink)',
                    }}
                  >
                    {voiceMessage ||
                      'Voice demo unavailable — type a note instead.'}
                  </div>
                )}
              </div>
            )}

            {mode === 'voice' && !SUPPORTS_RECORDER && (
              <div
                className="rounded-md p-3 text-sm mb-4"
                style={{
                  background: 'var(--color-gold-light)',
                  color: 'var(--color-ink)',
                }}
              >
                Voice recording isn't supported on this browser. Try the Text
                tab instead.
              </div>
            )}

            <label htmlFor="demo-note" className="sr-only">
              Caregiver shift note
            </label>
            <textarea
              id="demo-note"
              rows={mode === 'voice' ? 6 : 10}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={limitReached}
              placeholder={
                mode === 'voice'
                  ? 'Your transcript will appear here. You can edit before generating.'
                  : 'Type a shift note here... or use one of the examples below'
              }
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-base text-ink placeholder:text-mist resize-y focus:outline-none focus:border-forest focus:shadow-[0_0_0_3px_rgba(27,77,62,0.12)]"
            />
            {mode === 'text' && (
              <div className="mt-3 flex flex-wrap gap-2">
                {(Object.keys(EXAMPLES) as Array<keyof typeof EXAMPLES>).map(
                  (k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => fillExample(k)}
                      className="text-xs px-3 py-1 rounded-full border border-border hover:border-forest hover:text-forest transition-colors"
                    >
                      {EXAMPLES[k].label}
                    </button>
                  ),
                )}
              </div>
            )}
            <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-muted-text">
                {limitReached
                  ? 'Demo limit reached — sign up for full access.'
                  : `${3 - generations} generation${
                      3 - generations === 1 ? '' : 's'
                    } left in this session`}
              </p>
              <Button
                onClick={generate}
                loading={mutation.isPending}
                disabled={
                  limitReached || mutation.isPending || text.trim().length < 20
                }
              >
                Generate Handoff
              </Button>
            </div>
          </div>

          {/* Output */}
          <div className="bg-white border border-border rounded-lg shadow-sm p-5 min-h-[400px] flex flex-col">
            {!mutation.isPending && !result && !error && (
              <DemoEmptyState />
            )}

            {mutation.isPending && (
              <div className="space-y-4">
                <p className="text-sm text-slate flex items-center gap-2">
                  <Sparkles size={14} className="text-[var(--color-gold)]" />
                  {POLLING_MESSAGES[progressIdx]}
                </p>
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-24 w-full mt-4" />
              </div>
            )}

            {error && !mutation.isPending && (
              <div
                className="rounded-md p-4 text-sm"
                style={{
                  background: 'var(--color-risk-high-pale)',
                  color: 'var(--color-risk-high)',
                }}
              >
                {error}
              </div>
            )}

            {result && !mutation.isPending && (
              <div className="space-y-4">
                <HandoffSummaryBlock summary={result as never} generated />
                {(result.risk_flags ?? []).length > 0 && (
                  <div className="space-y-2">
                    {result.risk_flags!.map((f, i) => (
                      <RiskFlagCard
                        key={i}
                        category={f.category}
                        severity={f.severity}
                        reason={f.extracted_reason}
                        status="suggested"
                      />
                    ))}
                  </div>
                )}
                <div className="text-xs text-muted-text italic">
                  AI Generated — for demonstration only
                </div>
                <a href="#access">
                  <Button fullWidth>
                    Sign up to use DaliyaFlow with your organization
                  </Button>
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function DemoEmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center text-center px-6 py-10">
      <div>
        <div
          className="size-14 rounded-full mx-auto flex items-center justify-center mb-3"
          style={{
            background: 'var(--color-forest-pale)',
            color: 'var(--color-forest)',
          }}
        >
          <FileText size={20} />
        </div>
        <p className="text-sm text-slate">
          Your structured handoff will appear here.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Voice script hint

function VoiceScriptHint() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-3 rounded-md border border-border bg-forest-pale/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-forest hover:text-forest-light"
      >
        <span className="flex items-center gap-2">
          <Mic size={14} />
          {open ? 'Hide example script' : 'See example script'}
        </span>
        <span aria-hidden className="text-xs text-muted-text">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <div className="border-t border-border px-4 py-3 space-y-2">
          <p
            className="text-sm text-ink leading-relaxed select-text whitespace-pre-line"
            style={{ userSelect: 'text' }}
          >
            {VOICE_SCRIPT}
          </p>
          <p className="text-xs italic text-muted-text">
            Tap the mic and read this aloud — DaliyaFlow will transcribe and
            structure it into a handoff.
          </p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Features

function Features() {
  const items = [
    {
      icon: <FileText size={18} />,
      title: 'Structured handoffs',
      body: 'Every note becomes a clean, scannable handoff. No more reading through paragraphs to find what matters.',
    },
    {
      icon: <AlertTriangle size={18} />,
      title: 'Risk flag extraction',
      body: '13 risk categories extracted automatically. Caregivers confirm or dismiss in one tap.',
    },
    {
      icon: <Zap size={18} />,
      title: 'Voice note support',
      body: 'Caregivers can speak their notes. Whisper transcribes, DaliyaFlow structures.',
    },
    {
      icon: <Users size={18} />,
      title: 'Continuity intelligence',
      body: 'When a caregiver calls out, the replacement gets an instant briefing on the client.',
    },
    {
      icon: <Shield size={18} />,
      title: 'Secure by design',
      body: 'Multi-tenant architecture. Agency data never crosses tenant boundaries.',
    },
    {
      icon: <BarChart2 size={18} />,
      title: 'Coordinator dashboard',
      body: 'Priority queue, activity feed, and quick stats. Know what needs attention before you start your day.',
    },
  ];
  return (
    <section className="py-20">
      <div className="max-w-6xl mx-auto px-5">
        <h2 className="font-display text-3xl sm:text-4xl text-ink max-w-3xl">
          Everything your coordinators need. Nothing they don't.
        </h2>
        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((it) => (
            <div
              key={it.title}
              className="bg-white border border-border rounded-lg shadow-sm p-5"
            >
              <div
                className="size-10 rounded-full flex items-center justify-center mb-3"
                style={{
                  background: 'var(--color-forest-pale)',
                  color: 'var(--color-forest)',
                }}
              >
                {it.icon}
              </div>
              <h3 className="font-display text-base text-ink mb-1">
                {it.title}
              </h3>
              <p className="text-sm text-slate leading-relaxed">{it.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Request access

function RequestAccess() {
  const [name, setName] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [email, setEmail] = useState('');
  const [challenge, setChallenge] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const pushToast = useUIStore((s) => s.pushToast);

  const submit = useMutation({
    mutationFn: () =>
      waitlistApi.submit({
        name: name.trim(),
        agency_name: agencyName.trim(),
        email: email.trim(),
        challenge_description: challenge.trim() || undefined,
      }),
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: () =>
      pushToast({
        variant: 'error',
        title: 'Could not submit',
        message: 'Please try again in a few minutes.',
      }),
  });

  return (
    <section
      id="access"
      className="py-20 scroll-mt-20"
      style={{ background: 'var(--color-forest)' }}
    >
      <div className="max-w-3xl mx-auto px-5 text-white">
        <h2 className="font-display text-3xl sm:text-4xl">
          Ready to bring DaliyaFlow to your organization?
        </h2>
        <p className="mt-4 text-base sm:text-lg opacity-90 max-w-2xl">
          We are onboarding a small number of pilot organizations. No long contracts.
          No enterprise complexity.
        </p>

        {submitted ? (
          <div
            className="mt-8 rounded-lg p-6 flex items-start gap-3"
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.2)',
            }}
          >
            <CheckCircle2
              size={20}
              style={{ color: 'var(--color-gold)' }}
              className="shrink-0 mt-0.5"
            />
            <div>
              <div className="font-display text-lg">Thank you</div>
              <p className="text-sm opacity-90 mt-1">
                We will be in touch within 48 hours.
              </p>
            </div>
          </div>
        ) : (
          <form
            className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (
                !name.trim() ||
                !agencyName.trim() ||
                !email.trim() ||
                submit.isPending
              )
                return;
              submit.mutate();
            }}
          >
            <Input
              required
              placeholder="Your name"
              aria-label="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="!bg-white"
            />
            <Input
              required
              placeholder="Organization name"
              aria-label="Organization name"
              value={agencyName}
              onChange={(e) => setAgencyName(e.target.value)}
              className="!bg-white"
            />
            <div className="sm:col-span-2">
              <Input
                required
                type="email"
                placeholder="Work email"
                aria-label="Work email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="!bg-white"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm mb-1 opacity-90">
                What's your biggest challenge with shift handoffs right now?
              </label>
              <textarea
                aria-label="Biggest challenge"
                value={challenge}
                onChange={(e) => setChallenge(e.target.value.slice(0, 500))}
                maxLength={500}
                rows={3}
                placeholder="Tell us what's broken in your current process..."
                className="w-full rounded-md px-3 py-2 text-base text-ink"
                style={{ background: 'white' }}
              />
              <div className="text-xs opacity-70 mt-1 text-right font-mono">
                {challenge.length} / 500
              </div>
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={submit.isPending}
                className="px-6 py-3 rounded-md font-medium transition-colors disabled:opacity-50"
                style={{
                  background: 'var(--color-gold)',
                  color: 'var(--color-ink)',
                }}
              >
                {submit.isPending ? 'Submitting…' : 'Request Access'}
              </button>
            </div>
          </form>
        )}

        <div className="mt-6 text-sm opacity-90">
          Already have access?{' '}
          <Link to="/auth/sign-in" className="underline">
            Sign in →
          </Link>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Footer

function Footer() {
  return (
    <footer className="py-10 bg-white border-t border-border">
      <div className="max-w-6xl mx-auto px-5 flex flex-wrap items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-2">
            <Leaf size={16} className="text-forest" />
            <span className="font-display text-lg text-forest">DaliyaFlow</span>
          </div>
          <p className="text-sm text-muted-text mt-1">
            AI handoffs and care continuity for senior care teams
          </p>
        </div>
        <div className="text-sm text-muted-text text-right">
          <div>Built with care in Seattle</div>
          <div className="text-xs mt-1">
            © 2026 DaliyaFlow. Built for caregivers.
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-xs uppercase font-semibold"
      style={{
        color: 'var(--color-gold)',
        letterSpacing: '0.12em',
      }}
    >
      {children}
    </div>
  );
}
