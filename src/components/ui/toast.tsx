import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { cn } from '@/lib/utils'

interface Toast {
  id: number
  message: string
  tone: 'default' | 'error'
}

interface ToastContextValue {
  toast: (message: string, tone?: Toast['tone']) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)

  const toast = useCallback((message: string, tone: Toast['tone'] = 'default') => {
    const id = nextId.current++
    setToasts((current) => [...current, { id, message, tone }])
    setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id))
    }, 4000)
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-24 flex flex-col items-center gap-2 px-4 sm:bottom-6"
        style={{ zIndex: 'var(--z-toast)' }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'fade-in max-w-sm rounded-full px-5 py-2.5 text-[15px] font-[550] shadow-floating',
              t.tone === 'error' ? 'bg-error text-white' : 'bg-basil-deep text-paper',
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside <ToastProvider>')
  return context
}
