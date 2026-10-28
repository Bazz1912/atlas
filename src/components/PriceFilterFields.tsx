import type { PriceFilter } from '../domain'
export function PriceFilterFields({
  value,
  onChange,
}: {
  value: PriceFilter
  onChange: (v: PriceFilter) => void
}) {
  return (
    <div className="price-filter">
      <label className="field-label">
        Prezzo
        <select
          aria-label="Filtra per prezzo"
          value={value.mode}
          onChange={(e) => onChange({ ...value, mode: e.target.value as PriceFilter['mode'] })}
        >
          <option value="all">Tutti i prezzi</option>
          <option value="free">Gratis</option>
          <option value="20">Fino a 20 €</option>
          <option value="50">Fino a 50 €</option>
          <option value="100">Fino a 100 €</option>
          <option value="custom">Importo massimo personalizzato</option>
          <option value="unknown">Prezzo non indicato</option>
        </select>
      </label>
      {value.mode === 'custom' && (
        <label className="field-label">
          Importo massimo €
          <input
            type="number"
            min="0"
            max="1000000"
            step="0.01"
            inputMode="decimal"
            placeholder="Inserisci un limite"
            value={value.max ?? ''}
            onChange={(e) =>
              onChange({ ...value, max: e.target.value === '' ? null : Number(e.target.value) })
            }
          />
        </label>
      )}
      {!['all', 'unknown', 'free'].includes(value.mode) && (
        <label className="field-label">
          Confronta per quante persone?
          <input
            type="number"
            min="1"
            max="100"
            step="1"
            value={value.participants}
            onChange={(e) => onChange({ ...value, participants: Number(e.target.value) })}
          />
        </label>
      )}
      <p className="field-help">
        {value.mode === 'all'
          ? 'Inclusi i luoghi senza prezzo.'
          : value.mode === 'unknown'
            ? 'Solo i luoghi senza costo indicato.'
            : `I prezzi non indicati sono esclusi. ${value.mode === 'free' ? '0 € significa gratis.' : `Limite totale per ${value.participants} ${value.participants === 1 ? 'persona' : 'persone'}: i prezzi a persona vengono moltiplicati, i totali restano invariati.`}`}
      </p>
    </div>
  )
}
