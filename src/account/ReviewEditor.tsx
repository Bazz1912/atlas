import { useState } from 'react'
import type { Review, Visit } from '../domain'
import { RatingInput } from '../components/RatingInput'
import { reviewRepository } from '../services/archive'
import { cloudReviewRemove } from './cloudArchive'
export function ReviewEditor({
  review,
  visit,
  onSaved,
  onClose,
}: {
  review: Review
  visit?: Visit
  onSaved: () => Promise<void>
  onClose: () => void
}) {
  const [rating, setRating] = useState(review.rating),
    [notes, setNotes] = useState(review.notes),
    [date, setDate] = useState(visit?.visitedAt || ''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [deleting, setDeleting] = useState(false)
  const run = async (remove = false) => {
    setBusy(true)
    setError('')
    try {
      if (remove) await cloudReviewRemove(review.id)
      else
        await reviewRepository.save(review.experienceId, {
          id: review.id,
          visitId: review.visitId,
          rating,
          notes,
          visitedAt: date || null,
        })
      await onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operazione non riuscita.')
      setBusy(false)
    }
  }
  return (
    <section className="account-card">
      <h4>La tua recensione</h4>
      <RatingInput value={rating} onChange={setRating} />
      <label className="field-label">
        Data visita
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="field-label">
        Note
        <textarea maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <button className="primary-button" disabled={busy} onClick={() => void run()}>
        Salva recensione
      </button>
      {deleting ? (
        <>
          <p>Eliminare definitivamente questa tua recensione?</p>
          <button disabled={busy} className="danger-button" onClick={() => void run(true)}>
            Conferma eliminazione recensione
          </button>
        </>
      ) : (
        <button disabled={busy} className="text-button" onClick={() => setDeleting(true)}>
          Elimina la mia recensione
        </button>
      )}
      <button className="text-button" disabled={busy} onClick={onClose}>
        Annulla
      </button>
    </section>
  )
}
