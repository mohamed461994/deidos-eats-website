/**
 * One browser-geolocation state machine for every "use my location" button
 * (home location control, branch picker). Owns the loading flag and the
 * human-facing failure note; the caller decides what a successful fix means
 * (sort in memory, round-and-store, …). The fix handed to `onFix` is the raw
 * reading — callers that persist it are responsible for rounding first.
 */
import { useState } from 'react'

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

  function locate({ onFix, unavailableMessage, failedMessage }: LocateOptions) {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoNote(unavailableMessage)
      return
    }
    setLocating(true)
    setGeoNote(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        onFix({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
      },
      () => {
        setLocating(false)
        setGeoNote(failedMessage)
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    )
  }

  return { locate, locating, geoNote, clearGeoNote: () => setGeoNote(null) }
}
