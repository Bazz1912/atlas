import { useEffect, useRef, useState } from 'react'
import { Camera, Check, ImagePlus, MapPin, Navigation, X } from 'lucide-react'
import {
  environmentLabels,
  priorityLabels,
  validateExperience,
  type Experience,
  type CategoryRecord,
  type ReviewDraft,
  type Place,
  type Priority,
  type Status,
} from '../domain'
import { compressPhoto } from '../services/photos'
import { Sheet } from './Sheet'
import { RatingInput } from './RatingInput'
import { PlaceSearch } from './PlaceSearch'

interface Props {
  categoryRecords: CategoryRecord[]
  onCategories: () => void
  initialStatus?: Status
  initialReview?: ReviewDraft
  initial?: Experience
  place: Place | null
  picking: boolean
  modeLabel: string
  onPick: (current: Place | null) => void
  onClose: () => void
  onSave: (experience: Experience, photo: Blob | null, review?: ReviewDraft) => Promise<void>
}
export function ExperienceForm({
  initial,
  categoryRecords,
  onCategories,
  initialStatus,
  initialReview,
  place,
  picking,
  modeLabel,
  onPick,
  onClose,
  onSave,
}: Props) {
  const [title, setTitle] = useState(initial?.title || '')
  const [cost, setCost] = useState(initial?.cost?.amount?.toString() ?? '')
  const [costMode, setCostMode] = useState<'person' | 'total'>(initial?.cost?.mode || 'person')
  const [description, setDescription] = useState(initial?.description || '')
  const [category, setCategory] = useState<Experience['category']>(
    initial?.category ||
      (categoryRecords.some((c) => c.id === 'Experience')
        ? 'Experience'
        : categoryRecords[0]?.id) ||
      'Other',
  )
  useEffect(() => {
    if (categoryRecords.length && !categoryRecords.some((c) => c.id === category))
      setCategory(categoryRecords[0]!.id)
  }, [categoryRecords, category])
  const [status, setStatus] = useState<Status>(initialStatus || initial?.status || 'TO_DO')
  const [environment, setEnvironment] = useState<NonNullable<Experience['environment']> | ''>(
    initial?.environment || '',
  )
  const [review, setReview] = useState<ReviewDraft>(
    initialReview || { rating: null, notes: '', visitedAt: null },
  )
  const [priority, setPriority] = useState<Priority>(initial?.priority || 'MEDIUM')
  const [location, setLocation] = useState<Place | null>(initial || place)
  const [address, setAddress] = useState(initial?.address || place?.address || '')
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [preview, setPreview] = useState(initial?.imageUrl || '')
  const [removePhoto, setRemovePhoto] = useState(false)
  const [busy, setBusy] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [error, setError] = useState('')
  const objectURL = useRef('')
  const id = useRef(initial?.id || crypto.randomUUID())
  useEffect(() => {
    if (place) {
      setLocation(place)
      setAddress(place.address)
    }
  }, [place])
  useEffect(
    () => () => {
      if (objectURL.current) URL.revokeObjectURL(objectURL.current)
    },
    [],
  )
  const selectPlace = (value: Place) => {
    setLocation(value)
    setAddress(value.address)
  }
  const handlePhoto = async (file?: File) => {
    if (!file) return
    setPhotoBusy(true)
    setError('')
    try {
      const compressed = await compressPhoto(file)
      if (objectURL.current) URL.revokeObjectURL(objectURL.current)
      objectURL.current = URL.createObjectURL(compressed)
      setPreview(objectURL.current)
      setPhoto(compressed)
      setRemovePhoto(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Foto non supportata.')
    } finally {
      setPhotoBusy(false)
    }
  }
  const submit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (!location) {
      setError('Scegli la posizione sulla mappa o seleziona un indirizzo reale.')
      return
    }
    const now = new Date().toISOString()
    const experience: Experience = {
      id: id.current,
      title: title.trim(),
      description: description.trim(),
      cost: cost === '' ? null : { amount: Number(cost), mode: costMode },
      category,
      categoryId: category,
      environment: environment || undefined,
      status,
      priority: status === 'TO_DO' ? priority : null,
      address: address.trim(),
      latitude: location.latitude,
      longitude: location.longitude,
      source: location.source || 'map',
      imagePath: removePhoto ? null : initial?.imagePath || null,
      imageUrl: removePhoto ? null : initial?.imageUrl || null,
      createdAt: initial?.createdAt || now,
      updatedAt: now,
    }
    const validation = validateExperience(experience)
    if (validation) {
      setError(validation)
      return
    }
    setBusy(true)
    try {
      await onSave(experience, photo, status === 'DONE' ? review : undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossibile salvare. I campi sono ancora qui.')
      setBusy(false)
    }
  }
  return (
    <Sheet
      title={initial ? 'Modifica esperienza' : 'Nuova esperienza'}
      full
      hidden={picking}
      onClose={() => {
        if (!busy) onClose()
      }}
    >
      <form className="experience-form" onSubmit={submit}>
        <div className="form-intro">
          <span className="eyebrow">IL TUO ARCHIVIO PERSONALE</span>
          <span className="mode-label">{modeLabel}</span>
        </div>
        <div className="segmented form-status" aria-label="Stato dell’esperienza">
          {(
            [
              ['TO_DO', 'Da fare'],
              ['DONE', 'Già fatto'],
            ] as const
          ).map(([value, label]) => (
            <button
              type="button"
              key={value}
              aria-pressed={status === value}
              className={status === value ? 'selected' : ''}
              onClick={() => setStatus(value)}
            >
              {value === 'DONE' && <Check size={16} />}
              {label}
            </button>
          ))}
        </div>
        <div className={`photo-input ${preview ? 'has-photo' : ''}`}>
          {preview ? (
            <>
              <img src={preview} alt="Anteprima della foto selezionata" />
              <button
                type="button"
                className="icon-button photo-remove"
                aria-label="Rimuovi foto"
                onClick={() => {
                  setPreview('')
                  setPhoto(null)
                  setRemovePhoto(true)
                }}
              >
                <X size={18} />
              </button>
            </>
          ) : (
            <>
              <ImagePlus size={26} />
              <span>Aggiungi una foto</span>
              <small>Facoltativa · JPG, PNG, WebP</small>
            </>
          )}
          <label className={preview ? 'change-photo' : 'photo-label'}>
            <Camera size={16} />
            {photoBusy ? 'Preparazione…' : preview ? 'Cambia foto' : 'Scegli foto'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                void handlePhoto(event.target.files?.[0])
                event.target.value = ''
              }}
              disabled={photoBusy || busy}
            />
          </label>
        </div>
        <label className="field-label">
          Titolo <span>*</span>
          <input
            autoComplete="off"
            placeholder="Che cosa vuoi ricordare?"
            value={title}
            maxLength={160}
            required
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <div className="cost-input-row">
          <label className="field-label">
            Costo (facoltativo)
            <input
              aria-label="Costo (facoltativo)"
              type="number"
              inputMode="decimal"
              min="0"
              max="1000000"
              step="0.01"
              placeholder="Non indicato"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          </label>
          <label className="field-label">
            Prezzo
            <select
              aria-label="Costo a persona o totale"
              value={costMode}
              onChange={(e) => setCostMode(e.target.value as 'person' | 'total')}
            >
              <option value="person">A persona</option>
              <option value="total">Totale</option>
            </select>
          </label>
        </div>
        <p className="field-help">
          {status === 'DONE' ? 'Quanto è costata l’esperienza.' : 'Prezzo indicativo o previsto.'}{' '}
          Lascia vuoto se non lo sai; 0 € significa gratis.
        </p>
        <label className="field-label">
          Categoria <span>*</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as Experience['category'])}
          >
            {categoryRecords.map((value) => (
              <option key={value.id} value={value.id}>
                {value.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="text-button" onClick={onCategories}>
          + Nuova categoria / Gestisci categorie
        </button>
        <label className="field-label">
          Ambiente
          <select
            required
            value={environment}
            onChange={(e) => setEnvironment(e.target.value as typeof environment)}
          >
            <option value="" disabled>
              Da specificare
            </option>
            {Object.entries(environmentLabels).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <small className="field-help">L’ambiente è indipendente dalla categoria.</small>
        </label>
        <div className="field-label">
          Luogo <span>*</span>
        </div>
        <PlaceSearch onPlace={selectPlace} label="Cerca un indirizzo" />
        <button
          type="button"
          className="location-picker"
          onClick={() => onPick(location ? { ...location, address } : null)}
        >
          <span className="location-picker-icon">
            <MapPin size={21} />
          </span>
          <span>
            <strong>{location ? 'Correggi il punto sulla mappa' : 'Scegli sulla mappa'}</strong>
            <small>
              {location
                ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`
                : 'Tocca un punto o usa il mirino'}
            </small>
          </span>
          <Navigation size={17} />
        </button>
        {location && (
          <label className="field-label">
            {location.source === 'search'
              ? 'Indirizzo / nome del luogo'
              : 'Nome del luogo selezionato'}
            <input
              value={address}
              required
              maxLength={500}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Dai un nome a questo punto"
            />
            <small className="field-help">
              {location.source === 'search'
                ? 'Coordinate ricavate dal risultato selezionato. Per spostare il pin usa la mappa.'
                : 'Punto scelto manualmente. Il nome è una tua annotazione, non un indirizzo verificato.'}
            </small>
          </label>
        )}
        {status === 'TO_DO' ? (
          <fieldset>
            <legend>
              Priorità <span>*</span>
            </legend>
            <div className="priority-options">
              {(Object.keys(priorityLabels) as Priority[]).map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={priority === value}
                  className={`${priority === value ? 'selected' : ''} priority-${value.toLowerCase()}`}
                  onClick={() => setPriority(value)}
                >
                  <i />
                  {priorityLabels[value]}
                </button>
              ))}
            </div>
          </fieldset>
        ) : (
          <div className="visit-fields">
            <h3>Il tuo ricordo</h3>
            <label className="field-label">
              Data della visita (facoltativa)
              <input
                type="date"
                value={review.visitedAt || ''}
                onChange={(e) => setReview({ ...review, visitedAt: e.target.value || null })}
              />
            </label>
            <RatingInput
              value={review.rating}
              onChange={(rating) => setReview({ ...review, rating })}
            />
            <label className="field-label">
              Note personali sulla visita
              <textarea
                rows={3}
                maxLength={5000}
                value={review.notes}
                onChange={(e) => setReview({ ...review, notes: e.target.value })}
                placeholder="Com’è andata?"
              />
            </label>
            <p className="field-help">
              Recensione attribuita al tuo account autenticato. Il voto 0 è diverso da “Non
              assegnata”.
            </p>
          </div>
        )}
        <label className="field-label">
          Descrizione{' '}
          <textarea
            value={description}
            rows={3}
            maxLength={5000}
            placeholder="Un dettaglio da non dimenticare…"
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <div className="form-bottom">
          <small>
            {modeLabel === 'Solo su questo dispositivo'
              ? 'Salvato in questo browser, senza sincronizzazione.'
              : 'Salvato nello spazio Supabase configurato.'}
          </small>
          <button className="primary-button" type="submit" disabled={busy || photoBusy}>
            <Check size={18} />
            {busy ? 'Salvataggio…' : initial ? 'Salva modifiche' : 'Salva esperienza'}
          </button>
        </div>
      </form>
    </Sheet>
  )
}
