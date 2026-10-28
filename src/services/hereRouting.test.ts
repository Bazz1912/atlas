import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { setScope } from '../account/scope'
import type { Experience, Trip, RouteSummary } from '../domain'
import { routeFingerprint } from './routing'
import { routeReferenceKey } from '../../supabase/functions/_shared/atlas/tollComparison'
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('../account/client', () => ({ backend: () => ({ functions: { invoke } }) }))
import { requestHereTolls, validTollQuote } from './hereRouting'
const item: Experience = {
  id: 'fixture',
  title: 'Fixture',
  description: '',
  category: 'Other',
  status: 'TO_DO',
  priority: 'LOW',
  latitude: 45.1,
  longitude: 9.1,
  address: 'Fixture',
  imagePath: null,
  imageUrl: null,
  createdAt: '',
  updatedAt: '',
}
const trip: Trip = {
  id: 'fixture-trip',
  name: 'Fixture',
  origin: { address: 'Fixture', latitude: 45, longitude: 9 },
  date: '',
  waypoints: [{ experienceId: item.id, stopMinutes: 10 }],
  routeSummary: null,
  createdAt: '',
  updatedAt: '',
}
const route: RouteSummary = {
  provider: 'geoapify',
  mode: 'drive',
  distanceMeters: 20000,
  durationSeconds: 1500,
  geometry: {
    type: 'LineString',
    coordinates: [
      [9, 45],
      [9.1, 45.1],
    ],
  },
  legs: [{ distanceMeters: 20000, durationSeconds: 1500 }],
  fingerprint: routeFingerprint(trip, [item]),
  calculatedAt: new Date().toISOString(),
}
const quote = () => ({
  reference: routeReferenceKey(route),
  comparison: 'alternative',
  hereDistanceMeters: 23000,
  calculatedAt: new Date().toISOString(),
  tolls: {
    complete: true,
    noTolls: false,
    groups: [
      {
        id: 'fare',
        name: 'Fixture',
        fares: [
          {
            id: 'cash',
            name: 'Fixture',
            euros: 5,
            paymentMethods: ['cash'],
            conditional: false,
            details: '',
          },
        ],
      },
    ],
    notes: [],
  },
})
beforeEach(() => {
  setScope({ mapId: 'map', userId: 'user' })
  invoke.mockReset()
})
afterEach(() => {
  setScope(null)
  vi.useRealTimers()
})
it('passes a bounded signal, coalesces SDK calls and returns alternative amounts intact', async () => {
  invoke.mockResolvedValue({ data: quote(), error: null })
  const [a, b] = await Promise.all([
    requestHereTolls(trip, [item], route),
    requestHereTolls(trip, [item], route),
  ])
  expect(invoke).toHaveBeenCalledTimes(1)
  expect(invoke.mock.calls[0]![1].signal).toBeInstanceOf(AbortSignal)
  expect(a).toEqual(b)
  expect(a.tolls.groups[0]!.fares[0]!.euros).toBe(5)
})
it('enforces scope again when the SDK finishes', async () => {
  invoke.mockImplementation(async () => {
    setScope({ mapId: 'other-map', userId: 'user' })
    return { data: quote(), error: null }
  })
  await expect(requestHereTolls(trip, [item], route)).rejects.toThrow(
    'La mappa o la sessione è cambiata',
  )
})
it('times out even when the SDK never resolves, without leaving the route key locked', async () => {
  vi.useFakeTimers()
  invoke.mockImplementation(() => new Promise(() => {}))
  const pending = requestHereTolls(trip, [item], route),
    check = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' })
  await vi.advanceTimersByTimeAsync(40000)
  await check
  invoke.mockResolvedValue({ data: quote(), error: null })
  await expect(requestHereTolls(trip, [item], route)).resolves.toMatchObject({
    comparison: 'alternative',
  })
})
it('shows sanitized server errors and useful connectivity feedback', async () => {
  invoke.mockResolvedValueOnce({
    data: null,
    error: {
      context: new Response(JSON.stringify({ error: 'HERE non configurato.' }), { status: 503 }),
    },
  })
  await expect(requestHereTolls(trip, [item], route)).rejects.toThrow('HERE non configurato.')
  invoke.mockResolvedValueOnce({
    data: null,
    error: { message: 'raw secret-bearing provider error should not escape' },
  })
  await expect(requestHereTolls(trip, [item], route)).rejects.toThrow('Controlla la connessione')
})
it('rejects malformed or stale results before storing fares', async () => {
  const q = quote()
  expect(validTollQuote(q, routeReferenceKey(route))).toBe(true)
  q.tolls.groups[0]!.fares[0]!.euros = -1
  expect(validTollQuote(q, routeReferenceKey(route))).toBe(false)
  invoke.mockResolvedValue({ data: { ...quote(), reference: 'stale' }, error: null })
  await expect(requestHereTolls(trip, [item], route)).rejects.toThrow('non corrisponde al percorso')
})
