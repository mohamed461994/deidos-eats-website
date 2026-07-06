import { ShoppingBag, UserRound } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'

import { useMe } from '@/api/queries'
import { useAuth } from '@/auth/context'
import { useCart } from '@/cart/context'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'

const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
  cn(
    'rounded-full px-4 py-2 text-[15px] font-[550] transition-colors',
    isActive ? 'bg-basil-tint text-basil-deep' : 'text-ink hover:bg-surface',
  )

export function Header() {
  const { itemCount, subtotalCents, openCart } = useCart()
  const { status } = useAuth()
  const me = useMe()

  // Surface the signed-in user's first name next to the account icon. While /me
  // is loading, errored, or has no name, `firstName` is empty and we fall back
  // to the plain icon below — the name simply appears once it's available.
  const firstName = me.data?.fullName?.trim().split(/\s+/)[0] ?? ''
  const showName = status === 'signedIn' && firstName !== ''

  return (
    <header
      className="sticky top-0 border-b border-border/60 bg-bg/90 backdrop-blur-md"
      style={{ zIndex: 'var(--z-sticky)' }}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Link
          to="/"
          className="display mr-2 flex items-baseline gap-1.5 text-[22px] tracking-tight text-basil-deep"
          aria-label="Púca Pizza — home"
        >
          Púca
          <span className="ember-dot translate-y-[-0.1em]" aria-hidden />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
          <NavLink to="/menu" className={navLinkClasses}>
            Menu
          </NavLink>
          <NavLink to="/locations" className={navLinkClasses}>
            Locations
          </NavLink>
          {status === 'signedIn' && (
            <NavLink to="/orders" className={navLinkClasses}>
              Orders
            </NavLink>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link
            to={status === 'signedIn' ? '/account' : '/signin'}
            className={cn(
              'rounded-full text-ink transition-colors hover:bg-surface',
              showName ? 'flex h-11 items-center gap-2 px-3' : 'grid size-11 place-items-center',
            )}
            aria-label={
              status === 'signedIn'
                ? showName
                  ? `Your account, ${firstName}`
                  : 'Your account'
                : 'Sign in'
            }
          >
            <UserRound className="size-5 shrink-0" aria-hidden />
            {showName && (
              <span className="max-w-[7rem] truncate text-[15px] font-[550]">{firstName}</span>
            )}
          </Link>
          <button
            type="button"
            onClick={openCart}
            className={cn(
              'flex h-11 items-center gap-2 rounded-full px-4 text-[15px] font-[550] transition-colors',
              itemCount > 0
                ? 'bg-basil text-on-basil hover:bg-basil-hover'
                : 'border border-border text-ink hover:bg-surface',
            )}
            aria-label={
              itemCount > 0
                ? `Open cart: ${itemCount} item${itemCount === 1 ? '' : 's'}, ${formatCents(subtotalCents)}`
                : 'Open cart (empty)'
            }
          >
            <ShoppingBag className="size-4.5" aria-hidden />
            {itemCount > 0 && (
              <>
                <span className="tabular-nums">{itemCount}</span>
                <span aria-hidden className="ember-dot" />
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  )
}
