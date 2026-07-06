import { useState } from 'react'

import { cn } from '@/lib/utils'

interface FoodImageProps {
  src: string | null
  alt: string
  className?: string
  /** Fallback initial shown for photo-less items (e.g. drinks). */
  fallbackLabel?: string
}

/**
 * Photography frame: surface-tinted while loading, graceful typographic tile
 * when an item has no photo (imageUrl is nullable in the contract).
 */
export function FoodImage({ src, alt, className, fallbackLabel }: FoodImageProps) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={cn(
          'grid place-items-center bg-crust-tint text-basil-deep',
          className,
        )}
      >
        <span className="display text-3xl opacity-70">
          {(fallbackLabel ?? alt).charAt(0).toUpperCase()}
        </span>
      </div>
    )
  }

  return (
    <div className={cn('overflow-hidden bg-surface', className)}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={cn(
          'size-full object-cover transition-opacity duration-300',
          loaded ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  )
}
