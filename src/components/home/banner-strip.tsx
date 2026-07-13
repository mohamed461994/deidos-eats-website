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
  if (linkUrl) {
    return (
      <a href={linkUrl} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    )
  }
  return <div className={className}>{children}</div>
}

function BannerCard({ banner, solo }: { banner: MarketplaceBanner; solo: boolean }) {
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
            className="aspect-[5/2] w-full bg-surface object-cover transition-transform duration-500 ease-(--ease-out) group-hover:scale-[1.02] motion-reduce:transition-none sm:aspect-[3/1]"
          />
          {/* Scrim so paper text holds ≥4.5:1 on any photo. */}
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-black/72 via-black/25 to-transparent"
          />
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
            <h3 className="display text-xl text-white sm:text-2xl">{banner.title}</h3>
            {banner.body && (
              <p className="mt-1 max-w-[60ch] text-[15px] text-white/85">{banner.body}</p>
            )}
          </div>
        </>
      ) : (
        <div className="flex min-h-32 flex-col justify-center bg-basil-tint p-5 sm:p-7">
          <h3 className="display text-xl text-basil-deep sm:text-2xl">{banner.title}</h3>
          {banner.body && <p className="mt-1 max-w-[60ch] text-[15px] text-ink">{banner.body}</p>}
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
        <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
          {banners.map((banner) => (
            <BannerCard key={banner.id} banner={banner} solo={false} />
          ))}
        </div>
      )}
    </section>
  )
}
