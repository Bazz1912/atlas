import { costLabel } from '../../supabase/functions/_shared/atlas/costs'
import { useAccount } from '../account/AccountGate'
import { ReviewEditor } from '../account/ReviewEditor'
import { useState } from 'react'
import { ArrowUpRight, Check, Image, MapPin, Pencil, RotateCcw, Star, Trash2 } from 'lucide-react'
import {
  priorityLabels,
  environmentLabels,
  categoryName,
  type CategoryRecord,
  type Review,
  type Visit,
  type Experience,
} from '../domain'
import { Sheet } from './Sheet'

interface Props {
  categories: CategoryRecord[]
  reviews: Review[]
  visits: Visit[]
  authorId: string
  onRefresh: () => Promise<void>
  onDelete: () => Promise<void>
  item: Experience
  onClose: () => void
  onEdit: () => void
  onStatus: () => Promise<void>
}
export function ExperienceDetails({
  item,
  categories,
  reviews,
  visits,
  authorId,
  onDelete,
  onRefresh,
  onClose,
  onEdit,
  onStatus,
}: Props) {
  const account = useAccount()
  const [editingReview, setEditingReview] = useState<string | null>(null)
  const rated = reviews.filter((r) => r.experienceId === item.id && r.rating !== null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const changeStatus = async () => {
    setBusy(true)
    setError('')
    try {
      await onStatus()
    } catch {
      setError('Cambio stato non riuscito. Riprova.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet title="Esperienza" onClose={onClose}>
      <div className="detail-photo">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.title} />
        ) : (
          <div className="photo-placeholder">
            <Image size={28} strokeWidth={1} />
            <span>Nessuna foto aggiunta</span>
          </div>
        )}
        <span className={`status-badge ${item.status.toLowerCase()}`}>
          {item.status === 'DONE' ? (
            <Check size={13} />
          ) : (
            <span className={`priority-dot priority-${item.priority?.toLowerCase()}`} />
          )}
          {item.status === 'DONE' ? 'Già fatto' : 'Da fare'}
        </span>
      </div>
      <div className="detail-body">
        <span className="eyebrow">{categoryName(item.category, categories)}</span>
        <h3>{item.title}</h3>
        <p className="detail-address">
          <MapPin size={16} />
          {item.address}
        </p>
        <p className="experience-cost">
          {item.status === 'DONE' ? 'Costo effettivo' : 'Costo previsto'}: {costLabel(item)}
        </p>
        <div className="detail-metadata">
          {item.status === 'TO_DO' ? (
            <span>
              Priorità{' '}
              <strong>{item.priority ? priorityLabels[item.priority] : 'Non assegnata'}</strong>
            </span>
          ) : (
            <span>
              <Star size={16} />
              {reviews.some((r) => r.experienceId === item.id && r.rating !== null)
                ? 'Recensioni disponibili qui sotto'
                : 'Nessuna valutazione assegnata'}
            </span>
          )}
          <span>
            {item.latitude.toFixed(4)}°, {item.longitude.toFixed(4)}°
          </span>
        </div>
        <div className="detail-actions">
          <button className="primary-button" disabled={busy} onClick={() => void changeStatus()}>
            {item.status === 'TO_DO' ? <Check size={17} /> : <RotateCcw size={17} />}
            {busy
              ? 'Salvataggio…'
              : item.status === 'TO_DO'
                ? 'Segna come fatto'
                : 'Voglio tornarci'}
          </button>
          <button className="secondary-button" onClick={onEdit}>
            <Pencil size={17} />
            Modifica
          </button>
        </div>
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <span className="environment-badge">
          {item.environment ? environmentLabels[item.environment] : 'Ambiente da specificare'}
        </span>
        {rated.length >= 2 && (
          <p className="environment-badge">
            Media delle recensioni:{' '}
            {(rated.reduce((n, r) => n + r.rating!, 0) / rated.length).toLocaleString('it', {
              maximumFractionDigits: 1,
            })}{' '}
            / 5 · {rated.length} voti
          </p>
        )}
        {reviews
          .filter((r) => r.experienceId === item.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((review) => (
            <section className="review-card" key={review.id}>
              <div>
                <strong className="review-author">
                  {account?.members.find((p) => p.id === review.authorId)?.avatarUrl && (
                    <img
                      src={account.members.find((p) => p.id === review.authorId)!.avatarUrl}
                      alt=""
                    />
                  )}
                  {review.authorId === authorId
                    ? 'La tua recensione'
                    : account?.members.find((p) => p.id === review.authorId)?.display_name ||
                      'Membro della mappa'}
                </strong>
                <span>
                  <Star size={15} />
                  {review.rating === null
                    ? 'Non assegnata'
                    : `${review.rating.toLocaleString('it')} / 5`}
                </span>
              </div>
              <small>
                {visits.find((v) => v.id === review.visitId)?.visitedAt || 'Data non indicata'}
              </small>
              {review.notes && <p>{review.notes}</p>}
              {review.authorId === authorId &&
                (editingReview === review.id ? (
                  <ReviewEditor
                    review={review}
                    visit={visits.find((v) => v.id === review.visitId)}
                    onSaved={onRefresh}
                    onClose={() => setEditingReview(null)}
                  />
                ) : (
                  <button className="text-button" onClick={() => setEditingReview(review.id)}>
                    Modifica la tua recensione
                  </button>
                ))}
            </section>
          ))}
        {item.description && (
          <section className="detail-notes">
            <h4>Note della mappa</h4>
            <p>{item.description}</p>
          </section>
        )}
        {confirmDelete ? (
          <div className="confirm-panel">
            <h4>Eliminare “{item.title}”?</h4>
            <p>
              Scomparirà dalla mappa e dai salvati. Le tappe dei viaggi verranno indicate come
              eliminate, senza perdere l’ordine. Foto e recensioni rimangono conservate nel
              database. Nelle mappe condivise questa azione riguarda tutti i membri; per il recupero
              servirà l’amministratore.
            </p>
            <button
              className="danger-button"
              disabled={busy}
              onClick={() => {
                setBusy(true)
                void onDelete().catch(() => {
                  setError('Eliminazione non riuscita.')
                  setBusy(false)
                })
              }}
            >
              Conferma eliminazione
            </button>
            <button className="text-button" onClick={() => setConfirmDelete(false)}>
              Annulla
            </button>
          </div>
        ) : (
          <button className="text-button delete-link" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={16} />
            Elimina esperienza
          </button>
        )}
        <a
          className="external-map"
          href={`https://www.openstreetmap.org/?mlat=${item.latitude}&mlon=${item.longitude}#map=16/${item.latitude}/${item.longitude}`}
          target="_blank"
          rel="noreferrer"
        >
          Apri su OpenStreetMap <ArrowUpRight size={16} />
        </a>
      </div>
    </Sheet>
  )
}
