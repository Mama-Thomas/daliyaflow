import { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/cn';

export type BadgeVariant =
  | 'high'
  | 'medium'
  | 'low'
  | 'resolved'
  | 'pending'
  | 'neutral';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  children: ReactNode;
}

const variantStyles: Record<BadgeVariant, string> = {
  high: 'bg-[var(--color-risk-high-pale)] text-[var(--color-risk-high)]',
  medium:
    'bg-[var(--color-risk-medium-pale)] text-[var(--color-risk-medium)]',
  low: 'bg-[var(--color-risk-low-pale)] text-[var(--color-risk-low)]',
  resolved:
    'bg-[var(--color-risk-resolved-pale)] text-[var(--color-risk-resolved)]',
  pending: 'bg-gold-light text-[var(--color-gold)]',
  neutral: 'bg-[var(--color-forest-pale)] text-forest',
};

export function Badge({
  variant = 'neutral',
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-[10px] py-[2px] text-xs font-medium uppercase tracking-[0.05em]',
        variantStyles[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
