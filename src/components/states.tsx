import { Flame, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'

interface EmptyStateProps {
  title: string
  body: string
  action?: ReactNode
}

/** Empty states teach the next step; they never just say "nothing here". */
export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 py-16 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-basil-tint text-basil">
        <Flame className="size-6" aria-hidden />
      </div>
      <h2 className="display text-2xl">{title}</h2>
      <p className="text-muted">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

interface ErrorStateProps {
  message: string
  onRetry?: () => void
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div role="alert" className="mx-auto flex max-w-sm flex-col items-center gap-3 py-16 text-center">
      <h2 className="display text-2xl">That didn’t work</h2>
      <p className="text-muted">{message}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw className="size-4" aria-hidden />
          Try again
        </Button>
      )}
    </div>
  )
}
