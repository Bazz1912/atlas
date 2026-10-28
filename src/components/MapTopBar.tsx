import { ChevronDown, Navigation } from 'lucide-react'

/** Presentation only: map selection and account actions are supplied by the existing account UI. */
export function MapTopBar({
  maps,
  selectedId,
  displayName,
  onSelect,
  onProfile,
}: {
  maps: { id: string; name: string }[]
  selectedId: string
  displayName: string
  onSelect: (id: string) => void
  onProfile: () => void
}) {
  const initial = Array.from(displayName.trim())[0]?.toLocaleUpperCase('it') || '?'
  return (
    <div className="map-topline">
      <span className="wordmark">
        <Navigation size={16} strokeWidth={2} aria-hidden="true" />
        ATLAS
      </span>
      <div className="map-selector">
        <div className="map-selector-field">
          <select
            aria-label="Mappa attiva"
            title={maps.find((map) => map.id === selectedId)?.name}
            value={selectedId}
            onChange={(event) => onSelect(event.target.value)}
          >
            {maps.map((map) => (
              <option key={map.id} value={map.id}>
                {map.name}
              </option>
            ))}
          </select>
          <ChevronDown size={14} aria-hidden="true" />
        </div>
        <button
          className="profile-avatar"
          type="button"
          onClick={onProfile}
          aria-label="Apri profilo, amicizie e richieste"
          title={displayName}
        >
          <span aria-hidden="true">{initial}</span>
        </button>
      </div>
    </div>
  )
}
