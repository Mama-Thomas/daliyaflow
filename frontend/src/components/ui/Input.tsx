import {
  InputHTMLAttributes,
  TextareaHTMLAttributes,
  forwardRef,
  useId,
} from 'react';
import { cn } from '@/utils/cn';

interface CommonProps {
  label?: string;
  helperText?: string;
  error?: string;
}

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'children'>,
    CommonProps {}

const baseControl =
  'w-full rounded-md border bg-white px-3 py-2 text-base text-ink ' +
  'placeholder:text-mist transition-shadow duration-150 ease-out ' +
  'focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed';

const okBorder =
  'border-border focus:border-forest focus:shadow-[0_0_0_3px_rgba(27,77,62,0.12)]';

const errBorder =
  'border-[var(--color-error)] focus:border-[var(--color-error)] focus:shadow-[0_0_0_3px_rgba(192,57,43,0.12)]';

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, helperText, error, id, className, ...rest },
  ref,
) {
  const reactId = useId();
  const inputId = id ?? reactId;
  return (
    <div className="flex flex-col gap-2">
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-slate"
        >
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={Boolean(error) || undefined}
        className={cn(baseControl, error ? errBorder : okBorder, className)}
        {...rest}
      />
      {(error || helperText) && (
        <span
          className={cn(
            'text-xs',
            error ? 'text-[var(--color-error)]' : 'text-muted-text',
          )}
        >
          {error || helperText}
        </span>
      )}
    </div>
  );
});

export interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'children'>,
    CommonProps {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    { label, helperText, error, id, className, rows = 6, ...rest },
    ref,
  ) {
    const reactId = useId();
    const inputId = id ?? reactId;
    return (
      <div className="flex flex-col gap-2">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-slate"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          rows={rows}
          aria-invalid={Boolean(error) || undefined}
          className={cn(
            baseControl,
            'resize-y leading-relaxed',
            error ? errBorder : okBorder,
            className,
          )}
          {...rest}
        />
        {(error || helperText) && (
          <span
            className={cn(
              'text-xs',
              error ? 'text-[var(--color-error)]' : 'text-muted-text',
            )}
          >
            {error || helperText}
          </span>
        )}
      </div>
    );
  },
);
