import { useEffect, useRef, useState } from 'react'

import type { MenuItem } from '@/api/types'
import { errorMessage } from '@/api'
import { useMenu, useRestaurant } from '@/api/queries'
import { FoodImage } from '@/components/food-image'
import { ItemDialog } from '@/components/item-dialog'
import { ErrorState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useSelectedBranch } from '@/lib/branch-selection'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'

function categoryAnchor(categoryId: string) {
  return `category-${categoryId}`
}

export function MenuPage() {
  const restaurantQuery = useRestaurant()
  const restaurant = restaurantQuery.data
  const [selectedBranchId, selectBranch] = useSelectedBranch()
  const branchId = selectedBranchId ?? restaurant?.branches[0]?.id ?? null
  const branch = restaurant?.branches.find((b) => b.id === branchId)
  const menuQuery = useMenu(branchId)
  const menu = menuQuery.data

  const [activeItem, setActiveItem] = useState<MenuItem | null>(null)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const sectionsRef = useRef<Map<string, HTMLElement>>(new Map())

  // Scrollspy: highlight the category currently in view
  useEffect(() => {
    if (!menu) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActiveCategory(visible[0].target.id)
      },
      { rootMargin: '-120px 0px -60% 0px' },
    )
    sectionsRef.current.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [menu])

  if (menuQuery.isError || restaurantQuery.isError) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <ErrorState
          message={errorMessage(menuQuery.error ?? restaurantQuery.error)}
          onRetry={() => {
            void restaurantQuery.refetch()
            void menuQuery.refetch()
          }}
        />
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
      <header className="pt-10 pb-6">
        <h1 className="display text-[clamp(2rem,4.5vw,3.25rem)]">The menu</h1>
        {/* Branch picker */}
        <div role="radiogroup" aria-label="Choose a branch" className="mt-5 flex flex-wrap gap-2">
          {(restaurant?.branches ?? []).map((b) => {
            const selected = b.id === branchId
            return (
              <button
                key={b.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => selectBranch(b.id)}
                className={cn(
                  'flex h-11 items-center gap-2 rounded-full border px-5 text-[15px] font-[550] transition-colors',
                  selected
                    ? 'border-basil bg-basil text-on-basil'
                    : 'border-border text-ink hover:bg-surface',
                )}
              >
                {b.name}
                {!b.isOpen && (
                  <span className={cn('text-[13px]', selected ? 'text-on-basil/80' : 'text-muted')}>
                    · Closed
                  </span>
                )}
              </button>
            )
          })}
        </div>
        {branch && !branch.isOpen && (
          <p role="status" className="mt-3 text-[15px] text-muted">
            {branch.name} is closed right now — you can browse, but ordering opens with the
            kitchen. Hours are on the locations page.
          </p>
        )}
      </header>

      {/* Category nav — sticky under the header */}
      {menu && (
        <nav
          aria-label="Menu categories"
          className="sticky top-16 -mx-4 border-b border-border/70 bg-bg/95 px-4 py-2 backdrop-blur-md sm:-mx-6 sm:px-6"
          style={{ zIndex: 'calc(var(--z-sticky) - 1)' }}
        >
          <div className="flex gap-1 overflow-x-auto">
            {menu.categories.map((category) => (
              <a
                key={category.id}
                href={`#${categoryAnchor(category.id)}`}
                className={cn(
                  'shrink-0 rounded-full px-4 py-2 text-[15px] font-[550] transition-colors',
                  activeCategory === categoryAnchor(category.id)
                    ? 'bg-basil-tint text-basil-deep'
                    : 'text-muted hover:bg-surface hover:text-ink',
                )}
              >
                {category.name}
              </a>
            ))}
          </div>
        </nav>
      )}

      {/* Sections */}
      {!menu ? (
        <div className="grid gap-6 pt-8 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i}>
              <Skeleton className="aspect-[4/3] w-full rounded-[16px]" />
              <Skeleton className="mt-3 h-5 w-3/5" />
              <Skeleton className="mt-2 h-4 w-4/5" />
            </div>
          ))}
        </div>
      ) : (
        menu.categories.map((category) => (
          <section
            key={category.id}
            id={categoryAnchor(category.id)}
            ref={(el) => {
              if (el) sectionsRef.current.set(categoryAnchor(category.id), el)
              else sectionsRef.current.delete(categoryAnchor(category.id))
            }}
            aria-labelledby={`${categoryAnchor(category.id)}-heading`}
            className="scroll-mt-32 pt-10"
          >
            <h2 id={`${categoryAnchor(category.id)}-heading`} className="display text-2xl">
              {category.name}
            </h2>
            <ul className="mt-5 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {category.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => item.isAvailable && setActiveItem(item)}
                    disabled={!item.isAvailable}
                    className="group w-full text-left disabled:cursor-not-allowed"
                    aria-label={`${item.name}, ${formatCents(item.priceCents)}${item.isAvailable ? '' : ', sold out'}`}
                  >
                    <div className="relative overflow-hidden rounded-[16px]">
                      <FoodImage
                        src={item.imageUrl ?? null}
                        alt=""
                        fallbackLabel={item.name}
                        className={cn(
                          'aspect-[4/3] w-full transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
                          item.isAvailable && 'group-hover:scale-[1.04]',
                          !item.isAvailable && 'opacity-50 saturate-50',
                        )}
                      />
                      {!item.isAvailable && (
                        <Badge variant="neutral" className="absolute top-3 left-3 bg-bg/90">
                          Sold out today
                        </Badge>
                      )}
                    </div>
                    <div className="mt-3 flex items-baseline justify-between gap-3">
                      <h3 className="font-[650]">{item.name}</h3>
                      <p className="tabular-nums shrink-0 text-muted">
                        {formatCents(item.priceCents)}
                      </p>
                    </div>
                    {item.description && (
                      <p className="mt-1 line-clamp-2 text-[15px] text-muted">{item.description}</p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {branch && (
        <ItemDialog
          item={activeItem}
          branchId={branch.id}
          branchName={branch.name}
          onClose={() => setActiveItem(null)}
        />
      )}
    </main>
  )
}
