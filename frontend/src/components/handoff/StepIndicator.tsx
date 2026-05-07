import { cn } from '@/utils/cn';

export function StepIndicator({
  current,
  total,
  labels,
}: {
  current: number;
  total: number;
  labels?: string[];
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs uppercase tracking-[0.05em] text-muted-text">
        Step {current} of {total}
      </span>
      <div className="flex gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-1 w-7 rounded-full transition-colors',
              i < current ? 'bg-forest' : 'bg-border',
            )}
            aria-label={labels?.[i]}
          />
        ))}
      </div>
    </div>
  );
}
