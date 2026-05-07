import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';

type State = 'idle' | 'recording' | 'processing';

export interface VoiceNoteRecorderProps {
  onComplete: (audio: Blob, durationSec: number) => void;
  onError?: (msg: string) => void;
}

const BAR_COUNT = 24;

export function VoiceNoteRecorder({
  onComplete,
  onError,
}: VoiceNoteRecorderProps) {
  const [state, setState] = useState<State>('idle');
  const [seconds, setSeconds] = useState(0);
  const [bars, setBars] = useState<number[]>(Array(BAR_COUNT).fill(0.1));

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => stopAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopAll() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (tickRef.current) window.clearInterval(tickRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
  }

  async function start() {
    setSeconds(0);
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const dur = seconds;
        stopAll();
        setState('processing');
        onComplete(blob, dur);
        setState('idle');
      };
      recorder.start(250);
      recorderRef.current = recorder;

      // Web Audio analyser for visualisation
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      src.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;

      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(buf);
        const next: number[] = [];
        const step = Math.floor(buf.length / BAR_COUNT) || 1;
        for (let i = 0; i < BAR_COUNT; i++) {
          next.push(Math.min(1, (buf[i * step] ?? 0) / 200));
        }
        setBars(next);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      tickRef.current = window.setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);

      setState('recording');
    } catch (err) {
      onError?.(
        err instanceof Error ? err.message : 'Microphone permission denied.',
      );
    }
  }

  function stop() {
    recorderRef.current?.stop();
  }

  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = (seconds % 60).toString().padStart(2, '0');

  return (
    <div className="flex flex-col items-center gap-5 py-6">
      <button
        type="button"
        onClick={state === 'recording' ? stop : start}
        disabled={state === 'processing'}
        aria-label={state === 'recording' ? 'Stop recording' : 'Start recording'}
        className={cn(
          'size-24 rounded-full flex items-center justify-center text-white shadow-lg transition-transform active:scale-95',
          state === 'recording'
            ? 'bg-[var(--color-risk-high)] animate-risk-pulse'
            : 'bg-forest hover:bg-forest-light',
          state === 'processing' && 'opacity-60',
        )}
      >
        {state === 'processing' ? (
          <Loader2 className="animate-spin" size={36} />
        ) : state === 'recording' ? (
          <Square size={32} fill="currentColor" />
        ) : (
          <Mic size={32} />
        )}
      </button>

      <div className="font-mono text-2xl text-ink">
        {minutes}:{secs}
      </div>

      <div className="flex items-end gap-1 h-12">
        {bars.map((v, i) => (
          <div
            key={i}
            className={cn(
              'w-[3px] rounded-full transition-[height] duration-75',
              state === 'recording' ? 'bg-forest' : 'bg-border',
            )}
            style={{ height: `${Math.max(0.1, v) * 100}%` }}
          />
        ))}
      </div>

      <p className="text-sm text-muted-text">
        {state === 'recording'
          ? 'Recording... tap the square to stop.'
          : state === 'processing'
            ? 'Processing your recording...'
            : 'Tap the microphone to start recording.'}
      </p>
    </div>
  );
}
