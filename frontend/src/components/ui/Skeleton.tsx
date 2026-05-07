import { HTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

export function Skeleton({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="presentation"
      aria-hidden
      className={cn(
        'rounded-md skeleton-shimmer h-4 w-full',
        className,
      )}
      {...rest}
    />
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(i === lines - 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="bg-white border border-border rounded-lg shadow-sm p-6">
      <Skeleton className="h-5 w-1/3 mb-4" />
      <SkeletonText lines={3} />
    </div>
  );
}
