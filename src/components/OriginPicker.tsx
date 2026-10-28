import { currentScope } from '../account/scope'
import { useEffect, useState } from 'react'
import { LocateFixed, Home } from 'lucide-react'
import type { Experience, Place } from '../domain'
import { readAll, write } from '../services/localStore'
import { PlaceSearch } from './PlaceSearch'
export function OriginPicker({
  items,
  value,
  onChange,
}: {
  items: Experience[]
  value: Place | null
  onChange: (place: Place | null) => void
}) {
  const [home, setHome] = useState<Place | null>(null),
    [error, setError] = useState('')
  useEffect(() => {
    if (currentScope()) return
    void readAll<{ id: string; value: Place }>('meta')
      .then((all) => setHome(all.find((m) => m.id === 'home')?.value || null))
      .catch(() => setError('Posizione Casa non disponibile.'))
  }, [])
  const locate = () => {
    if (!navigator.geolocation) {
      setError('Geolocalizzazione non supportata.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        onChange({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          address: 'Posizione attuale',
          source: 'map',
        })
        setError('')
      },
      () => setError('Posizione non disponibile o permesso negato.'),
      { timeout: 12000, enableHighAccuracy: true },
    )
  }
  return (
    <div className="origin-picker">
      <label className="field-label">
        Partenza da un luogo salvato
        <select
          value=""
          onChange={(e) => {
            const item = items.find((i) => i.id === e.target.value)
            if (item)
              onChange({
                address: item.address,
                latitude: item.latitude,
                longitude: item.longitude,
                source: item.source,
              })
          }}
        >
          <option value="">Scegli un luogo (facoltativo)</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.title}
            </option>
          ))}
        </select>
      </label>
      <div className="origin-actions">
        <button type="button" className="secondary-button" onClick={locate}>
          <LocateFixed size={16} />
          Posizione attuale
        </button>
        {home && (
          <button type="button" className="secondary-button" onClick={() => onChange(home)}>
            <Home size={16} />
            Casa
          </button>
        )}
      </div>
      <PlaceSearch onPlace={onChange} label="Cerca indirizzo di partenza" />
      {value && (
        <div className="chosen-origin">
          <strong>{value.address}</strong>
          <small>
            {value.latitude.toFixed(4)}, {value.longitude.toFixed(4)}
          </small>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              if (currentScope()) {
                setHome(value)
                return
              }
              void write(['meta'], (tx) => tx.objectStore('meta').put({ id: 'home', value }))
                .then(() => setHome(value))
                .catch(() => setError('Impossibile salvare Casa.'))
            }}
          >
            Usa questo punto come Casa nella sessione
          </button>
          <button type="button" className="text-button" onClick={() => onChange(null)}>
            Rimuovi partenza
          </button>
        </div>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
