/**
 * Modal surfaces built on Radix Dialog. Two shapes, one component:
 * - `center`: desktop modal, mobile full-height sheet (item detail)
 * - `drawer`: right-side panel on desktop, bottom sheet on mobile (cart)
 */
import { Dialog as RadixDialog } from 'radix-ui'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Visually hide the title (still announced to screen readers). */
  hideTitle?: boolean
  shape?: 'center' | 'drawer'
  children: ReactNode
}

export function Modal({
  open,
  onOpenChange,
  title,
  hideTitle = false,
  shape = 'center',
  children,
}: ModalProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay
          className="fade-in fixed inset-0 bg-[oklch(0.2_0.02_140/0.5)]"
          style={{ zIndex: 'var(--z-backdrop)' }}
        />
        <RadixDialog.Content
          aria-describedby={undefined}
          style={{ zIndex: 'var(--z-modal)' }}
          className={cn(
            'fixed flex flex-col bg-bg shadow-floating focus:outline-none',
            shape === 'center' &&
              'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[24px] sm:inset-x-auto sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:max-h-[85dvh] sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[24px]',
            shape === 'drawer' &&
              'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[24px] sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:bottom-auto sm:h-full sm:max-h-none sm:w-full sm:max-w-md sm:rounded-none',
          )}
        >
          <RadixDialog.Title
            className={cn(
              'display px-6 pt-6 pb-2 text-xl',
              hideTitle && 'sr-only',
            )}
          >
            {title}
          </RadixDialog.Title>
          <RadixDialog.Close
            aria-label="Close"
            className="absolute top-4 right-4 grid size-11 place-items-center rounded-full bg-bg/80 text-ink backdrop-blur-sm transition-colors hover:bg-surface"
            style={{ zIndex: 1 }}
          >
            <X className="size-5" aria-hidden />
          </RadixDialog.Close>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
