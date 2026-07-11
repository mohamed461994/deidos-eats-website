import { MapPin, ShoppingBag, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, useMatch, useNavigate } from 'react-router-dom'

import { useMe, useRestaurantBySlug } from '@/api/queries'
import { useAuth } from '@/auth/context'
import { useCart } from '@/cart/context'
import { BranchPickerDialog } from '@/components/branch-picker'
import { PLATFORM_NAME } from '@/lib/brand'
import { resolveSelectedBranch, useRememberedBranch } from '@/lib/branch-selection'
import { formatCents } from '@/lib/money'
import { paths } from '@/lib/routes'
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
  const navigate = useNavigate()

  // Restaurant chrome (name crumb, branch chip, restaurant nav) appears ONLY
  // inside `/r/:slug`. On global routes the header is pure platform chrome —
  // identity there is derived from the cart/order, never "last restaurant browsed".
  const match = useMatch('/r/:slug/*')
  const slug = match?.params.slug
  const { data: restaurant } = useRestaurantBySlug(slug) // cached — layout already fetched it

  const [rememberedBranchId, rememberBranch] = useRememberedBranch(restaurant?.id ?? null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const effectiveBranchId = resolveSelectedBranch(restaurant?.branches, rememberedBranchId)
  const branch = restaurant?.branches.find((b) => b.id === effectiveBranchId)
  const branchChipLabel = branch ? `Branch: ${branch.name}. Change branch` : 'Choose a branch'

  // Surface the signed-in user's first name next to the account icon. While /me
  // is loading, errored, or nameless, `firstName` is empty and we fall back to
  // the plain icon — the name simply appears once available.
  const firstName = me.data?.fullName?.trim().split(/\s+/)[0] ?? ''
  const showName = status === 'signedIn' && firstName !== ''

  return (
    <header
      className="sticky top-0 border-b border-border/60 bg-bg/90 backdrop-blur-md"
      style={{ zIndex: 'var(--z-sticky)' }}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Link
          to={paths.discovery()}
          className="display flex items-baseline gap-1.5 text-[22px] tracking-tight text-basil-deep"
          aria-label={`${PLATFORM_NAME} — home`}
        >
          {PLATFORM_NAME}
          <span className="ember-dot translate-y-[-0.1em]" aria-hidden />
        </Link>

        {/* Restaurant crumb — the current restaurant's own space, one tap home. */}
        {restaurant && (
          <>
            <span aria-hidden className="hidden text-muted sm:inline">
              /
            </span>
            <Link
              to={paths.restaurant(restaurant.slug)}
              className="hidden max-w-[10rem] truncate text-[15px] font-[650] text-ink underline-offset-4 hover:underline sm:block"
            >
              {restaurant.name}
            </Link>
          </>
        )}

        {/* Restaurant nav — scoped to this restaurant only. */}
        {restaurant && (
          <nav aria-label="Restaurant" className="ml-1 hidden items-center gap-1 sm:flex">
            <button
              type="button"
              onClick={() =>
                navigate(
                  effectiveBranchId
                    ? paths.restaurantMenu(restaurant.slug, effectiveBranchId)
                    : paths.restaurant(restaurant.slug),
                )
              }
              className={navLinkClasses({ isActive: !!match?.pathname.includes('/menu') })}
            >
              Menu
            </button>
            <NavLink to={paths.restaurantLocations(restaurant.slug)} className={navLinkClasses}>
              Locations
            </NavLink>
          </nav>
        )}

        <div className="ml-auto flex items-center gap-2">
          {status === 'signedIn' && (
            <NavLink to={paths.orders()} className={cn(navLinkClasses, 'hidden sm:block')}>
              Orders
            </NavLink>
          )}

          {/* Branch chip — restaurant context only. */}
          {restaurant && (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="flex h-11 items-center gap-1.5 rounded-full border border-border px-3 text-[15px] font-[550] text-ink transition-colors hover:bg-surface sm:px-4"
              aria-label={branchChipLabel}
            >
              <MapPin className="size-4 shrink-0 text-basil" aria-hidden />
              <span className="max-w-[4.5rem] truncate sm:max-w-[9rem]">
                {branch ? branch.name : 'Choose branch'}
              </span>
              {branch && (
                <span
                  aria-hidden
                  className={cn(
                    'hidden size-2 shrink-0 rounded-full sm:block',
                    branch.isOpen ? 'bg-basil' : 'bg-muted',
                  )}
                />
              )}
            </button>
          )}

          <Link
            to={status === 'signedIn' ? paths.account() : paths.signIn()}
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

      {restaurant && (
        <BranchPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          branches={restaurant.branches}
          selectedId={effectiveBranchId}
          title={`Choose a ${restaurant.name} location`}
          onSelected={(b) => {
            rememberBranch(b.id)
            navigate(paths.restaurantMenu(restaurant.slug, b.id))
          }}
        />
      )}
    </header>
  )
}
