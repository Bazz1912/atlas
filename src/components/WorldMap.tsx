import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import {
  Map,
  Marker,
  AttributionControl,
  LngLatBounds,
  setWorkerUrl,
  type GeoJSONSource,
} from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { FeatureCollection, Point } from 'geojson'
import { createRoot, type Root } from 'react-dom/client'
import { CategoryIcon } from './CategoryIcon'
import { defaultCategories, priorityColors, type CategoryRecord } from '../domain'
import { LoaderCircle, RotateCw } from 'lucide-react'
import type { Experience, Place, RouteSummary } from '../domain'
import { config } from '../services/config'
import 'maplibre-gl/dist/maplibre-gl.css'
import theme from '../design/tokens.json'
import { applyAtlasTheme } from './mapTheme'

setWorkerUrl(workerUrl)
export interface MapHandle {
  fitRoute: (geometry: RouteSummary['geometry']) => void
  focus: (place: Place) => void
  center: () => Place | undefined
  locate: () => void
  zoom: (amount: number) => void
}
interface Props {
  route?: RouteSummary | null
  categories?: CategoryRecord[]
  selectedId?: string | null
  items: Experience[]
  onSelect: (id: string) => void
  onPick: (place: Place) => void
  onMessage: (message: string) => void
  picking: boolean
}
function points(items: Experience[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: items.map((item) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [item.longitude, item.latitude] },
      properties: { id: item.id, status: item.status, priority: item.priority },
    })),
  }
}

function routeData(route: RouteSummary | null | undefined): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: route ? [{ type: 'Feature', properties: {}, geometry: route.geometry }] : [],
  }
}

export const WorldMap = forwardRef<MapHandle, Props>(function WorldMap(
  {
    items,
    route = null,
    categories = defaultCategories,
    selectedId = null,
    onSelect,
    onPick,
    onMessage,
    picking,
  },
  ref,
) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<Map | null>(null)
  const photoMarkers = useRef(
    new globalThis.Map<string, { marker: Marker; root: Root; key: string }>(),
  )
  const live = useRef({
    categories,
    selectedId,
    items,
    onSelect,
    onPick,
    onMessage,
    picking,
    route,
  })
  useEffect(() => {
    live.current = { categories, selectedId, items, onSelect, onPick, onMessage, picking, route }
    map.current?.triggerRepaint()
  }, [categories, selectedId, items, onSelect, onPick, onMessage, picking, route])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const locationMarker = useRef<Marker | null>(null)
  const alive = useRef(true)

  useImperativeHandle(
    ref,
    () => ({
      fitRoute(geometry) {
        const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates
        const bounds = new LngLatBounds()
        for (const line of lines) for (const p of line) bounds.extend([p[0]!, p[1]!])
        if (!bounds.isEmpty())
          map.current?.fitBounds(bounds, {
            padding: { top: 270, bottom: 180, left: 35, right: 35 },
            maxZoom: 15,
            duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 800,
          })
      },
      focus(place) {
        map.current?.flyTo({
          center: [place.longitude, place.latitude],
          zoom: 13,
          duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 900,
          padding: { top: 180, bottom: 180, left: 30, right: 30 },
        })
      },
      center() {
        const center = map.current?.getCenter()
        return center
          ? {
              latitude: center.lat,
              longitude: ((((center.lng + 180) % 360) + 360) % 360) - 180,
              address: '',
            }
          : undefined
      },
      zoom(amount) {
        if (map.current) map.current.easeTo({ zoom: map.current.getZoom() + amount, duration: 250 })
      },
      locate() {
        if (!navigator.geolocation)
          return live.current.onMessage('Geolocalizzazione non supportata da questo browser.')
        live.current.onMessage('Ricerca della tua posizione…')
        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (!alive.current || !map.current) return
            const { longitude, latitude } = position.coords
            locationMarker.current?.remove()
            locationMarker.current = new Marker({ color: theme.coral })
              .setLngLat([longitude, latitude])
              .addTo(map.current)
            map.current.flyTo({ center: [longitude, latitude], zoom: 13 })
            live.current.onMessage('Posizione trovata. Non è stata salvata.')
          },
          (error) =>
            live.current.onMessage(
              error.code === 1
                ? 'Permesso negato. Puoi continuare a esplorare la mappa.'
                : 'Posizione non disponibile. Riprova all’aperto o scegli un punto sulla mappa.',
            ),
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
        )
      },
    }),
    [],
  )

  useEffect(() => {
    if (!container.current) return
    alive.current = true
    setState('loading')
    let instance: Map
    let timer: ReturnType<typeof setTimeout>
    try {
      instance = new Map({
        container: container.current,
        style: config.mapStyle,
        center: [13, 29],
        zoom: 1.8,
        minZoom: 1,
        maxZoom: 19,
        attributionControl: false,
        locale: {
          'Map.Title': 'Mappa',
          'AttributionControl.ToggleAttribution': 'Mostra attribuzioni',
        },
        canvasContextAttributes: { antialias: true },
      })
      map.current = instance
      instance.addControl(new AttributionControl({ compact: true }), 'bottom-left')
      timer = setTimeout(() => {
        if (!instance.isStyleLoaded()) setState('error')
      }, 18000)
      instance.on('error', () => {
        if (!instance.isStyleLoaded()) setState('error')
      })
      instance.on('load', () => {
        clearTimeout(timer)
        if (config.mapStyle === 'https://tiles.openfreemap.org/styles/liberty')
          applyAtlasTheme(instance)
        setState('ready')
        instance.addSource('atlas-route', { type: 'geojson', data: routeData(live.current.route) })
        instance.addLayer({
          id: 'atlas-route-halo',
          type: 'line',
          source: 'atlas-route',
          paint: { 'line-color': theme.surface, 'line-width': 9 },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        })
        instance.addLayer({
          id: 'atlas-route-line',
          type: 'line',
          source: 'atlas-route',
          paint: { 'line-color': theme['coral-ink'], 'line-width': 5 },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        })
        instance.addSource('experiences', {
          type: 'geojson',
          data: points(live.current.items),
          cluster: true,
          clusterRadius: 45,
          clusterMaxZoom: 14,
        })
        instance.addLayer({
          id: 'clusters',
          source: 'experiences',
          type: 'circle',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': theme.lavender,
            'circle-radius': 23,
            'circle-stroke-color': theme.surface,
            'circle-stroke-width': 2,
          },
        })
        instance.addLayer({
          id: 'cluster-count',
          source: 'experiences',
          type: 'symbol',
          filter: ['has', 'point_count'],
          layout: {
            'text-field': ['get', 'point_count_abbreviated'],
            'text-font': ['Noto Sans Regular'],
            'text-size': 13,
          },
          paint: { 'text-color': theme.ink },
        })
        instance.addLayer({
          id: 'pin-halo',
          source: 'experiences',
          type: 'circle',
          filter: ['!', ['has', 'point_count']],
          paint: { 'circle-color': theme.ink, 'circle-opacity': 0, 'circle-radius': 22 },
        })
        instance.addLayer({
          id: 'pins',
          source: 'experiences',
          type: 'circle',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-radius': 12,
            'circle-opacity': 0,
            'circle-stroke-opacity': 0,
            'circle-color': [
              'case',
              ['==', ['get', 'status'], 'DONE'],
              theme.lavender,
              ['==', ['get', 'priority'], 'HIGH'],
              theme['priority-high'],
              ['==', ['get', 'priority'], 'MEDIUM'],
              theme['priority-medium'],
              theme['priority-low'],
            ],
            'circle-stroke-color': theme.surface,
            'circle-stroke-width': 2,
          },
        })
        instance.addLayer({
          id: 'done-check',
          source: 'experiences',
          type: 'symbol',
          filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'status'], 'DONE']],
          layout: {
            'text-field': '✓',
            'text-font': ['Noto Sans Regular'],
            'text-size': 15,
            'text-allow-overlap': true,
          },
          paint: { 'text-color': theme.ink, 'text-opacity': 0 },
        })
        const syncMarkers = () => {
          if (!instance.getSource('experiences')) return
          const visible = new Set<string>()
          const center = instance.getCenter().lng
          for (const feature of instance.querySourceFeatures('experiences')) {
            if (feature.properties?.point_count || feature.geometry.type !== 'Point') continue
            const item = live.current.items.find((i) => i.id === feature.properties?.id)
            if (!item || live.current.picking) continue
            visible.add(item.id)
            const cat = live.current.categories.find((c) => c.id === item.category)
            const active = live.current.selectedId === item.id
            const border =
              item.status === 'DONE' ? theme.lavender : priorityColors[item.priority || 'MEDIUM']
            const key = JSON.stringify([
              item.updatedAt,
              item.title,
              item.imageUrl?.slice(-64),
              cat,
              active,
              item.status,
              item.priority,
            ])
            let current = photoMarkers.current.get(item.id)
            if (!current) {
              const element = document.createElement('div')
              element.className = 'photo-marker-anchor'
              const root = createRoot(element)
              const marker = new Marker({ element, anchor: 'center' })
                .setLngLat([item.longitude, item.latitude])
                .addTo(instance)
              current = { marker, root, key: '' }
              photoMarkers.current.set(item.id, current)
            }
            const lng = item.longitude + 360 * Math.round((center - item.longitude) / 360)
            current.marker.setLngLat([lng, item.latitude])
            if (current.key !== key) {
              current.key = key
              current.root.render(
                <button
                  type="button"
                  aria-label={`Apri esperienza ${item.title}`}
                  className={`photo-marker ${active ? 'is-selected' : ''}`}
                  style={{ '--pin-color': border } as React.CSSProperties}
                  onClick={(event) => {
                    event.stopPropagation()
                    live.current.onSelect(item.id)
                  }}
                >
                  <span className="photo-marker-inner" style={{ color: cat?.color }}>
                    <CategoryIcon name={cat?.icon || 'map-pin'} size={23} />
                    {item.imageUrl && (
                      <img
                        src={item.imageUrl}
                        alt=""
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                    )}
                  </span>
                  {item.status === 'DONE' && <span className="pin-check">✓</span>}
                </button>,
              )
            }
          }
          for (const [id, current] of photoMarkers.current)
            if (!visible.has(id)) {
              current.root.unmount()
              current.marker.remove()
              photoMarkers.current.delete(id)
            }
        }
        instance.on('render', syncMarkers)
        instance.on('click', 'clusters', async (event) => {
          if (live.current.picking) return
          const feature = event.features?.[0]
          if (!feature || feature.geometry.type !== 'Point') return
          const source = instance.getSource('experiences') as GeoJSONSource
          const zoom = await source.getClusterExpansionZoom(Number(feature.properties?.cluster_id))
          if (!alive.current) return
          instance.easeTo({ center: feature.geometry.coordinates as [number, number], zoom })
        })
        instance.on('click', (event) => {
          if (live.current.picking) {
            live.current.onPick({
              latitude: event.lngLat.lat,
              longitude: event.lngLat.wrap().lng,
              address: '',
            })
            return
          }
          const hits = instance.queryRenderedFeatures(
            [
              [event.point.x - 12, event.point.y - 12],
              [event.point.x + 12, event.point.y + 12],
            ],
            { layers: ['pins'] },
          )
          if (hits[0]?.properties?.id) live.current.onSelect(String(hits[0].properties.id))
        })
        instance.on('mouseenter', 'pins', () => {
          instance.getCanvas().style.cursor = 'pointer'
        })
        instance.on('mouseleave', 'pins', () => {
          instance.getCanvas().style.cursor = ''
        })
      })
      const observer = new ResizeObserver(() => instance.resize())
      observer.observe(container.current)
      return () => {
        alive.current = false
        clearTimeout(timer)
        observer.disconnect()
        locationMarker.current?.remove()
        for (const marker of photoMarkers.current.values()) {
          marker.root.unmount()
          marker.marker.remove()
        }
        photoMarkers.current.clear()
        instance.remove()
        map.current = null
      }
    } catch {
      setState('error')
      return () => {
        alive.current = false
        map.current?.remove()
        map.current = null
      }
    }
  }, [attempt])

  useEffect(() => {
    const source = map.current?.getSource('experiences') as GeoJSONSource | undefined
    source?.setData(points(items))
  }, [items])

  useEffect(() => {
    const source = map.current?.getSource('atlas-route') as GeoJSONSource | undefined
    source?.setData(routeData(route))
  }, [route, state])

  return (
    <>
      <div
        className={`map-canvas ${picking ? 'picking' : ''}`}
        ref={container}
        aria-label="Mappa mondiale interattiva"
      />
      {state === 'loading' && (
        <div className="map-loading glass" role="status">
          <LoaderCircle className="spin" size={17} />
          Caricamento cartografia…
        </div>
      )}
      {state === 'error' && (
        <div className="map-error glass" role="alert">
          <strong>Cartografia non disponibile</strong>
          <p>
            Servono WebGL, una connessione Internet e l’accesso a OpenFreeMap. Nessuna immagine
            sostituisce la mappa.
          </p>
          <button className="text-button" onClick={() => setAttempt((n) => n + 1)}>
            <RotateCw size={16} />
            Riprova
          </button>
        </div>
      )}
    </>
  )
})
