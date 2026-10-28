import { Star } from 'lucide-react'
export function RatingInput({
  value,
  onChange,
}: {
  value: number | null
  onChange: (value: number | null) => void
}) {
  return (
    <fieldset className="rating-field">
      <legend>
        La tua valutazione{' '}
        <strong>{value === null ? 'Non assegnata' : `${value.toLocaleString('it-IT')} / 5`}</strong>
      </legend>
      <div className="rating-stars">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            type="button"
            key={n}
            aria-label={`Assegna ${n} ${n === 1 ? 'stella' : 'stelle'}`}
            onClick={(event) => {
              if (event.detail === 0) {
                onChange(n)
                return
              }
              const box = event.currentTarget.getBoundingClientRect()
              onChange(event.clientX - box.left < box.width / 2 ? n - 0.5 : n)
            }}
          >
            <Star size={32} aria-hidden="true" />
            <span
              aria-hidden="true"
              style={{ width: `${Math.max(0, Math.min(1, (value ?? 0) - n + 1)) * 100}%` }}
            >
              <Star size={32} fill="currentColor" />
            </span>
          </button>
        ))}
      </div>
      <input
        aria-label="Valutazione da 0 a 5 stelle"
        type="range"
        min="0"
        max="5"
        step="0.5"
        value={value ?? 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="rating-quick">
        <button type="button" onClick={() => onChange(0)}>
          Assegna 0
        </button>
        <span>Trascina per scegliere · mezze stelle</span>
        <button type="button" onClick={() => onChange(null)}>
          Nessun voto
        </button>
      </div>
    </fieldset>
  )
}
