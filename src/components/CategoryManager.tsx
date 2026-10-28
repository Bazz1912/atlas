import theme from '../design/tokens.json'
import { useState } from 'react'
import { Plus, Pencil, Trash2, Check } from 'lucide-react'
import type { CategoryRecord, Experience } from '../domain'
import { categoryRepository } from '../services/archive'
import { CategoryIcon, categoryIcons, iconLabels } from './CategoryIcon'
import { Sheet } from './Sheet'
const colors = [theme.coral, theme.lavender, theme.mint, theme.sun, theme.leaf, theme.rose]
export function CategoryManager({
  categories,
  items,
  onClose,
  onChange,
}: {
  categories: CategoryRecord[]
  items: Experience[]
  onClose: () => void
  onChange: () => Promise<void>
}) {
  const [editing, setEditing] = useState<CategoryRecord | null>(null)
  const [deleting, setDeleting] = useState<CategoryRecord | null>(null)
  const [replacement, setReplacement] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await action()
      await onChange()
      setEditing(null)
      setDeleting(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operazione non riuscita.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet title="Le tue categorie" full onClose={onClose}>
      <div className="categories-content">
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void run(() => categoryRepository.save(editing))
            }}
          >
            <label className="field-label">
              Nome della categoria
              <input
                autoFocus
                value={editing.name}
                maxLength={60}
                required
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </label>
            <fieldset>
              <legend>Icona</legend>
              <div className="icon-picker">
                {Object.keys(categoryIcons).map((icon) => (
                  <button
                    type="button"
                    key={icon}
                    aria-label={iconLabels[icon]}
                    aria-pressed={editing.icon === icon}
                    className={editing.icon === icon ? 'selected' : ''}
                    onClick={() => setEditing({ ...editing, icon })}
                  >
                    <CategoryIcon name={icon} />
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Colore</legend>
              <div className="color-picker">
                {colors.map((color) => (
                  <button
                    type="button"
                    key={color}
                    aria-label={`Colore ${color}`}
                    aria-pressed={editing.color === color}
                    style={{ background: color }}
                    onClick={() => setEditing({ ...editing, color })}
                  >
                    {editing.color === color && <Check size={18} />}
                  </button>
                ))}
              </div>
            </fieldset>
            <button className="primary-button" disabled={busy}>
              Salva categoria
            </button>
            <button type="button" className="text-button" onClick={() => setEditing(null)}>
              Annulla modifica
            </button>
          </form>
        ) : deleting ? (
          <div className="confirm-panel">
            <h3>Eliminare “{deleting.name}”?</h3>
            <p>
              Le esperienze e le fotografie saranno conservate. Anche gli eventuali luoghi
              archiviati verranno riassegnati.
            </p>
            <label className="field-label">
              Riassegna i luoghi a
              <select value={replacement} onChange={(e) => setReplacement(e.target.value)}>
                <option value="">Scegli una categoria</option>
                {categories
                  .filter((c) => c.id !== deleting.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <button
              className="danger-button"
              disabled={busy || !replacement}
              onClick={() => void run(() => categoryRepository.remove(deleting.id, replacement))}
            >
              Conferma eliminazione
            </button>
            <button className="text-button" onClick={() => setDeleting(null)}>
              Annulla
            </button>
          </div>
        ) : (
          <>
            <p className="field-help">Organizza i tuoi luoghi con nomi, icone e colori tuoi.</p>
            {categories.map((category) => (
              <div className="category-row" key={category.id}>
                <span
                  className="category-symbol"
                  style={{ color: category.color, background: `${category.color}18` }}
                >
                  <CategoryIcon name={category.icon} />
                </span>
                <span>
                  <strong>{category.name}</strong>
                  <small>{items.filter((i) => i.category === category.id).length} luoghi</small>
                </span>
                <button
                  className="icon-button"
                  aria-label={`Modifica ${category.name}`}
                  onClick={() => setEditing({ ...category })}
                >
                  <Pencil size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Elimina categoria ${category.name}`}
                  disabled={categories.length <= 1}
                  onClick={() => {
                    setDeleting(category)
                    setReplacement('')
                  }}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
            <button
              className="primary-button"
              onClick={() =>
                setEditing({
                  id: crypto.randomUUID(),
                  slug: `custom-${crypto.randomUUID()}`,
                  name: '',
                  icon: 'sparkles',
                  color: colors[1]!,
                  isDefault: false,
                })
              }
            >
              <Plus size={18} />
              Nuova categoria
            </button>
          </>
        )}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  )
}
