/**
 * Admin banners — the market hall's poster wall. One banner spans the content
 * width; several become a snap-scroll row. Image-led when an image is set,
 * basil-tint poster otherwise. A banner with a `linkUrl` is one whole-card
 * link: internal routes stay in the SPA, absolute URLs open in a new tab
 * (the API validates schemes; the internal-route check here is routing, not
 * security). No banners → the section does not exist.
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import type { MarketplaceBanner } from '@/api/types'
import { cn } from '@/lib/utils'

function BannerShell({
  banner,
  children,
  className,
}: {
  banner: MarketplaceBanner
  children: ReactNode
  className?: string
}) {
  const linkUrl = banner.linkUrl ?? null
  if (linkUrl && linkUrl.startsWith('/')) {
    return (
      <Link to={linkUrl} className={className}>
        {children}
      </Link>
    )
  }
  // Fail closed on anything but https: a stored javascript:/data: URL must never become a live
  // href on the buyer home, even though the admin form and API both reject such values.
  if (linkUrl && linkUrl.startsWith('https://')) {
    return (
      <a href={linkUrl} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    )
  }
  return <div className={className}>{children}</div>
}

function BannerCard({ banner, solo }: { banner: MarketplaceBanner; solo: boolean }) {
  // Poster voice scales with the card: the solo full-width banner speaks at
  // near-section volume; cards sharing a snap row each drop a step.
  const titleClass = solo ? 'text-[clamp(1.625rem,3.5vw,2.5rem)]' : 'text-2xl sm:text-[1.75rem]'
  const bodyClass = 'mt-2 max-w-[52ch] text-pretty text-base sm:text-[17px]'
  return (
    <BannerShell
      banner={banner}
      className={cn(
        'group relative block snap-start overflow-hidden rounded-[24px]',
        solo ? 'w-full' : 'w-[85%] shrink-0 sm:w-[520px]',
        banner.linkUrl && 'transition-shadow hover:shadow-floating',
      )}
    >
      {banner.imageUrl ? (
        <>
          <img
            src={banner.imageUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 size-full bg-surface object-cover transition-transform duration-500 ease-(--ease-out) group-hover:scale-[1.02] motion-reduce:transition-none"
          />
          {/* Scrim so paper text holds ≥4.5:1 on any photo. */}
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-black/78 via-black/30 to-transparent"
          />
          {/* The caption is the in-flow box: the aspect ratio sets the card's
              shape, but long admin copy grows the card instead of clipping off
              the top (it did, on ≤320px screens, when the image owned the
              ratio and the text was absolutely positioned). */}
          <div
            className={cn(
              'relative flex aspect-[16/9] flex-col justify-end sm:aspect-[3/1]',
              solo ? 'p-6 sm:p-8' : 'p-5 sm:p-7',
            )}
          >
            <h3 className={cn('display text-white', titleClass)}>{banner.title}</h3>
            {banner.body && <p className={cn(bodyClass, 'text-white/90')}>{banner.body}</p>}
          </div>
        </>
      ) : (
        <div
          className={cn(
            'flex min-h-36 flex-col justify-center bg-basil-tint',
            solo ? 'p-6 sm:p-8' : 'p-5 sm:p-7',
          )}
        >
          <h3 className={cn('display text-basil-deep', titleClass)}>{banner.title}</h3>
          {banner.body && <p className={cn(bodyClass, 'text-ink')}>{banner.body}</p>}
        </div>
      )}
    </BannerShell>
  )
}

export function BannerStrip({ banners }: { banners: MarketplaceBanner[] }) {
  if (banners.length === 0) return null
  return (
    <section aria-label="Offers and news">
      {banners.length === 1 ? (
        <BannerCard banner={banners[0]} solo />
      ) : (
        // scroll-padding mirrors the inline padding — mandatory snap would
        // otherwise pin banners to the screen edge (see item-strip.tsx).
        <div className="-mx-4 flex snap-x snap-mandatory scroll-pl-4 gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:scroll-pl-6 sm:px-6">
          {banners.map((banner) => (
            <BannerCard key={banner.id} banner={banner} solo={false} />
          ))}
        </div>
      )}
    </section>
  )
}
