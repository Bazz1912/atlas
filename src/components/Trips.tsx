import { validBudget } from '../../supabase/functions/_shared/atlas/costs'
import { TripCostCard } from './TripCostCard'
import { useState } from 'react'
import { ArrowDown, ArrowUp, Bookmark, Plus, Route, Save, Sparkles, Trash2, X } from 'lucide-react'
import type { Experience, Trip } from '../domain'
import { addToTrip, newTrip, tripRepository } from '../services/archive'
import { routingService, currentRoute, formatDistance, formatDuration } from '../services/routing'
import { missingGeoapify } from '../services/geoapify'
import { useTripWeatherSchedule } from '../hooks/useTripWeatherSchedule'
import { useRouteCalculation } from '../hooks/useRouteCalculation'
import { OriginPicker } from './OriginPicker'
import { WeatherNotice } from './WeatherNotice'
export function Trips({
  items,
  trip,
  onChange,
  saved,
  onRefresh,
  onSuggest,
  onShowRoute,
}: {
  items: Experience[]
  trip: Trip
  onChange: (trip: Trip) => void
  saved: Trip[]
  onRefresh: () => Promise<void>
  onSuggest: (indoor?: boolean) => void
  onShowRoute: () => void
}) {
  const [adding, setAdding] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [deleting, setDeleting] = useState<string | null>(null)
  const routing = useRouteCalculation(trip, items, onChange)
  const route = currentRoute(trip, items)
  const weatherSchedule = useTripWeatherSchedule(trip, items)
  const invalidStops = trip.waypoints.some(
    (w) => !Number.isFinite(w.stopMinutes) || w.stopMinutes < 0 || w.stopMinutes > 1440,
  )
  const stops = trip.waypoints.reduce((sum, w) => sum + w.stopMinutes, 0)
  const update = (patch: Partial<Trip>) => {
    onChange({
      ...trip,
      ...patch,
      routeSummary: trip.routeSummary,
      updatedAt: new Date().toISOString(),
    })
    setMessage('')
  }
  const move = (index: number, delta: number) => {
    const next = [...trip.waypoints]
    ;[next[index], next[index + delta]] = [next[index + delta]!, next[index]!]
    update({ waypoints: next })
  }
  const save = async () => {
    setBusy(true)
    setError('')
    try {
      await tripRepository.save({ ...trip, routeSummary: route })
      await onRefresh()
      setMessage('Viaggio salvato nella mappa attiva.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Salvataggio non riuscito.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="trips-editor">
      <div className="feature-banner trip-banner">
        <Route size={23} />
        <div>
          <strong>Le tappe, nell’ordine che vuoi</strong>
          <p>Bozza di questa sessione · salva per ritrovarla</p>
        </div>
      </div>
      <label className="field-label">
        Nome del viaggio
        <input
          maxLength={120}
          value={trip.name}
          onChange={(e) => update({ name: e.target.value })}
        />
      </label>
      <label className="field-label">
        Data (facoltativa)
        <input type="date" value={trip.date} onChange={(e) => update({ date: e.target.value })} />
      </label>
      <label className="field-label">
        Ora di partenza proposta (fuso del luogo di partenza)
        <input
          type="time"
          value={trip.planningPreferences?.localTime || ''}
          onInput={(e) =>
            update({
              planningPreferences: {
                maxDriveMinutes: null,
                notes: '',
                ...trip.planningPreferences,
                localTime: e.currentTarget.value,
                weatherVisitTime: undefined,
                weatherConsents: {},
              },
            })
          }
        />
      </label>
      {weatherSchedule.note && (
        <p className="field-help" role="status">
          {weatherSchedule.note}
        </p>
      )}
      {!route && trip.planningPreferences?.weatherVisitTime && (
        <p className="field-help">
          Meteo all’orario visita proposto da Explorer, locale per ogni tappa. Lo stesso orario è
          proposto per la partenza: puoi modificarlo. Calcola il percorso per aggiornare il meteo
          agli arrivi stimati.
        </p>
      )}
      <details className="origin-details">
        <summary>Partenza {trip.origin ? `· ${trip.origin.address}` : '· da scegliere'}</summary>
        <OriginPicker items={items} value={trip.origin} onChange={(origin) => update({ origin })} />
      </details>
      <div className="trip-stops">
        <h2>
          {trip.waypoints.length} {trip.waypoints.length === 1 ? 'tappa' : 'tappe'}
        </h2>
        {!trip.waypoints.length && (
          <p className="field-help">Aggiungi i tuoi luoghi o cerca un’idea in AI Explorer.</p>
        )}
        {trip.waypoints.map((waypoint, index) => {
          const item = items.find((i) => i.id === waypoint.experienceId)
          return (
            <article className="trip-stop" key={waypoint.experienceId}>
              <div className="stop-top">
                <span className="stop-number">{index + 1}</span>
                {item?.imageUrl && <img src={item.imageUrl} alt="" />}
                <div>
                  <strong>{item?.title || 'Luogo eliminato dall’archivio'}</strong>
                  <small>
                    {item?.address ||
                      'Rimuovi questa referenza prima di salvare o calcolare un percorso.'}
                  </small>
                </div>
                <button
                  className="icon-button small"
                  aria-label={`Rimuovi tappa ${index + 1}`}
                  onClick={() =>
                    update({ waypoints: trip.waypoints.filter((_, i) => i !== index) })
                  }
                >
                  <X size={17} />
                </button>
              </div>
              <div className="stop-controls">
                <button
                  className="icon-button"
                  aria-label={`Sposta tappa ${index + 1} prima`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Sposta tappa ${index + 1} dopo`}
                  disabled={index === trip.waypoints.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown size={17} />
                </button>
                <label>
                  Sosta
                  <input
                    aria-label={`Minuti di sosta tappa ${index + 1}`}
                    type="number"
                    min="0"
                    max="1440"
                    value={waypoint.stopMinutes}
                    onChange={(e) =>
                      update({
                        waypoints: trip.waypoints.map((w, i) =>
                          i === index ? { ...w, stopMinutes: Number(e.target.value) } : w,
                        ),
                      })
                    }
                  />
                  min
                </label>
              </div>
              {route && route.legs[index - (trip.origin ? 0 : 1)] && (
                <p className="field-help">
                  Tratto in auto:{' '}
                  {formatDistance(route.legs[index - (trip.origin ? 0 : 1)]!.distanceMeters)} ·{' '}
                  {formatDuration(route.legs[index - (trip.origin ? 0 : 1)]!.durationSeconds)}
                </p>
              )}
              {item && (
                <WeatherNotice
                  item={item}
                  date={trip.date}
                  time={!route ? trip.planningPreferences?.weatherVisitTime : undefined}
                  instant={weatherSchedule.arrivals[item.id]}
                  acceptedKey={trip.planningPreferences?.weatherConsents?.[item.id]}
                  onAccept={(key) =>
                    update({
                      planningPreferences: {
                        maxDriveMinutes: null,
                        notes: '',
                        localTime: '',
                        ...trip.planningPreferences,
                        weatherConsents: {
                          ...trip.planningPreferences?.weatherConsents,
                          [item.id]: key,
                        },
                      },
                    })
                  }
                  onAlternative={() => onSuggest(true)}
                />
              )}
            </article>
          )
        })}
      </div>
      <div className="trip-buttons">
        <button className="secondary-button" onClick={() => setAdding((v) => !v)}>
          <Plus size={17} />
          Aggiungi tappa
        </button>
        <button className="secondary-button" onClick={() => onSuggest()}>
          <Sparkles size={17} />
          Suggeriscimi una tappa
        </button>
      </div>
      {adding && (
        <div className="stop-picker">
          {items
            .filter((i) => !trip.waypoints.some((w) => w.experienceId === i.id))
            .map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onChange(addToTrip(trip, [item.id]))
                  setAdding(false)
                }}
              >
                <Plus size={16} />
                {item.title}
              </button>
            ))}
          {!items.filter((i) => !trip.waypoints.some((w) => w.experienceId === i.id)).length && (
            <p className="field-help">Non ci sono altri luoghi salvati disponibili.</p>
          )}
        </div>
      )}
      <div className="route-summary">
        {trip.planningPreferences?.availableMinutes != null && (
          <p>
            Tempo disponibile: {trip.planningPreferences.availableMinutes} min ·{' '}
            {route && !invalidStops
              ? route.durationSeconds + stops * 60 <= trip.planningPreferences.availableMinutes * 60
                ? 'rispettato dal piano'
                : 'superato dal piano modificato'
              : 'da verificare con percorso e soste'}
            .
          </p>
        )}
        {trip.planningPreferences?.maxDriveMinutes != null && (
          <p>
            Preferenza conservata: massimo {trip.planningPreferences.maxDriveMinutes} minuti in auto
            ·{' '}
            {route
              ? route.durationSeconds <= trip.planningPreferences.maxDriveMinutes * 60
                ? 'rispettato dal percorso'
                : 'superato dal percorso'
              : 'da verificare calcolando il percorso'}
            .
          </p>
        )}
        {trip.planningPreferences?.notes && (
          <p>Le tue preferenze: {trip.planningPreferences.notes}</p>
        )}
        <strong>
          {invalidStops
            ? 'Correggi le soste: da 0 a 1440 minuti per tappa.'
            : `Soste previste: ${stops} minuti`}
        </strong>
        {route ? (
          <>
            <p>
              <strong>
                Guida: {formatDuration(route.durationSeconds)} ·{' '}
                {formatDistance(route.distanceMeters)}
              </strong>
            </p>
            <p>
              {invalidStops
                ? 'Totale non disponibile: correggi le soste.'
                : `Soste: ${formatDuration(stops * 60)} · Totale previsto: ${formatDuration(route.durationSeconds + stops * 60)}`}
            </p>
            <p className="field-help">
              Percorso Geoapify in auto, nell’ordine delle tappe. Tempi stimati senza traffico in
              tempo reale. Calcolato il {new Date(route.calculatedAt).toLocaleString('it')}.
            </p>
            <button className="secondary-button" onClick={onShowRoute}>
              Mostra percorso sulla mappa
            </button>
          </>
        ) : (
          <p>
            {routingService.configured
              ? 'Calcola il percorso per conoscere distanza stradale e stime di guida Geoapify.'
              : 'Geoapify non è ancora configurato. Nessuna distanza o durata di guida stimata.'}
          </p>
        )}
        {!routingService.configured && <p className="field-help">{missingGeoapify}</p>}
        <button
          className="secondary-button"
          disabled={routing.busy || !routingService.configured}
          onClick={() => void routing.calculate()}
        >
          {routing.busy
            ? 'Calcolo percorso…'
            : route
              ? 'Ricalcola percorso'
              : 'Calcola percorso in auto'}
        </button>
        {routing.error && (
          <p className="inline-error" role="alert">
            {routing.error}
          </p>
        )}
        <p className="field-help">
          Routing:{' '}
          <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">
            Geoapify
          </a>{' '}
          · dati{' '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            OpenStreetMap
          </a>
        </p>
      </div>
      <TripCostCard trip={trip} items={items} route={route} onChange={onChange} />
      <button
        className="primary-button"
        disabled={
          busy ||
          invalidStops ||
          !trip.waypoints.length ||
          !!(trip.budget && !validBudget(trip.budget))
        }
        onClick={() => void save()}
      >
        <Save size={17} />
        {busy ? 'Salvataggio…' : 'Salva viaggio'}
      </button>
      {message && (
        <p role="status" className="success-note">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <button
        className="text-button"
        onClick={() => {
          onChange(newTrip())
          setError('')
          setMessage('')
        }}
      >
        <Plus size={17} />
        Nuovo viaggio
      </button>
      <section className="saved-trips">
        <h2>
          <Bookmark size={17} />
          Viaggi salvati
        </h2>
        {!saved.length && <p className="field-help">I viaggi che salvi compariranno qui.</p>}
        {saved.map((savedTrip) => (
          <div key={savedTrip.id} className="saved-trip-row">
            <button
              onClick={() => {
                onChange(savedTrip)
                setError('')
                setMessage('')
              }}
            >
              <strong>{savedTrip.name}</strong>
              <small>
                {savedTrip.waypoints.length} {savedTrip.waypoints.length === 1 ? 'tappa' : 'tappe'}{' '}
                · {savedTrip.date || 'Senza data'}
              </small>
            </button>
            <button
              className="icon-button"
              aria-label={`Elimina viaggio ${savedTrip.name}`}
              onClick={() => setDeleting(savedTrip.id)}
            >
              <Trash2 size={17} />
            </button>
            {deleting === savedTrip.id && (
              <div className="confirm-panel">
                <p>Eliminare “{savedTrip.name}”? Le esperienze rimarranno nell’archivio.</p>
                <button
                  className="danger-button"
                  onClick={() => {
                    void tripRepository
                      .remove(savedTrip.id)
                      .then(onRefresh)
                      .then(() => setDeleting(null))
                      .catch(() => setError('Impossibile eliminare il viaggio.'))
                  }}
                >
                  Conferma eliminazione viaggio
                </button>
                <button className="text-button" onClick={() => setDeleting(null)}>
                  Annulla
                </button>
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  )
}
