import { currentScope } from '../account/scope'
import { useEffect, useState } from 'react'
import type { Trip } from '../domain'
import { newTrip } from '../services/archive'
import { readAll, write } from '../services/localStore'
export function useTripDraft() {
  const [trip, setTrip] = useState<Trip>(newTrip),
    [ready, setReady] = useState(false),
    [error, setError] = useState('')
  useEffect(() => {
    if (currentScope()) {
      setReady(true)
      return
    }
    void readAll<{ id: string; value: Trip }>('meta')
      .then((all) => {
        const saved = all.find((x) => x.id === 'trip-draft')
        if (saved) setTrip(saved.value)
        setReady(true)
      })
      .catch(() => {
        setError('Bozza non disponibile.')
        setReady(true)
      })
  }, [])
  useEffect(() => {
    if (ready && !currentScope())
      void write(['meta'], (tx) =>
        tx.objectStore('meta').put({ id: 'trip-draft', value: trip }),
      ).catch(() => setError('Impossibile conservare la bozza del viaggio.'))
  }, [trip, ready])
  return { trip, setTrip, ready, error }
}
