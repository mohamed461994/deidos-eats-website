import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { paths } from '@/lib/routes'

export function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <main className="mx-auto flex max-w-md flex-col items-start gap-4 px-4 py-24 sm:px-6">
      <p className="text-sm font-[650] text-muted">404</p>
      <h1 className="display text-4xl">This page has wandered off.</h1>
      <p className="text-muted">
        The link may be out of date. The restaurants, however, are exactly where you left them.
      </p>
      <Button className="mt-2" onClick={() => navigate(paths.discovery())}>
        Browse restaurants
      </Button>
    </main>
  )
}
