import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <main className="mx-auto flex max-w-md flex-col items-start gap-4 px-4 py-24 sm:px-6">
      <p className="text-sm font-[650] text-muted">404</p>
      <h1 className="display text-4xl">The púca hid this page.</h1>
      <p className="text-muted">
        Shape-shifters do that. The menu, however, is exactly where you left it.
      </p>
      <Button className="mt-2" onClick={() => navigate('/menu')}>
        Back to the menu
      </Button>
    </main>
  )
}
