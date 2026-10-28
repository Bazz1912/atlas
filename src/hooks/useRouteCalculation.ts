import { useEffect, useRef, useState } from 'react'
import type { Experience, Trip } from '../domain'
import { routeFingerprint, routingService } from '../services/routing'
export function useRouteCalculation(
  trip: Trip,
  items: Experience[],
  onChange: (trip: Trip) => void,
) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null),
    latest = useRef({ trip, items, onChange })
  latest.current = { trip, items, onChange }
  let fingerprint = ''
  try {
    fingerprint = routeFingerprint(trip, items)
  } catch {
    /* L'errore viene mostrato al calcolo, senza mantenere un vecchio percorso. */
  }
  useEffect(() => {
    controller.current?.abort()
    setBusy(false)
    setError('')
    return () => controller.current?.abort()
  }, [trip.id, fingerprint])
  const calculate = async () => {
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    setBusy(true)
    setError('')
    const snapshot = latest.current
    try {
      const result = await routingService.calculate(snapshot.trip, snapshot.items, request.signal)
      if (request.signal.aborted) return
      const current = latest.current
      if (
        current.trip.id !== snapshot.trip.id ||
        routeFingerprint(current.trip, current.items) !== result.fingerprint
      )
        return
      current.onChange({
        ...current.trip,
        routeSummary: result,
        updatedAt: new Date().toISOString(),
      })
    } catch (e) {
      if (!request.signal.aborted)
        setError(e instanceof Error ? e.message : 'Percorso non disponibile.')
    } finally {
      if (controller.current === request) setBusy(false)
    }
  }
  return { busy, error, calculate }
}
