import { ButtonHTMLAttributes, forwardRef, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

const base =
  'inline-flex items-center justify-center gap-2 font-body font-medium rounded-md ' +
  'transition-[background,transform,box-shadow] duration-150 ease-out ' +
  'active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100';

const variants: Record<Variant, string> = {
  primary:
    'bg-forest text-white hover:bg-forest-light focus-visible:ring-2 focus-visible:ring-forest/40',
  secondary:
    'bg-white text-forest border border-border hover:bg-forest-pale',
  ghost:
    'bg-transparent text-slate hover:bg-forest-pale hover:text-forest',
  danger:
    'bg-[var(--color-risk-high)] text-white hover:opacity-90',
  icon:
    'bg-transparent text-slate hover:bg-forest-pale hover:text-forest p-2 rounded-full',
};

const sizes: Record<Size, string> = {
  sm: 'text-xs px-4 py-2',
  md: 'text-sm px-5 py-2.5',
  lg: 'text-base px-6 py-3',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      variant = 'primary',
      size = 'md',
      loading,
      leftIcon,
      rightIcon,
      fullWidth,
      disabled,
      children,
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={rest.type ?? 'button'}
        disabled={disabled || loading}
        className={cn(
          base,
          variants[variant],
          variant !== 'icon' && sizes[size],
          fullWidth && 'w-full',
          className,
        )}
        {...rest}
      >
        {loading ? (
          <Loader2
            className="animate-spin"
            size={size === 'lg' ? 18 : size === 'sm' ? 14 : 16}
          />
        ) : (
          leftIcon
        )}
        {children}
        {!loading && rightIcon}
      </button>
    );
  },
);
