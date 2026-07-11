import { Link } from 'react-router-dom'

import { PLATFORM_NAME } from '@/lib/brand'
import { paths } from '@/lib/routes'

export function Footer() {
  return (
    <footer className="mt-auto bg-basil-deep text-paper">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-[2fr_1fr_1fr] sm:px-6">
        <div>
          <p className="display flex items-baseline gap-1.5 text-2xl">
            {PLATFORM_NAME}
            <span className="ember-dot" aria-hidden />
          </p>
          <p className="mt-3 max-w-xs text-[15px] text-paper-muted">
            Great local restaurants across Ireland, ordered in two minutes and tracked live from
            the pass to your door.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-col gap-2 text-[15px]">
          <p className="font-[650]">Explore</p>
          <Link className="text-paper-muted transition-colors hover:text-paper" to={paths.discovery()}>
            All restaurants
          </Link>
          <Link className="text-paper-muted transition-colors hover:text-paper" to={paths.orders()}>
            Your orders
          </Link>
        </nav>
        <div className="flex flex-col gap-2 text-[15px]">
          <p className="font-[650]">Good to know</p>
          <p className="text-paper-muted">Allergen info lives on every item.</p>
          <p className="text-paper-muted">Collection &amp; delivery, live order tracking.</p>
        </div>
      </div>
      <div className="border-t border-paper/15">
        <p className="mx-auto max-w-6xl px-4 py-5 text-[13px] text-paper-muted sm:px-6">
          © {new Date().getFullYear()} {PLATFORM_NAME} (working name).
        </p>
      </div>
    </footer>
  )
}
