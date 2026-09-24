import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { cn } from '@elare/utils';

const control =
  'w-full rounded-xl border border-line bg-white px-4 text-[15px] text-ink placeholder:text-mist/80 transition-colors focus:border-rose focus:outline-none focus:ring-2 focus:ring-pink/40 disabled:bg-nude/40';

interface FieldWrapProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  id: string;
  className?: string;
  children: ReactNode;
}

export function FieldWrap({ label, hint, error, id, className, children }: FieldWrapProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={id} className="block text-[12px] font-semibold tracking-[0.12em] uppercase text-ink-soft">
          {label}
        </label>
      )}
      {children}
      {error ? <p className="text-[13px] text-danger" role="alert">{error}</p> : hint ? <p className="text-[13px] text-mist">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; hint?: ReactNode; error?: ReactNode; wrapClassName?: string }>(
  function Input({ label, hint, error, className, wrapClassName, id: idProp, ...rest }, ref) {
    const auto = useId();
    const id = idProp ?? auto;
    return (
      <FieldWrap label={label} hint={hint} error={error} id={id} className={wrapClassName}>
        <input ref={ref} id={id} className={cn(control, 'h-12', error && 'border-danger', className)} aria-invalid={!!error} {...rest} />
      </FieldWrap>
    );
  },
);

/** Password field with a show/hide toggle; everything else as <Input>. */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label?: ReactNode; hint?: ReactNode; error?: ReactNode; wrapClassName?: string }>(
  function PasswordInput({ label, hint, error, className, wrapClassName, id: idProp, ...rest }, ref) {
    const auto = useId();
    const id = idProp ?? auto;
    const [shown, setShown] = useState(false);
    return (
      <FieldWrap label={label} hint={hint} error={error} id={id} className={wrapClassName}>
        <div className="relative">
          <input ref={ref} id={id} type={shown ? 'text' : 'password'} className={cn(control, 'h-12 pr-12', error && 'border-danger', className)} aria-invalid={!!error} spellCheck={false} autoCapitalize="none" {...rest} />
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            aria-label={shown ? 'Hide password' : 'Show password'}
            aria-controls={id}
            className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-mist transition-colors hover:bg-blush/60 hover:text-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink/60"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
              <circle cx="12" cy="12" r="3" />
              {shown && <path d="M4 4l16 16" />}
            </svg>
          </button>
        </div>
      </FieldWrap>
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode; hint?: ReactNode; error?: ReactNode }>(
  function Textarea({ label, hint, error, className, id: idProp, ...rest }, ref) {
    const auto = useId();
    const id = idProp ?? auto;
    return (
      <FieldWrap label={label} hint={hint} error={error} id={id}>
        <textarea ref={ref} id={id} className={cn(control, 'min-h-[110px] py-3', error && 'border-danger', className)} aria-invalid={!!error} {...rest} />
      </FieldWrap>
    );
  },
);

export function Checkbox({ label, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-3 text-sm text-ink', className)}>
      <input type="checkbox" className="h-4 w-4 rounded border-line accent-rose" {...rest} />
      <span>{label}</span>
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-3 text-sm">
      <span
        role="switch"
        aria-checked={checked}
        tabIndex={0}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), onChange(!checked))}
        className={cn('relative h-6 w-11 rounded-full transition-colors', checked ? 'bg-rose' : 'bg-line')}
      >
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
      </span>
      {label && <span>{label}</span>}
    </label>
  );
}
