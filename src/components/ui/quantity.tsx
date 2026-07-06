import { Minus, Plus } from 'lucide-react'

import { cn } from '@/lib/utils'

interface QuantityStepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  size?: 'sm' | 'md'
  /** Announced with the buttons, e.g. the item name. */
  label: string
}

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 50,
  size = 'md',
  label,
}: QuantityStepperProps) {
  const buttonClasses = cn(
    'grid place-items-center rounded-full border border-border text-ink transition-colors hover:bg-surface disabled:opacity-40 disabled:pointer-events-none',
    size === 'md' ? 'size-11' : 'size-9',
  )
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        className={buttonClasses}
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label={`Decrease quantity of ${label}`}
      >
        <Minus className="size-4" aria-hidden />
      </button>
      <span
        className={cn('tabular-nums min-w-6 text-center font-[650]', size === 'md' ? 'text-lg' : 'text-base')}
        aria-live="polite"
        aria-label={`Quantity: ${value}`}
      >
        {value}
      </span>
      <button
        type="button"
        className={buttonClasses}
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label={`Increase quantity of ${label}`}
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  )
}
