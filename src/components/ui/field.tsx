import { useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

const inputClasses =
  'w-full rounded-[10px] border border-border bg-bg px-3.5 py-2.5 text-[15px] text-ink placeholder:text-muted/70 transition-colors duration-150 hover:border-muted/50 focus:border-basil focus:outline-none disabled:bg-surface disabled:text-muted aria-[invalid=true]:border-error'

interface FieldProps {
  label: string
  error?: string
  hint?: string
}

export function TextField({
  label,
  error,
  hint,
  className,
  ...props
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-[550] text-ink">
        {label}
      </label>
      <input
        id={id}
        className={inputClasses}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="text-[13px] text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-[13px] font-[550] text-error">
          {error}
        </p>
      )}
    </div>
  )
}

export function TextAreaField({
  label,
  error,
  hint,
  className,
  ...props
}: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-[550] text-ink">
        {label}
      </label>
      <textarea
        id={id}
        className={cn(inputClasses, 'min-h-20 resize-y')}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="text-[13px] text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-[13px] font-[550] text-error">
          {error}
        </p>
      )}
    </div>
  )
}
