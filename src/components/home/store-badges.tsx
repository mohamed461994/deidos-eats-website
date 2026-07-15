/**
 * App store badges — rendered ONLY when the admin has set the URL(s); no URLs,
 * no section (there is no buyer Android app today, and iOS is TestFlight-only,
 * so shipping dead badges would be a lie). Text-built pills, not the official
 * badge artwork — swap for the real assets when the store listings go live.
 */
import { Apple, Play } from 'lucide-react'

import type { MarketplaceContent } from '@/api/types'

export function StoreBadges({ content }: { content: MarketplaceContent }) {
  // Each store's own call-to-action phrasing — "Get it on the App Store" is
  // neither store's wording and reads as a mistake.
  const badges = [
    content.appStoreUrl && {
      url: content.appStoreUrl,
      icon: Apple,
      store: 'App Store',
      lead: 'Download on the',
    },
    content.playStoreUrl && {
      url: content.playStoreUrl,
      icon: Play,
      store: 'Google Play',
      lead: 'Get it on',
    },
  ].filter(Boolean) as Array<{ url: string; icon: typeof Apple; store: string; lead: string }>

  if (badges.length === 0) return null

  return (
    <section
      aria-label="Get the app"
      className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] bg-surface px-6 py-6 sm:px-8"
    >
      <div>
        <h2 className="display text-xl">Take us with you</h2>
        <p className="mt-1 text-[15px] text-muted">
          Order ahead and track deliveries from your pocket.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        {badges.map(({ url, icon: Icon, store, lead }) => (
          <a
            key={store}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2.5 rounded-full bg-ink px-5 py-2.5 text-bg transition-opacity hover:opacity-85"
          >
            <Icon className="size-5" aria-hidden />
            <span className="text-left leading-tight">
              <span className="block text-[11px] opacity-75">{lead}</span>
              <span className="block text-[15px] font-[650]">{store}</span>
            </span>
          </a>
        ))}
      </div>
    </section>
  )
}
