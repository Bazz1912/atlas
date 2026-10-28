import { useId } from 'react'
import { carPresets, type CarCategory } from '../services/tripSpending'
function CarSilhouette({ category }: { category: CarCategory }) {
  return (
    <svg
      viewBox="0 0 56 28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {category === 'city' ? (
        <>
          <path d="M8 20v-7l6-8h17l8 8 7 2v5h-5M17 20h16M8 20h2" />
          <path d="m14 12 4-5h11l5 5H14Zm11-5v5" />
          <path d="M10 15h4m27 1h3" />
        </>
      ) : category === 'sport' ? (
        <>
          <path d="m4 19 2-5 12-2 8-4h10l8 5 7 2 2 4h-6M14 19h24M4 19h2" />
          <path d="m21 12 7-2h7l5 3-19-1Zm10-2v2M7 14h6m33 0h3" />
        </>
      ) : (
        <>
          <path d="M5 20V8l3-4h30l6 9 7 2v5h-6M15 20h21M5 20h2" />
          <path d="M10 7h12v6H10V7Zm16 0h10l4 6H26V7Zm-15-5h24M6 16h4m36 0h3" />
        </>
      )}
      <circle cx={category === 'city' ? 14 : 11} cy="20" r="4" fill="var(--car-wheel,#fff)" />
      <circle cx={category === 'city' ? 37 : 42} cy="20" r="4" fill="var(--car-wheel,#fff)" />
    </svg>
  )
}
export function CarCategorySelector({
  value,
  onChange,
}: {
  value: CarCategory
  onChange: (value: CarCategory) => void
}) {
  const name = useId()
  return (
    <div className="car-selector" role="radiogroup" aria-label="Categoria automobile per la stima">
      {(Object.keys(carPresets) as CarCategory[]).map((key) => (
        <label className={`car-option ${value === key ? 'selected' : ''}`} key={key}>
          <input
            type="radio"
            name={name}
            value={key}
            checked={value === key}
            onChange={() => onChange(key)}
          />
          <CarSilhouette category={key} />
          <span>{carPresets[key].label}</span>
        </label>
      ))}
    </div>
  )
}
