/**
 * One browser-geolocation state machine for every "use my location" button
 * (home location control, branch picker). Owns the loading flag and the
 * human-facing failure note; the caller decides what a successful fix means
 * (sort in memory, round-and-store, …). The fix handed to `onFix` is the raw
 * reading — callers that persist it are responsible for rounding first.
 *
 * Latest-wins: each `locate()` invalidates any earlier in-flight request, and
 * unmount (or an explicit `cancel()`) invalidates all of them — a slow GPS
 * answer (e.g. a permission prompt left open) must never overwrite a newer,
 * explicit location choice or fire into an unmounted component.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

interface LocateOptions {
  onFix: (coords: { latitude: number; longitude: number }) => void
  /** Shown when the device has no geolocation at all. */
  unavailableMessage: string
  /** Shown when the fix fails or is denied. */
  failedMessage: string
}

export function useGeolocate() {
  const [locating, setLocating] = useState(false)
  const [geoNote, setGeoNote] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const cancel = useCallback(() => {
    requestIdRef.current += 1
    setLocating(false)
  }, [])

  // Unmount invalidates in-flight fixes (the setState above is then a no-op).
  useEffect(() => cancel, [cancel])

  function locate({ onFix, unavailableMessage, failedMessage }: LocateOptions) {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoNote(unavailableMessage)
      return
    }
    const requestId = ++requestIdRef.current
    setLocating(true)
    setGeoNote(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (requestIdRef.current !== requestId) return
        setLocating(false)
        onFix({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
      },
      () => {
        if (requestIdRef.current !== requestId) return
        setLocating(false)
        setGeoNote(failedMessage)
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    )
  }

  return { locate, cancel, locating, geoNote, clearGeoNote: () => setGeoNote(null) }
}
