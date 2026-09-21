import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
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

function FieldWrap({ label, hint, error, id, className, children }: FieldWrapProps) {
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

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { label?: ReactNode; hint?: ReactNode; error?: ReactNode }>(
  function Select({ label, hint, error, className, id: idProp, children, ...rest }, ref) {
    const auto = useId();
    const id = idProp ?? auto;
    return (
      <FieldWrap label={label} hint={hint} error={error} id={id}>
        <div className="relative">
          <select ref={ref} id={id} className={cn(control, 'h-12 appearance-none pr-10', className)} {...rest}>
            {children}
          </select>
          <svg className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-mist" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
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
