import { PriceFilterFields } from './components/PriceFilterFields'
import { costLabel } from '../supabase/functions/_shared/atlas/costs'
import type { PriceFilter } from './domain'
import { currentRoute } from './services/routing'
import { backend } from './account/client'
import { useEffect } from 'react'
import { MapSelector, useAccount } from './account/AccountGate'
import { InstallAtlas } from './account/InstallAtlas'
import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowLeft,
  Bookmark,
  Check,
  ChevronRight,
  Cloud,
  Crosshair,
  Download,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Minus,
  Navigation,
  Plus,
  RefreshCw,
  Route,
  Search,
  Settings2,
  SlidersHorizontal,
  Star,
  Sparkles,
  WifiOff,
  X,
} from 'lucide-react'
import {
  categoryName,
  defaultCategories,
  type ReviewDraft,
  filterExperiences,
  priorityLabels,
  sortExperiences,
  type Experience,
  type Filters,
  type Place,
  type Priority,
  type StatusFilter,
  type Tab,
} from './domain'
import { CategoryIcon } from './components/CategoryIcon'
import { CategoryManager } from './components/CategoryManager'
import { Explorer } from './components/Explorer'
import { proposalTrip } from './services/aiExplorer'
import { Trips } from './components/Trips'
import { useArchive } from './hooks/useArchive'
import { useTripDraft } from './hooks/useTripDraft'
import { addToTrip, newTrip, deleteLocalExperience } from './services/archive'
import { useExperiences } from './hooks/useExperiences'
import { type StorageMode } from './services/repository'
import type { MapHandle } from './components/WorldMap'
import { PlaceSearch } from './components/PlaceSearch'
import { Sheet } from './components/Sheet'
import { ExperienceForm } from './components/ExperienceForm'
import { ExperienceDetails } from './components/ExperienceDetails'

const WorldMap = lazy(() =>
  import('./components/WorldMap').then((module) => ({ default: module.WorldMap })),
)
const navigation = [
  { id: 'map', label: 'Mappa', icon: MapIcon },
  { id: 'saved', label: 'Salvati', icon: Bookmark },
  { id: 'ai', label: 'AI Explorer', icon: Sparkles },
  { id: 'trips', label: 'Viaggi', icon: Route },
] as const
function readPreference(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) || fallback
  } catch {
    return fallback
  }
}
function writePreference(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* Le esperienze usano IndexedDB. */
  }
}

export default function App() {
  const [tab, setTab] = useState<Tab>('map')
  const mode: StorageMode = 'cloud'
  const account = useAccount()
  const { items, loading, error, refresh, save } = useExperiences(mode)
  const archive = useArchive()
  const categoryRecords = archive.categories.length ? archive.categories : defaultCategories
  const draft = useTripDraft()
  const [routeVisible, setRouteVisible] = useState(false)
  const displayedRoute = routeVisible ? currentRoute(draft.trip, items) : null
  const [suggesting, setSuggesting] = useState(false)
  const [suggestIndoor, setSuggestIndoor] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [managingCategories, setManagingCategories] = useState(false)
  useEffect(() => {
    const update = () => {
      if (navigator.onLine && document.visibilityState === 'visible') {
        void refresh()
        void archive.refresh()
      }
    }
    const timer = setInterval(update, 30000)
    window.addEventListener('focus', update)
    window.addEventListener('online', update)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', update)
      window.removeEventListener('online', update)
    }
  }, [refresh, archive.refresh])
  useEffect(() => {
    if (!account) return
    const channel = backend().channel('map:' + account.map.id)
    for (const table of [
      'atlas_experiences',
      'atlas_categories',
      'atlas_reviews',
      'atlas_visits',
      'atlas_trips',
    ])
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: 'map_id=eq.' + account.map.id },
        () => {
          void refresh()
          void archive.refresh()
        },
      )
    channel.subscribe()
    return () => {
      void backend().removeChannel(channel)
    }
  }, [account?.map.id, refresh, archive.refresh])
  const refreshAll = async () => {
    await Promise.all([refresh(), archive.refresh()])
  }
  const [status, setStatus] = useState<StatusFilter>(() => {
    const stored = readPreference('atlas-filter', 'ALL')
    return ['ALL', 'TO_DO', 'DONE'].includes(stored) ? (stored as StatusFilter) : 'ALL'
  })
  const [price, setPrice] = useState<PriceFilter>({ mode: 'all', max: null, participants: 1 })
  const [category, setCategory] = useState('')
  const [priority, setPriority] = useState('')
  const [query, setQuery] = useState('')
  const [order, setOrder] = useState('recent')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Experience | undefined>()
  const [place, setPlace] = useState<Place | null>(null)
  const [picking, setPicking] = useState(false)
  const [candidate, setCandidate] = useState<Place | null>(null)
  const [overlay, setOverlay] = useState<'filters' | 'settings' | null>(null)
  const [message, setMessage] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const map = useRef<MapHandle>(null)
  const filters: Filters = {
    status,
    category,
    priority,
    price,
    query: tab === 'saved' ? query : '',
  }
  const filtered = useMemo(
    () =>
      filterExperiences(items, {
        status,
        category,
        priority,
        price,
        query: tab === 'saved' ? query : '',
      }),
    [items, status, category, priority, price, query, tab],
  )
  const selected = items.find((item) => item.id === selectedId)
  const modeLabel = account?.map.name || 'Mappa privata'

  const notify = (text: string) => {
    setMessage(text)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setMessage(''), 5500)
  }
  const setFilter = (value: StatusFilter) => {
    setStatus(value)
    writePreference('atlas-filter', value)
  }
  const switchTab = (value: Tab) => {
    setTab(value)
    setCandidate(null)
    setSelectedId(null)
  }
  const select = (id: string) => {
    setSelectedId(id)
    const item = items.find((value) => value.id === id)
    if (item) map.current?.focus(item)
  }
  const add = (location: Place | null = null) => {
    setCompleting(false)
    setEditing(undefined)
    setPlace(location)
    setCandidate(null)
    setFormOpen(true)
  }
  const closeForm = () => {
    setFormOpen(false)
    setPicking(false)
    setEditing(undefined)
    setPlace(null)
  }
  const saveForm = async (experience: Experience, photo: Blob | null, review?: ReviewDraft) => {
    await save(experience, photo, review)
    await archive.refresh()
    closeForm()
    setTab('map')
    setQuery('')
    setPrice({ mode: 'all', max: null, participants: 1 })
    setCategory('')
    setPriority('')
    if (status !== 'ALL' && status !== experience.status) setFilter(experience.status)
    setSelectedId(experience.id)
    map.current?.focus(experience)
    notify('Esperienza salvata nella mappa')
  }
  const pick = (location: Place) => {
    setPlace({
      ...location,
      address: location.address || place?.address || editing?.address || '',
      source: 'map',
    })
    setPicking(false)
  }
  const exportData = async () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            version: 3,
            map: account?.map,
            experiences: items,
            categories: archive.categories,
            reviews: archive.reviews,
            visits: archive.visits,
            trips: archive.trips,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    )
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'atlas-backup.json'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    notify(
      'Backup esportato. Le foto locali sono incluse; le foto cloud richiedono il backup dello Storage.',
    )
  }
  const renderItems = (compact = false) =>
    loading ? (
      <p className="muted loading-copy">Caricamento esperienze…</p>
    ) : (
      sortExperiences(filtered, order).map((item) => (
        <button
          key={item.id}
          className={`experience-row ${compact ? 'compact' : ''}`}
          onClick={() => {
            if (tab !== 'map') setTab('map')
            select(item.id)
          }}
        >
          <span className="experience-thumb">
            {item.imageUrl ? (
              <img src={item.imageUrl} alt="" loading="lazy" />
            ) : (
              <CategoryIcon
                name={categoryRecords.find((c) => c.id === item.category)?.icon || 'map-pin'}
                size={25}
              />
            )}
            {item.status === 'DONE' && (
              <i className="thumb-check">
                <Check size={10} />
              </i>
            )}
          </span>
          <span className={`collection-status ${item.status === 'DONE' ? 'done' : ''}`}>
            {item.status === 'DONE' ? (
              <Check size={12} />
            ) : (
              <span className={`priority-dot priority-${item.priority?.toLowerCase()}`} />
            )}{' '}
            {item.status === 'DONE' ? 'Già fatto' : 'Da fare'}
          </span>
          <span className="row-copy">
            <strong>{item.title}</strong>
            <small>{item.address}</small>
            <small className="experience-cost">{costLabel(item)}</small>
            <span className="row-meta">
              <span className="row-category">
                <CategoryIcon
                  name={categoryRecords.find((c) => c.id === item.category)?.icon || 'map-pin'}
                  size={13}
                />
                {categoryName(item.category, categoryRecords)}
              </span>
              <i />
              {item.status === 'DONE'
                ? 'Già fatto'
                : `Priorità ${item.priority ? priorityLabels[item.priority].toLowerCase() : 'non assegnata'}`}
            </span>
            {(() => {
              const review = archive.reviews
                .filter(
                  (r) =>
                    r.experienceId === item.id &&
                    r.authorId === archive.authorId &&
                    r.rating !== null,
                )
                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
              return review ? (
                <span className="collection-rating">
                  <Star size={13} />
                  {review.rating!.toLocaleString('it')} <span>/ 5</span>
                </span>
              ) : null
            })()}
          </span>
          <ChevronRight size={17} />
        </button>
      ))
    )

  return (
    <div className={`atlas-app tab-${tab} ${picking ? 'is-picking' : ''}`}>
      <main className="map-stage" aria-label="ATLAS">
        <Suspense fallback={<div className="map-loading glass">Avvio della mappa…</div>}>
          <WorldMap
            ref={map}
            route={displayedRoute}
            items={filtered}
            categories={categoryRecords}
            selectedId={selectedId}
            onSelect={select}
            picking={picking}
            onPick={pick}
            onMessage={notify}
          />
        </Suspense>
        <div className="map-vignette" aria-hidden="true" />
        {!picking && (
          <div className="map-hud">
            <MapSelector />
            <PlaceSearch
              items={items}
              onExperience={select}
              onPlace={(value) => {
                map.current?.focus(value)
                setCandidate(value)
              }}
            />
            <div className="filter-row">
              <StatusSegments value={status} onChange={setFilter} />
              <button
                className={`filter-button glass ${category || priority || price.mode !== 'all' ? 'has-filters' : ''}`}
                onClick={() => setOverlay('filters')}
                aria-label="Filtra categoria, priorità e prezzo"
              >
                <SlidersHorizontal size={19} />
                {(category || priority || price.mode !== 'all') && <i />}
              </button>
            </div>
            {(category || priority || price.mode !== 'all') && (
              <button
                className="active-filter-chip glass"
                onClick={() => {
                  setCategory('')
                  setPriority('')
                  setPrice({ mode: 'all', max: null, participants: 1 })
                }}
              >
                {[
                  category ? categoryName(category, categoryRecords) : '',
                  priority ? `Priorità ${priorityLabels[priority as Priority]}` : '',
                  price.mode !== 'all' ? 'Prezzo filtrato' : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                <X size={13} />
              </button>
            )}
          </div>
        )}

        {tab === 'map' && !picking && (
          <>
            <div className="desktop-map-list glass">
              <div className="list-heading">
                <h2>
                  I tuoi luoghi <span>{filtered.length}</span>
                </h2>
                <button
                  className="icon-button small"
                  onClick={() => void refresh()}
                  aria-label="Aggiorna esperienze"
                >
                  <RefreshCw size={16} />
                </button>
              </div>
              {!filtered.length && !loading ? (
                <div className="map-list-empty">
                  <MapPin size={25} strokeWidth={1.3} />
                  <strong>
                    {items.length ? 'Nessun luogo con questi filtri' : 'Il tuo mondo comincia qui'}
                  </strong>
                  <p>
                    {items.length
                      ? 'Prova a cambiare categoria, stato o priorità.'
                      : 'Aggiungi il primo posto che vorresti scoprire!'}
                  </p>
                </div>
              ) : (
                renderItems(true)
              )}
            </div>
            <div className="map-controls">
              <button
                className="icon-button glass zoom-button"
                aria-label="Aumenta zoom"
                onClick={() => map.current?.zoom(1)}
              >
                <Plus size={19} />
              </button>
              <button
                className="icon-button glass zoom-button"
                aria-label="Riduci zoom"
                onClick={() => map.current?.zoom(-1)}
              >
                <Minus size={19} />
              </button>
              <button
                className="icon-button glass"
                aria-label="Usa la mia posizione"
                onClick={() => map.current?.locate()}
              >
                <LocateFixed size={21} />
              </button>
            </div>
            <div className="map-legend glass" aria-label="Legenda pin">
              <span>
                <i className="priority-low" />
                Bassa
              </span>
              <span>
                <i className="priority-medium" />
                Media
              </span>
              <span>
                <i className="priority-high" />
                Alta
              </span>
              <span>
                <i className="done-color" />
                Fatto
              </span>
            </div>
          </>
        )}
        {displayedRoute && !picking && tab === 'map' && (
          <button className="route-toggle glass" onClick={() => setRouteVisible(false)}>
            Nascondi percorso · Geoapify / OpenStreetMap
          </button>
        )}
        {candidate && !picking && tab === 'map' && (
          <div className="candidate-card glass">
            <MapPin size={20} />
            <span>{candidate.address}</span>
            <button
              className="icon-button"
              aria-label="Aggiungi questo luogo"
              onClick={() => add(candidate)}
            >
              <Plus size={22} />
            </button>
            <button
              className="icon-button small"
              aria-label="Chiudi luogo cercato"
              onClick={() => setCandidate(null)}
            >
              <X size={17} />
            </button>
          </div>
        )}
        {picking && (
          <>
            <div className="picker-top glass">
              <button
                className="icon-button"
                aria-label="Torna al modulo"
                onClick={() => setPicking(false)}
              >
                <ArrowLeft size={21} />
              </button>
              <div>
                <strong>Scegli il punto esatto</strong>
                <small>Tocca la mappa o spostala sotto il mirino</small>
              </div>
            </div>
            <div className="map-crosshair" aria-hidden="true">
              <Crosshair size={33} />
            </div>
            <div className="picker-bottom glass">
              <p>Il punto scelto sarà la posizione dell’esperienza.</p>
              <button
                className="primary-button"
                onClick={() => {
                  const center = map.current?.center()
                  if (center) pick(center)
                }}
              >
                <Check size={18} />
                Usa questo punto
              </button>
            </div>
          </>
        )}
        {tab !== 'map' && !picking && (
          <section
            className="app-panel"
            aria-label={navigation.find((item) => item.id === tab)?.label}
          >
            <header className="panel-heading">
              <div>
                <span className="eyebrow">IL TUO ATLAS</span>
                <h1>{tab === 'saved' ? 'Salvati' : tab === 'ai' ? 'AI Explorer' : 'Viaggi'}</h1>
              </div>
              <button
                className="icon-button glass"
                aria-label="Impostazioni e connessioni"
                onClick={() => setOverlay('settings')}
              >
                <Settings2 size={20} />
              </button>
            </header>
            <div className="panel-scroll">
              {tab === 'saved' ? (
                <>
                  <div className="saved-tabs">
                    <button
                      className={status === 'TO_DO' ? 'selected' : ''}
                      aria-pressed={status === 'TO_DO'}
                      onClick={() => setFilter('TO_DO')}
                    >
                      Da fare <span>{items.filter((item) => item.status === 'TO_DO').length}</span>
                    </button>
                    <button
                      className={status === 'DONE' ? 'selected' : ''}
                      aria-pressed={status === 'DONE'}
                      onClick={() => setFilter('DONE')}
                    >
                      Ricordi <span>{items.filter((item) => item.status === 'DONE').length}</span>
                    </button>
                    <button
                      aria-label="Mostra tutti i salvati"
                      aria-pressed={status === 'ALL'}
                      className={`icon-button ${status === 'ALL' ? 'selected' : ''}`}
                      onClick={() => setFilter('ALL')}
                    >
                      <Bookmark size={17} />
                    </button>
                  </div>
                  <div className="saved-search">
                    <Search size={18} />
                    <input
                      aria-label="Cerca nei salvati"
                      placeholder="Titolo o luogo"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                    <button
                      className="icon-button"
                      aria-label="Filtra salvati"
                      onClick={() => setOverlay('filters')}
                    >
                      <SlidersHorizontal size={18} />
                    </button>
                  </div>
                  <div className="saved-toolbar">
                    <span>{filtered.length} esperienze</span>
                    <label>
                      Ordina{' '}
                      <select
                        aria-label="Ordina esperienze"
                        value={order}
                        onChange={(event) => setOrder(event.target.value)}
                      >
                        <option value="recent">Più recenti</option>
                        <option value="priority">Priorità</option>
                      </select>
                    </label>
                  </div>
                  <PriceFilterFields value={price} onChange={setPrice} />
                  {filtered.length ? (
                    <div className="saved-list">{renderItems()}</div>
                  ) : (
                    !loading && (
                      <div className="empty-state">
                        <Bookmark size={34} strokeWidth={1.2} />
                        <h2>{items.length ? 'Nessun risultato' : 'I tuoi luoghi, qui'}</h2>
                        <p>
                          {items.length
                            ? 'Modifica la ricerca o i filtri per ritrovare le tue esperienze.'
                            : 'Salva un’esperienza da vivere o un luogo che hai già visitato.'}
                        </p>
                        <button className="secondary-button" onClick={() => add()}>
                          <Plus size={17} />
                          Aggiungi esperienza
                        </button>
                      </div>
                    )
                  )}
                </>
              ) : tab === 'ai' ? (
                <Explorer
                  items={items}
                  categories={categoryRecords}
                  reviews={archive.reviews}
                  authorId={archive.authorId}
                  trip={draft.trip}
                  suggesting={suggesting}
                  indoor={suggestIndoor}
                  onCancel={() => {
                    setSuggesting(false)
                    switchTab('trips')
                  }}
                  onPlan={(ids, criteria, weatherConsents, proposal) => {
                    if (proposal) {
                      const planned = proposalTrip(proposal, criteria)
                      draft.setTrip({
                        ...planned,
                        ...(suggesting
                          ? {
                              id: draft.trip.id,
                              name: draft.trip.name,
                              createdAt: draft.trip.createdAt,
                            }
                          : {}),
                        planningPreferences: { ...planned.planningPreferences!, weatherConsents },
                      })
                      setSuggesting(false)
                      switchTab('trips')
                      return
                    }
                    const base = suggesting
                      ? draft.trip
                      : {
                          ...newTrip(),
                          name: 'Le mie prossime tappe',
                          origin: criteria.origin,
                          date: criteria.date,
                        }
                    draft.setTrip(
                      addToTrip(
                        {
                          ...base,
                          origin: criteria.origin,
                          date: criteria.date,
                          planningPreferences: {
                            maxDriveMinutes: criteria.maxDriveMinutes,
                            notes: criteria.preferences,
                            localTime: criteria.time,
                            weatherVisitTime: criteria.time,
                            weatherConsents,
                          },
                        },
                        ids,
                      ),
                    )
                    setSuggesting(false)
                    switchTab('trips')
                  }}
                />
              ) : (
                <Trips
                  items={items}
                  trip={draft.trip}
                  onChange={draft.setTrip}
                  onShowRoute={() => {
                    const route = currentRoute(draft.trip, items)
                    if (route) {
                      setRouteVisible(true)
                      switchTab('map')
                      map.current?.fitRoute(route.geometry)
                    }
                  }}
                  saved={archive.trips}
                  onRefresh={archive.refresh}
                  onSuggest={(indoor) => {
                    setSuggestIndoor(!!indoor)
                    setSuggesting(true)
                    switchTab('ai')
                  }}
                />
              )}
            </div>
          </section>
        )}
        {error && !picking && (
          <div className="data-error glass" role="alert">
            <WifiOff size={17} />
            <span>{error}</span>
            <button className="text-button" onClick={() => void refresh()}>
              Riprova
            </button>
          </div>
        )}
      </main>

      {!picking && (
        <>
          <nav className="app-navigation glass" aria-label="Navigazione principale">
            <div className="desktop-logo">
              <Navigation size={25} />
            </div>
            {navigation.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                className={tab === id ? 'selected' : ''}
                aria-current={tab === id ? 'page' : undefined}
                onClick={() => switchTab(id)}
              >
                <span className="nav-icon">
                  <Icon size={22} strokeWidth={tab === id ? 2 : 1.6} />
                </span>
                <span>{label}</span>
              </button>
            ))}
            <button
              className="desktop-settings"
              aria-label="Impostazioni"
              onClick={() => setOverlay('settings')}
            >
              <Settings2 size={22} />
            </button>
          </nav>
          <button className="fab" aria-label="Aggiungi esperienza" onClick={() => add()}>
            <Plus size={29} strokeWidth={1.8} />
          </button>
        </>
      )}
      {message && (
        <div className="toast glass" role="status">
          {message}
          <button
            aria-label="Chiudi notifica"
            className="icon-button small"
            onClick={() => setMessage('')}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {overlay === 'filters' && (
        <Sheet title="Filtra la tua mappa" onClose={() => setOverlay(null)}>
          <div className="filters-content">
            {tab !== 'saved' && <PriceFilterFields value={price} onChange={setPrice} />}
            <label className="field-label">
              Categoria
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="">Tutte le categorie</option>
                {categoryRecords.map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Priorità
              <select value={priority} onChange={(event) => setPriority(event.target.value)}>
                <option value="">Tutte le priorità</option>
                {Object.entries(priorityLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <small className="field-help">
                La priorità si applica ai luoghi da fare. Se la selezioni, i luoghi già fatti
                vengono esclusi.
              </small>
            </label>
            <button className="primary-button" onClick={() => setOverlay(null)}>
              Mostra {filterExperiences(items, filters).length} luoghi
            </button>
            <button
              className="text-button centered"
              onClick={() => {
                setCategory('')
                setPriority('')
                setPrice({ mode: 'all', max: null, participants: 1 })
                setFilter('ALL')
              }}
            >
              Rimuovi tutti i filtri
            </button>
          </div>
        </Sheet>
      )}
      {overlay === 'settings' && (
        <Sheet title="Il tuo spazio" onClose={() => setOverlay(null)}>
          <div className="settings-content">
            <div className="connection-status">
              <Cloud />
              <div>
                <strong>{account?.map.name}</strong>
                <p>Accesso riservato ai membri di questa mappa.</p>
              </div>
            </div>
            <button className="primary-button" onClick={() => account?.open()}>
              Profilo · Amici e condivisione · Mappe
            </button>
            <button className="secondary-button" onClick={() => setManagingCategories(true)}>
              Categorie · Crea e personalizza
            </button>
            <InstallAtlas />
            <button
              className="secondary-button"
              onClick={() => void exportData().catch(() => notify('Backup non riuscito. Riprova.'))}
              disabled={loading || !!error}
            >
              <ArrowDownToLine size={17} />
              Esporta backup JSON
            </button>
            <button
              className="text-button"
              onClick={() => {
                void refresh()
                notify('Aggiornamento dell’archivio…')
              }}
            >
              <RefreshCw size={16} />
              Aggiorna archivio
            </button>
            <div className="install-note">
              <Download size={19} />
              <div>
                <strong>Aggiungi alla schermata Home</strong>
                <p>
                  Su iPhone: Safari → Condividi → Aggiungi alla schermata Home. Su Android: menu del
                  browser → Installa app. Servono HTTPS e la build di produzione.
                </p>
              </div>
            </div>
          </div>
        </Sheet>
      )}
      {selected && !formOpen && (
        <ExperienceDetails
          key={selected.id}
          item={selected}
          categories={categoryRecords}
          reviews={archive.reviews}
          visits={archive.visits}
          authorId={archive.authorId}
          onRefresh={refreshAll}
          onDelete={async () => {
            await deleteLocalExperience(selected.id)
            setSelectedId(null)
            await refreshAll()
            notify('Esperienza spostata nell’archivio eliminati.')
          }}
          onClose={() => setSelectedId(null)}
          onEdit={() => {
            setCompleting(false)
            setEditing(selected)
            setPlace(null)
            setFormOpen(true)
          }}
          onStatus={async () => {
            if (selected.status === 'TO_DO') {
              setCompleting(true)
              setEditing(selected)
              setPlace(null)
              setFormOpen(true)
              return
            }
            await save({ ...selected, status: 'TO_DO', priority: 'MEDIUM' })
            notify('Stato aggiornato. Le recensioni precedenti sono conservate.')
          }}
        />
      )}
      {(archive.error || draft.error) && (
        <div className="data-error glass" role="alert">
          {archive.error || draft.error}
        </div>
      )}
      {formOpen && (
        <ExperienceForm
          initial={editing}
          categoryRecords={categoryRecords}
          onCategories={() => setManagingCategories(true)}
          initialStatus={completing ? 'DONE' : undefined}
          initialReview={(() => {
            if (completing || !editing) return undefined
            const review = archive.reviews
              .filter((r) => r.experienceId === editing.id && r.authorId === archive.authorId)
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
            return review
              ? {
                  id: review.id,
                  visitId: review.visitId,
                  rating: review.rating,
                  notes: review.notes,
                  visitedAt: archive.visits.find((v) => v.id === review.visitId)?.visitedAt || null,
                }
              : undefined
          })()}
          place={place}
          picking={picking}
          modeLabel={modeLabel}
          onClose={closeForm}
          onPick={(current) => {
            if (current) setPlace(current)
            setTab('map')
            setPicking(true)
            if (current || editing) map.current?.focus((current || editing)!)
          }}
          onSave={saveForm}
        />
      )}
      {managingCategories && (
        <CategoryManager
          categories={categoryRecords}
          items={items}
          onClose={() => setManagingCategories(false)}
          onChange={refreshAll}
        />
      )}
    </div>
  )
}

function StatusSegments({
  value,
  onChange,
}: {
  value: StatusFilter
  onChange: (value: StatusFilter) => void
}) {
  return (
    <div className="segmented glass map-segments" aria-label="Stato delle esperienze">
      {(
        [
          ['ALL', 'Tutto'],
          ['TO_DO', 'Da fare'],
          ['DONE', 'Già fatto'],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          aria-pressed={value === id}
          className={value === id ? 'selected' : ''}
          onClick={() => onChange(id)}
        >
          {id === 'DONE' && <Check size={13} />}
          {label}
        </button>
      ))}
    </div>
  )
}
