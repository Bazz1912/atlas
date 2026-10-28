import { afterEach, describe, expect, it, vi } from 'vitest'
import { config } from './config'
import { parsePlaces, searchPlaces } from './geocoding'
import { currentRoute, parseRoute, routeFingerprint, routingService, stopSeconds } from './routing'
import { aiExplorerService, emptyCriteria } from './explorer'
import type { Experience, Trip } from '../domain'
// Fixture isolate: non caricate nell'app, nessuna chiamata Geoapify reale.
const items: Experience[] = [
  {
    id: 'fixture-a',
    title: 'Fixture A',
    category: 'Food',
    description: '',
    status: 'TO_DO',
    priority: 'LOW',
    address: 'Punto fixture',
    latitude: 45,
    longitude: 9,
    imagePath: null,
    imageUrl: null,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'fixture-b',
    title: 'Fixture B',
    category: 'Food',
    description: '',
    status: 'TO_DO',
    priority: 'HIGH',
    address: 'Altro punto fixture',
    latitude: 46,
    longitude: 10,
    imagePath: null,
    imageUrl: null,
    createdAt: '',
    updatedAt: '',
  },
]
const trip: Trip = {
  id: 'test-trip',
  name: 'Solo test',
  origin: null,
  date: '',
  waypoints: items.map((i) => ({ experienceId: i.id, stopMinutes: 30 })),
  routeSummary: null,
  createdAt: '',
  updatedAt: '',
}
const response = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'MultiLineString',
        coordinates: [
          [
            [9, 45],
            [10, 46],
          ],
        ],
      },
      properties: { distance: 1200, time: 240, legs: [{ distance: 1200, time: 240 }] },
    },
  ],
}
const originalKey = config.geoapifyKey
const mockFetch = (payload: unknown = response, status = 200) => {
  const fn = vi
    .fn()
    .mockImplementation(async () => new Response(JSON.stringify(payload), { status }))
  vi.stubGlobal('fetch', fn)
  return fn
}
afterEach(() => {
  config.geoapifyKey = originalKey
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
describe('Autocomplete Geoapify', () => {
  it('conserva coordinate precise del risultato scelto senza generare fallback', () => {
    expect(
      parsePlaces({
        results: [{ formatted: 'Fixture indirizzo', lat: 45.123456789, lon: 9.987654321 }],
      }),
    ).toEqual([
      {
        address: 'Fixture indirizzo',
        latitude: 45.123456789,
        longitude: 9.987654321,
        source: 'search',
      },
    ])
    expect(
      parsePlaces({
        results: [
          { formatted: 'Invalido', lat: 91, lon: 0 },
          { formatted: 'Mancante', lat: null, lon: 0 },
        ],
      }),
    ).toEqual([])
  })
  it('usa ricerca mondiale senza filtri paese, lingua italiana e annullamento', async () => {
    config.geoapifyKey = 'test-only'
    const f = mockFetch({ results: [] })
    const c = new AbortController()
    await searchPlaces('Tokyo', c.signal)
    const url = new URL(f.mock.calls[0]![0])
    expect(url.pathname).toBe('/v1/geocode/autocomplete')
    expect(url.searchParams.get('text')).toBe('Tokyo')
    expect(url.searchParams.has('filter')).toBe(false)
    expect(url.searchParams.get('lang')).toBe('it')
    expect(f.mock.calls[0]![1].signal).toBeInstanceOf(AbortSignal)
  })
  it('non richiede API per testo corto e non accetta risposte malformed', async () => {
    const f = mockFetch()
    await expect(searchPlaces('ab', new AbortController().signal)).resolves.toEqual([])
    expect(f).not.toHaveBeenCalled()
    expect(() => parsePlaces({ features: [] })).toThrow(/non valida/)
  })
})
describe('Percorsi stradali reali: contratto e gestione errori', () => {
  it('senza chiave blocca routing e ricerca senza inventare numeri', async () => {
    config.geoapifyKey = ''
    const f = mockFetch()
    await expect(routingService.calculate(trip, items)).rejects.toThrow('VITE_GEOAPIFY_API_KEY')
    await expect(searchPlaces('Roma', new AbortController().signal)).rejects.toThrow(
      'VITE_GEOAPIFY_API_KEY',
    )
    expect(f).not.toHaveBeenCalled()
  })
  it('richiede drive, metri, lat-lon nell’ordine scelto e mantiene la geometria originale', async () => {
    config.geoapifyKey = 'test-only'
    const f = mockFetch()
    const result = await routingService.calculate(trip, items)
    const url = new URL(f.mock.calls[0]![0])
    expect(url.searchParams.get('waypoints')).toBe('45,9|46,10')
    expect(url.searchParams.get('mode')).toBe('drive')
    expect(url.searchParams.get('units')).toBe('metric')
    expect(result.distanceMeters).toBe(1200)
    expect(result.durationSeconds).toBe(240)
    expect(result.geometry).toEqual(response.features[0]!.geometry)
    expect(result).not.toHaveProperty('apiKey')
    expect(JSON.stringify(result)).not.toContain('test-only')
  })
  it('aggiunge la partenza reale e non confonde minuti di sosta con guida', async () => {
    config.geoapifyKey = 'test-only'
    const f = mockFetch()
    await routingService.calculate(
      { ...trip, origin: { latitude: 44, longitude: 8, address: 'Partenza fixture' } },
      items,
    )
    expect(new URL(f.mock.calls[0]![0]).searchParams.get('waypoints')).toBe('44,8|45,9|46,10')
    expect(stopSeconds(trip)).toBe(3600)
    expect(() =>
      stopSeconds({ ...trip, waypoints: [{ experienceId: 'fixture-a', stopMinutes: NaN }] }),
    ).toThrow()
  })
  it('invalida percorso dopo spostamento pin o ordine tappe ma conserva la geometria cambiando le soste', () => {
    const route = parseRoute(response, routeFingerprint(trip, items), 1)
    const calculated = { ...trip, routeSummary: route }
    expect(currentRoute(calculated, items)).not.toBeNull()
    expect(currentRoute(calculated, [{ ...items[0]!, latitude: 44 }, items[1]!])).toBeNull()
    expect(
      currentRoute({ ...calculated, waypoints: [...trip.waypoints].reverse() }, items),
    ).toBeNull()
    expect(
      currentRoute(
        { ...calculated, waypoints: trip.waypoints.map((w) => ({ ...w, stopMinutes: 60 })) },
        items,
      ),
    ).not.toBeNull()
    expect(currentRoute(calculated, [])).toBeNull()
  })
  it('rifiuta tappe mancanti, coordinate invalide, un solo punto e punti tutti uguali', async () => {
    config.geoapifyKey = 'test-only'
    const f = mockFetch()
    await expect(routingService.calculate(trip, [])).rejects.toThrow(/non è più/)
    await expect(
      routingService.calculate({ ...trip, waypoints: trip.waypoints.slice(0, 1) }, items),
    ).rejects.toThrow(/almeno due/)
    await expect(
      routingService.calculate(trip, [{ ...items[0]!, latitude: Infinity }, items[1]!]),
    ).rejects.toThrow(/coordinate/)
    await expect(
      routingService.calculate(trip, [items[0]!, { ...items[1]!, latitude: 45, longitude: 9 }]),
    ).rejects.toThrow(/diverse/)
    expect(f).not.toHaveBeenCalled()
  })
  it('non converte risposte vuote o incomplete in distanze fittizie', () => {
    expect(() => parseRoute({ features: [] }, 'test', 1)).toThrow(/Nessun percorso/)
    expect(() =>
      parseRoute(
        { features: [{ geometry: response.features[0]!.geometry, properties: { distance: 2 } }] },
        'test',
        1,
      ),
    ).toThrow(/validi/)
    expect(() =>
      parseRoute(
        {
          features: [
            {
              geometry: { type: 'LineString', coordinates: [[9, 45]] },
              properties: { distance: 2, time: 3 },
            },
          ],
        },
        'test',
        1,
      ),
    ).toThrow(/validi/)
  })
  it.each([401, 403, 429, 500])(
    'gestisce errore HTTP %s senza esporre la chiave',
    async (status) => {
      config.geoapifyKey = 'test-only'
      mockFetch({}, status)
      const result = routingService.calculate(trip, items)
      await expect(result).rejects.toThrow(
        status === 429 ? /Quota/ : status === 500 ? /temporaneamente/ : /chiave non valida/,
      )
      await expect(result).rejects.not.toThrow('test-only')
    },
  )
  it('interrompe richieste bloccate dopo il timeout senza inventare un percorso', async () => {
    config.geoapifyKey = 'test-only'
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, options) =>
          new Promise((_resolve, reject) =>
            options.signal.addEventListener('abort', () =>
              reject(new DOMException('Abort', 'AbortError')),
            ),
          ),
      ),
    )
    const assertion = expect(routingService.calculate(trip, items)).rejects.toThrow(
      /non risponde in tempo/,
    )
    await vi.advanceTimersByTimeAsync(20000)
    await assertion
  })
  it('gestisce rete e abort senza riportare URL con credenziali', async () => {
    config.geoapifyKey = 'test-only'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('secret-url?apiKey=test-only')))
    await expect(routingService.calculate(trip, items)).rejects.toThrow(/Connessione/)
    const c = new AbortController()
    c.abort()
    await expect(routingService.calculate(trip, items, c.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
  })
})
describe('AI Explorer collegato ai tempi stradali', () => {
  it('applica il limite dalla partenza a ciascun luogo usando la risposta API', async () => {
    config.geoapifyKey = 'test-only'
    const f = mockFetch()
    const criteria = {
      ...emptyCriteria,
      origin: { latitude: 44, longitude: 8, address: 'Fixture' },
      maxDriveMinutes: 5,
    }
    expect((await aiExplorerService.find(criteria, items, [], 'test')).experiences).toHaveLength(2)
    expect(f).toHaveBeenCalledTimes(2)
    const tooShort = await aiExplorerService.find(
      { ...criteria, maxDriveMinutes: 3 },
      items,
      [],
      'test',
    )
    expect(tooShort.experiences).toHaveLength(0)
    expect(tooShort.warnings.join(' ')).toContain('ciascun luogo')
  })
  it('non lancia routing senza partenza o oltre 10 candidati', async () => {
    config.geoapifyKey = 'test-only'
    const f = mockFetch()
    await expect(
      aiExplorerService.find({ ...emptyCriteria, maxDriveMinutes: 5 }, items, [], 'test'),
    ).rejects.toThrow(/partenza/)
    await expect(
      aiExplorerService.find(
        {
          ...emptyCriteria,
          maxDriveMinutes: 5,
          origin: { latitude: 44, longitude: 8, address: 'Fixture' },
        },
        Array.from({ length: 11 }, (_, i) => ({ ...items[0]!, id: String(i) })),
        [],
        'test',
      ),
    ).rejects.toThrow(/10 luoghi/)
    expect(f).not.toHaveBeenCalled()
  })
  it('senza configurazione dichiara il limite non verificato mantenendo i filtri esistenti', async () => {
    config.geoapifyKey = ''
    const f = mockFetch()
    const result = await aiExplorerService.find(
      { ...emptyCriteria, maxDriveMinutes: 5 },
      items,
      [],
      'test',
    )
    expect(result.warnings.join(' ')).toContain('non verificato')
    expect(f).not.toHaveBeenCalled()
  })
})
