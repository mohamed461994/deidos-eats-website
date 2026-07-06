import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[13px] font-[550] leading-5',
  {
    variants: {
      variant: {
        ember: 'bg-ember text-on-ember',
        'ember-soft': 'bg-ember-tint text-ember',
        crust: 'bg-crust-tint text-ink',
        basil: 'bg-basil text-on-basil',
        'basil-soft': 'bg-basil-tint text-basil-deep',
        neutral: 'bg-surface text-muted',
        error: 'bg-error-tint text-error',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
)

export function Badge({
  className,
  variant,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
