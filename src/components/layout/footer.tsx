import { Link } from 'react-router-dom'

export function Footer() {
  return (
    <footer className="mt-auto bg-basil-deep text-paper">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-[2fr_1fr_1fr] sm:px-6">
        <div>
          <p className="display flex items-baseline gap-1.5 text-2xl">
            Púca
            <span className="ember-dot" aria-hidden />
          </p>
          <p className="mt-3 max-w-xs text-[15px] text-paper-muted">
            Wood-fired pizza from Dublin &amp; Cork. Named for the shape-shifter of Irish
            folklore — mischief in the dough, fire in the oven.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-col gap-2 text-[15px]">
          <p className="font-[650]">Go on then</p>
          <Link className="text-paper-muted transition-colors hover:text-paper" to="/menu">
            Menu
          </Link>
          <Link className="text-paper-muted transition-colors hover:text-paper" to="/locations">
            Locations
          </Link>
          <Link className="text-paper-muted transition-colors hover:text-paper" to="/orders">
            Your orders
          </Link>
        </nav>
        <div className="flex flex-col gap-2 text-[15px]">
          <p className="font-[650]">The small print</p>
          <p className="text-paper-muted">Allergen info lives on every item.</p>
          <p className="text-paper-muted">
            Built on the Deidos Eats platform.
          </p>
        </div>
      </div>
      <div className="border-t border-paper/15">
        <p className="mx-auto max-w-6xl px-4 py-5 text-[13px] text-paper-muted sm:px-6">
          © {new Date().getFullYear()} Púca Pizza (placeholder brand). Photography via Unsplash.
        </p>
      </div>
    </footer>
  )
}
