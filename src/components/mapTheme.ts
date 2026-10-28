import type { Map } from 'maplibre-gl'
import theme from '../design/tokens.json'

/** Cartografia Liberty reale: palette diurna, nomi italiani e semantica stradale originale. */
export function applyAtlasTheme(map: Map) {
  const paint = (id: string, key: Parameters<Map['setPaintProperty']>[1], value: string) => {
    if (map.getLayer(id)) map.setPaintProperty(id, key, value)
  }
  paint('background', 'background-color', theme['map-land'])
  paint('water', 'fill-color', theme['map-water'])
  paint('waterway', 'line-color', theme['map-water'])
  paint('landcover_wood', 'fill-color', theme['map-park'])
  paint('landuse_residential', 'fill-color', theme.canvas)
  paint('building', 'fill-color', theme['map-building'])
  for (const layer of map.getStyle().layers || []) {
    if (layer.type === 'line' && layer.id.includes('boundary'))
      paint(layer.id, 'line-color', theme['map-boundary'])
    if (layer.type === 'fill' && layer.id.includes('park'))
      paint(layer.id, 'fill-color', theme['map-park'])
    if (layer.type === 'symbol' && layer.id.startsWith('label_') && layer.layout?.['text-field']) {
      paint(layer.id, 'text-color', theme['map-label'])
      paint(layer.id, 'text-halo-color', theme['map-land'])
      map.setLayoutProperty(layer.id, 'text-field', [
        'coalesce',
        ['get', 'name:it'],
        ['get', 'name:latin'],
        ['get', 'name'],
      ])
    }
  }
}
