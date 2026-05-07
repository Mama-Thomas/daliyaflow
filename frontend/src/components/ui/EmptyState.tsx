import { ReactNode } from 'react';
import { Leaf } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center py-12 px-6 rounded-lg border border-dashed border-border bg-white',
        className,
      )}
    >
      <div className="size-12 rounded-full bg-forest-pale text-forest flex items-center justify-center mb-4">
        {icon ?? <Leaf size={22} aria-hidden />}
      </div>
      <div className="font-display text-xl text-forest mb-1">{title}</div>
      {description && (
        <div className="text-sm text-slate max-w-sm">{description}</div>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
