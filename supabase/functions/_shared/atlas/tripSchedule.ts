import type { Experience, Trip } from './domain.ts'
import { currentRoute } from './routing.ts'

/** Absolute arrivals preserve elapsed driving/stops across midnight, zones and DST changes. */
export function arrivalInstants(trip: Trip, items: Experience[], departure: string) {
  const route = currentRoute(trip, items)
  if (
    !route ||
    trip.waypoints.some(
      (w) => !Number.isFinite(w.stopMinutes) || w.stopMinutes < 0 || w.stopMinutes > 1440,
    )
  )
    return {}
  let elapsed = 0
  const arrivals: Record<string, string> = {}
  for (let index = 0; index < trip.waypoints.length; index++) {
    const leg = route.legs[index - (trip.origin ? 0 : 1)]
    if (index > 0 || trip.origin) {
      if (!leg || !Number.isFinite(leg.durationSeconds) || leg.durationSeconds < 0) return {}
      elapsed += leg.durationSeconds
    }
    const stop = trip.waypoints[index]!
    arrivals[stop.experienceId] = new Date(Date.parse(departure) + elapsed * 1000).toISOString()
    elapsed += stop.stopMinutes * 60
  }
  return arrivals
}
