import { useEffect, useId, useRef, useState } from 'react'
import { LoaderCircle, MapPin, Search, X } from 'lucide-react'
import type { Experience, Place } from '../domain'
import { config } from '../services/config'
import { searchPlaces } from '../services/geocoding'

interface Props {
  items?: Experience[]
  onPlace: (place: Place) => void
  onExperience?: (id: string) => void
  label?: string
}
export function PlaceSearch({
  items = [],
  onPlace,
  onExperience,
  label = 'Cerca un luogo o un’esperienza',
}: Props) {
  const [query, setQuery] = useState('')
  const [places, setPlaces] = useState<Place[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(-1)
  const listId = useId()
  const resultsRef = useRef<HTMLDivElement>(null)
  // Layout only: Safari's keyboard can resize the visual viewport without changing CSS dvh.
  useEffect(() => {
    const panel = resultsRef.current
    if (!panel || !panel.closest('.map-hud')) return
    const viewport = window.visualViewport
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const height = viewport?.height ?? window.innerHeight
        const bottom = (viewport?.offsetTop ?? 0) + height
        const available = Math.max(0, bottom - panel.getBoundingClientRect().top - 16)
        panel.style.setProperty(
          '--search-panel-height',
          `${Math.floor(Math.min(height * 0.55, available))}px`,
        )
      })
    }
    measure()
    window.addEventListener('resize', measure)
    viewport?.addEventListener('resize', measure)
    viewport?.addEventListener('scroll', measure)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', measure)
      viewport?.removeEventListener('resize', measure)
      viewport?.removeEventListener('scroll', measure)
    }
  }, [focused, query])
  useEffect(() => {
    const controller = new AbortController()
    setPlaces([])
    setActive(-1)
    setError('')
    setLoading(false)
    if (query.trim().length < 3 || !config.geoapifyKey) return
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const results = await searchPlaces(query, controller.signal)
        if (!controller.signal.aborted) setPlaces(results)
      } catch (err) {
        if (!controller.signal.aborted)
          setError(err instanceof Error ? err.message : 'Ricerca non disponibile.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 400)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])
  const saved = query.trim()
    ? items
        .filter((item) =>
          `${item.title} ${item.address}`.toLowerCase().includes(query.toLowerCase()),
        )
        .slice(0, 5)
    : []
  const dismiss = () => {
    setQuery('')
    setFocused(false)
  }
  const choose = (index: number) => {
    if (index < saved.length) {
      const item = saved[index]
      if (item) onExperience?.(item.id)
    } else {
      const place = places[index - saved.length]
      if (place) onPlace(place)
    }
    dismiss()
  }
  return (
    <div className="place-search">
      <div className="search-field glass">
        <Search size={20} />
        <input
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={!!(focused && query)}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          aria-label={label}
          placeholder={label}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              const n = saved.length + places.length
              if (n) setActive((i) => (i + (event.key === 'ArrowDown' ? 1 : -1) + n) % n)
            }
            if (event.key === 'Enter') {
              event.preventDefault()
              if (active >= 0) choose(active)
            }
            if (event.key === 'Escape') {
              dismiss()
              event.currentTarget.blur()
            }
          }}
          aria-controls={focused && query ? listId : undefined}
        />
        {loading ? (
          <LoaderCircle className="spin" size={17} />
        ) : query ? (
          <button
            type="button"
            className="icon-button small"
            aria-label="Cancella ricerca"
            onClick={dismiss}
          >
            <X size={17} />
          </button>
        ) : (
          <span className="search-hint">Cerca</span>
        )}
      </div>
      {focused && query && (
        <div
          ref={resultsRef}
          className="search-results glass"
          id={listId}
          role="listbox"
          aria-label="Risultati indirizzi"
        >
          {saved.length > 0 && (
            <>
              <p className="eyebrow">NEI TUOI SALVATI</p>
              {saved.map((item, i) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={active === i}
                  id={`${listId}-${i}`}
                  key={item.id}
                  onClick={() => {
                    onExperience?.(item.id)
                    dismiss()
                  }}
                >
                  <MapPin size={17} />
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.address}</small>
                  </span>
                </button>
              ))}
            </>
          )}
          {places.length > 0 && (
            <>
              <p className="eyebrow">LUOGHI</p>
              {places.map((place, i) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={active === saved.length + i}
                  id={`${listId}-${saved.length + i}`}
                  key={`${place.latitude}-${i}`}
                  onClick={() => {
                    onPlace(place)
                    dismiss()
                  }}
                >
                  <Search size={17} />
                  <span>{place.address}</span>
                </button>
              ))}
            </>
          )}
          {!config.geoapifyKey && (
            <p className="search-note">
              La ricerca di città e indirizzi richiede Geoapify. Per ora cerca nei salvati oppure
              scegli un punto sulla mappa.
            </p>
          )}
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          {config.geoapifyKey && query.trim().length < 3 && (
            <p className="search-note">Scrivi almeno 3 caratteri.</p>
          )}
          {config.geoapifyKey &&
            query.trim().length >= 3 &&
            !loading &&
            !error &&
            !places.length &&
            !saved.length && <p className="search-note">Nessun risultato disponibile.</p>}
          {!!places.length && (
            <p className="search-note">
              Indirizzi:{' '}
              <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">
                Geoapify
              </a>{' '}
              /{' '}
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                OpenStreetMap
              </a>
            </p>
          )}
          <button type="button" className="search-dismiss" onClick={dismiss}>
            Chiudi ricerca
          </button>
        </div>
      )}
    </div>
  )
}
