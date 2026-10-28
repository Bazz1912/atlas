import { describe, expect, it, vi } from 'vitest'
import type { Experience, RouteSummary, Trip } from '../domain'
import {
  costLabel,
  defaultBudget,
  fuelAssumptions,
  fuelEstimate,
  tollEstimate,
  tripEstimate,
} from '../../supabase/functions/_shared/atlas/costs'
import { filterExperiences, validateExperience } from '../domain'
import { decodePolyline, fetchHere, parseHere } from '../../supabase/functions/_shared/here'
import { currentRoute, routeFingerprint, routePoints } from './routing'
import {
  compareRoutes,
  makeTollQuote,
  routeReference,
  routeReferenceKey,
} from '../../supabase/functions/_shared/atlas/tollComparison'
import {
  createHereHandler,
  parseHereInput,
} from '../../supabase/functions/atlas-here-route/handler'
const polyline = 'BFoz5xJ67i1B1B7PzIhaxL7Y' // Official HERE polyline example. Test-only fixtures.
const item: Experience = {
  id: '30000000-0000-4000-8000-000000000001',
  title: 'Fixture',
  description: '',
  category: 'Food',
  status: 'TO_DO',
  priority: 'MEDIUM',
  latitude: 50.09878,
  longitude: 8.68752,
  address: 'Fixture',
  imagePath: null,
  imageUrl: null,
  createdAt: '',
  updatedAt: '',
}
const trip: Trip = {
  id: 'fixture',
  name: 'Fixture',
  origin: { latitude: 50.10228, longitude: 8.69821, address: 'Fixture' },
  date: '',
  waypoints: [{ experienceId: item.id, stopMinutes: 30 }],
  routeSummary: null,
  createdAt: '',
  updatedAt: '',
}
const section = (length = 5000) => ({
  id: 's',
  type: 'vehicle',
  polyline,
  summary: { length, duration: 300 },
  spans: [{ length, carAttributes: ['open'] }],
  tolls: [] as unknown[],
  notices: [] as unknown[],
})
const payload = (sections = [section()]) => ({ routes: [{ id: 'fixture', sections }] })
const here = () => parseHere(payload(), routeFingerprint(trip, [item]), 1)
const geo = (): RouteSummary => ({ ...here(), provider: 'geoapify', tolls: undefined })
const quote = () => makeTollQuote(routeReference(geo()), here())
const fare = (id: string, value = 10, method = 'cash') => ({
  id,
  name: 'Test tariff',
  price: { type: 'value', currency: 'EUR', value },
  paymentMethods: [method],
})
const tolled = (fares: ReturnType<typeof fare>[]) => ({
  ...section(),
  tolls: [{ tollSystem: 'Test toll', fares }],
})
describe('automatic conventional fuel estimate', () => {
  it('centralizes immutable 2.09 €/L and fixed indicative city-car values', () => {
    expect(fuelAssumptions).toEqual({
      pricePerLiter: 2.09,
      urban: 6.5,
      rural: 4.8,
      motorway: 5.8,
      mixed: 5.8,
    })
    expect(Object.isFrozen(fuelAssumptions)).toBe(true)
  })
  it('uses real routing km and mixed 5.8 without asking for any vehicle', () => {
    expect(fuelEstimate({ ...geo(), distanceMeters: 100000 }).euros).toBeCloseTo(5.8 * 2.09)
    expect(fuelEstimate({ ...geo(), distanceMeters: 50000 }).euros).toBeCloseTo(2.9 * 2.09)
    expect(fuelEstimate(null).euros).toBeNull()
  })
  it('ignores legacy HERE road class data and never uses them to recalculate fuel', () => {
    expect(
      fuelEstimate({ ...geo(), roadMeters: { urban: 5000, rural: 0, motorway: 0, unknown: 0 } })
        .euros,
    ).toBeCloseTo(0.29 * 2.09)
  })
  it('counts return only when part of the itinerary, without doubling a distance', async () => {
    const rt = { ...trip, budget: { ...defaultBudget(), roundTrip: true } }
    expect(routePoints(rt, [item])).toHaveLength(3)
    expect(routePoints(trip, [item])).toHaveLength(2)
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(payload([section(5000), section(6000)]))))
    const result = await fetchHere(rt, [item], 'fixture-key', undefined, fetcher)
    expect(result.distanceMeters).toBe(11000)
    const request = fetcher.mock.calls[0]![0] as URL
    expect(request.searchParams.get('spans')).toBe('length,carAttributes')
    expect(request.searchParams.get('return')).toContain('tolls')
    expect(request.searchParams.get('origin')).toBe(request.searchParams.get('destination'))
    expect(fuelEstimate({ ...geo(), distanceMeters: 11000 }).euros).toBeCloseTo(0.638 * 2.09)
  })
})
describe('optional saved experience prices and clear filters', () => {
  it.each(['TO_DO', 'DONE'] as const)(
    'accepts blank, zero, positive and updates for %s',
    (status) => {
      const base = { ...item, status, priority: status === 'DONE' ? null : item.priority }
      for (const cost of [
        undefined,
        null,
        { amount: 0, mode: 'person' as const },
        { amount: 25, mode: 'total' as const },
      ])
        expect(validateExperience({ ...base, cost })).toBeNull()
      expect(validateExperience({ ...base, cost: { amount: -1, mode: 'total' } })).toBeTruthy()
    },
  )
  it('shows free, absent, per-person and total clearly', () => {
    expect(costLabel(item)).toBe('Costo non indicato')
    expect(costLabel({ ...item, cost: { amount: 0, mode: 'person' } })).toBe('Gratis')
    expect(costLabel({ ...item, cost: { amount: 30, mode: 'person' } })).toContain('a persona')
    expect(costLabel({ ...item, cost: { amount: 70, mode: 'total' } })).toContain('totali')
  })
  const all = [
    item,
    { ...item, id: 'free', cost: { amount: 0, mode: 'person' as const } },
    { ...item, id: 'person', cost: { amount: 15, mode: 'person' as const } },
    { ...item, id: 'total', cost: { amount: 25, mode: 'total' as const } },
  ]
  const filter = (
    mode: 'all' | 'free' | '20' | '50' | '100' | 'custom' | 'unknown',
    participants = 1,
    max: number | null = null,
  ) =>
    filterExperiences(all, {
      status: 'ALL',
      category: '',
      priority: '',
      query: '',
      price: { mode, max, participants },
    }).map((i) => i.id)
  it('never treats absent prices as free', () => {
    expect(filter('all')).toHaveLength(4)
    expect(filter('free')).toEqual(['free'])
    expect(filter('unknown')).toEqual([item.id])
  })
  it('compares group spending, multiplying only per-person prices', () => {
    expect(filter('20')).toEqual(['free', 'person'])
    expect(filter('20', 2)).toEqual(['free'])
    expect(filter('custom', 2, 25)).toEqual(['free', 'total'])
    expect(filter('50', 2)).toEqual(['free', 'person', 'total'])
    expect(filter('100', 3)).toHaveLength(3)
    expect(filter('custom', 2, null)).toHaveLength(0)
  })
  it('calculates subtotal, never a complete total when prices or tolls are unknown', () => {
    expect(tripEstimate([item], geo(), defaultBudget(), quote()).total).toBeNull()
    expect(
      tripEstimate(
        [{ ...item, cost: { amount: 0, mode: 'person' } }],
        geo(),
        defaultBudget(),
        quote(),
      ).total,
    ).toBeCloseTo(0.29 * 2.09)
    expect(
      tripEstimate(
        [{ ...item, cost: { amount: 10, mode: 'person' } }],
        geo(),
        defaultBudget(),
        quote(),
      ).total,
    ).toBeCloseTo(20 + 0.29 * 2.09)
    expect(
      tripEstimate(
        [{ ...item, cost: { amount: 10, mode: 'total' } }],
        geo(),
        defaultBudget(),
        quote(),
      ).total,
    ).toBeCloseTo(10 + 0.29 * 2.09)
    expect(
      tripEstimate([{ ...item, cost: { amount: 10, mode: 'total' } }], geo(), defaultBudget())
        .total,
    ).toBeNull()
  })
  it('enforces budget using code and has no parking or car configuration', () => {
    expect(defaultBudget()).toEqual({ participants: 2, max: null, roundTrip: false })
    expect(
      tripEstimate(
        [{ ...item, cost: { amount: 20, mode: 'person' } }],
        geo(),
        { ...defaultBudget(), max: 30 },
        quote(),
      ).budgetStatus,
    ).toBe('over')
    expect(tripEstimate([item], geo(), { ...defaultBudget(), max: 100 }).budgetStatus).toBe(
      'uncertain',
    )
  })
})
describe('HERE tolls: exact fares, no alternate-fare sum', () => {
  it('decodes the documented geometry and rejects invalid/critical results', () => {
    expect(decodePolyline(polyline)).toHaveLength(4)
    expect(() => decodePolyline('!')).toThrow()
    for (const s of [
      { ...section(), type: 'ferry' },
      { ...section(), notices: [{ severity: 'critical' }] },
      { ...section(), notices: [{ code: 'simplePolyline' }] },
    ])
      expect(() => parseHere(payload([s]), 'f', 1)).toThrow()
  })
  it('does not declare missing prices free', () => {
    expect(tollEstimate(quote()).euros).toBe(0)
    const s = section()
    delete (s as { tolls?: unknown[] }).tolls
    expect(
      tollEstimate(makeTollQuote(routeReference(geo()), parseHere(payload([s]), 'f', 1))).euros,
    ).toBeNull()
    expect(
      tollEstimate(
        makeTollQuote(
          routeReference(geo()),
          parseHere(
            payload([{ ...section(), notices: [{ code: 'tollsDataUnavailable' }] }]),
            'f',
            1,
          ),
        ),
      ).euros,
    ).toBeNull()
  })
  it('counts one fare and deduplicates repeated IDs across sections', () => {
    const s = tolled([
      fare('cash', 12),
      fare('card', 11, 'bankCard'),
      fare('pass', 8, 'transponder'),
    ])
    const h = parseHere(payload([s, s]), 'f', 2),
      q = { ...quote(), tolls: h.tolls! }
    expect(q.tolls.groups).toHaveLength(1)
    expect(tollEstimate(q).euros).toBe(12)
    expect(tollEstimate(q, { [q.tolls.groups[0]!.id]: 'card' }).euros).toBe(11)
  })
  it('requires explicit eligibility for pass-only fares and ignores unsupported currency', () => {
    const s = tolled([fare('pass', 8, 'transponder')])
    expect(
      tollEstimate({ ...quote(), tolls: parseHere(payload([s]), 'f', 1).tolls! }).euros,
    ).toBeNull()
    const x = tolled([fare('x')])
    x.tolls[0]!.fares[0]!.price.currency = 'USD'
    expect(
      tollEstimate({ ...quote(), tolls: parseHere(payload([x]), 'f', 1).tolls! }).euros,
    ).toBeNull()
  })
  it('sanitizes provider errors and does not call HERE without a server key', async () => {
    const f = vi.fn().mockRejectedValue(new Error('https://HERE?apiKey=private-fixture'))
    await expect(fetchHere(trip, [item], '', undefined, f)).rejects.toThrow(/non configurato/)
    expect(f).not.toHaveBeenCalled()
    await expect(fetchHere(trip, [item], 'private-fixture', undefined, f)).rejects.toThrow(
      'HERE non raggiungibile o richiesta scaduta. Riprova più tardi.',
    )
  })
})
describe('coherence with the displayed Geoapify route', () => {
  it('accepts only a matching shape, total and individual leg distances', () => {
    expect(compareRoutes(routeReference(geo()), here())).toBe('matched')
    expect(compareRoutes(routeReference(geo()), { ...here(), distanceMeters: 6000 })).toBe(
      'alternative',
    )
    expect(
      compareRoutes(routeReference(geo()), {
        ...here(),
        legs: [{ distanceMeters: 7000, durationSeconds: 300 }],
      }),
    ).toBe('alternative')
    const shifted = {
      ...here(),
      geometry: {
        type: 'LineString' as const,
        coordinates: decodePolyline(polyline).map(([x, y]) => [x! + 0.02, y!]),
      },
    }
    expect(compareRoutes(routeReference(geo()), shifted)).toBe('alternative')
    expect(tollEstimate({ ...quote(), comparison: 'alternative' }).euros).toBeNull()
  })
  it('rejects a stale quote after route geometry or distance changes and retains Geoapify as main route', () => {
    expect(
      tripEstimate([], { ...geo(), distanceMeters: 6000 }, defaultBudget(), quote()).tolls.euros,
    ).toBeNull()
    expect(currentRoute({ ...trip, routeSummary: here() }, [item])).toBeNull()
    expect(currentRoute({ ...trip, routeSummary: geo() }, [item])?.provider).toBe('geoapify')
  })
})
describe('authenticated endpoint: no automatic calls', () => {
  const body = {
    mapId: '20000000-0000-4000-8000-000000000001',
    ids: [item.id],
    origin: trip.origin,
    roundTrip: false,
    geoRoute: routeReference(geo()),
  }
  const request = () =>
    new Request('https://fixture.invalid', {
      method: 'POST',
      headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  it('validates points, routes and duplicate IDs before lookup', () => {
    expect(() => parseHereInput({ ...body, origin: { latitude: 999, longitude: 8 } })).toThrow()
    expect(() => parseHereInput({ ...body, geoRoute: null })).toThrow()
    expect(() => parseHereInput({ ...body, ids: [item.id, item.id] })).toThrow()
  })
  it('does not contact HERE for denied users or maps', async () => {
    const deps = {
        origins: [],
        authenticate: vi.fn().mockResolvedValue(null),
        items: vi.fn().mockResolvedValue(null),
        route: vi.fn().mockResolvedValue(here()),
      },
      h = createHereHandler(deps)
    expect(deps.route).not.toHaveBeenCalled()
    expect((await h(request())).status).toBe(401)
    deps.authenticate.mockResolvedValue('user' as never)
    expect((await h(request())).status).toBe(403)
    expect(deps.route).not.toHaveBeenCalled()
  })
  it('returns only the toll quote, checks access again and never replaces the main geometry', async () => {
    const deps = {
        origins: [],
        authenticate: vi.fn().mockResolvedValue('user'),
        items: vi.fn().mockResolvedValue([item]),
        route: vi.fn().mockResolvedValue(here()),
      },
      h = createHereHandler(deps)
    const response = await h(request())
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.reference).toBe(routeReferenceKey(geo()))
    expect(data.comparison).toBe('matched')
    expect(data.geometry).toBeUndefined()
    deps.items.mockResolvedValueOnce([item]).mockResolvedValueOnce(null as never)
    expect((await h(request())).status).toBe(403)
  })
})
