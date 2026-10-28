import { useEffect, useState } from 'react'
import type { Experience, Trip } from '../domain'
import { currentRoute } from '../services/routing'
import { visitInstant, weatherService } from '../services/weather'

import { arrivalInstants } from '../services/tripSchedule'
export { arrivalInstants } from '../services/tripSchedule'

export function useTripWeatherSchedule(trip: Trip, items: Experience[]) {
  const time = trip.planningPreferences?.localTime || ''
  const route = currentRoute(trip, items)
  const first = items.find((i) => i.id === trip.waypoints[0]?.experienceId)
  const origin = trip.origin || first
  const key = JSON.stringify([
    trip.date,
    time,
    trip.planningPreferences?.weatherVisitTime,
    origin?.latitude,
    origin?.longitude,
    route?.fingerprint,
    route?.calculatedAt,
    trip.waypoints,
  ])
  const [state, setState] = useState<{
    key: string
    arrivals: Record<string, string>
    note: string
  }>({ key: '', arrivals: {}, note: '' })
  useEffect(() => {
    const abort = new AbortController()
    const finish = (arrivals: Record<string, string>, note: string) => {
      if (!abort.signal.aborted) setState({ key, arrivals, note })
    }
    if (!trip.date || !time || !origin || !route) {
      finish(
        {},
        time && !route
          ? trip.planningPreferences?.weatherVisitTime
            ? 'Arrivi non stimati: il percorso non è ancora calcolato.'
            : 'Senza percorso calcolato: meteo giornaliero, arrivi non stimati.'
          : '',
      )
      return () => abort.abort()
    }
    void weatherService
      .forecast(
        {
          latitude: origin.latitude,
          longitude: origin.longitude,
          date: trip.date,
          localTime: time,
        },
        abort.signal,
      )
      .then((forecast) => {
        if (!forecast.available) {
          finish(
            {},
            'Arrivi non disponibili: meteo giornaliero, fuso della partenza non verificato.',
          )
          return
        }
        const departure = visitInstant(trip.date, time, forecast.timezone)
        if (!departure) {
          finish(
            {},
            'Orario della partenza ambiguo o inesistente per il cambio d’ora: scegli un altro orario. Meteo giornaliero.',
          )
          return
        }
        const arrivals = arrivalInstants(trip, items, departure)
        finish(
          arrivals,
          Object.keys(arrivals).length
            ? `Partenza ${trip.date} alle ${time} (${forecast.timezone}). Arrivi stimati con guida e soste; il meteo usa il fuso di ogni tappa.`
            : 'Arrivi non disponibili: verifica percorso e soste. Meteo giornaliero.',
        )
      })
      .catch(() => finish({}, 'Arrivi non disponibili: meteo giornaliero.'))
    return () => abort.abort()
    // The key captures every route, place, date, time and stop input used above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state.key === key
    ? state
    : {
        arrivals: {} as Record<string, string>,
        note: time && route ? 'Verifica degli arrivi e dei fusi orari…' : '',
      }
}
