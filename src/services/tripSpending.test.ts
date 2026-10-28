import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import type { Experience, RouteSummary, TollQuote, Trip } from '../domain'
import { tripSpending, carCategory, carPresets, type CarCategory } from './tripSpending'
import { routeReferenceKey } from '../../supabase/functions/_shared/atlas/tollComparison'
import { defaultBudget, fuelAssumptions } from '../../supabase/functions/_shared/atlas/costs'
import { CarCategorySelector } from '../components/CarCategorySelector'
import { TripCostCard } from '../components/TripCostCard'
import { proposalTrip } from './aiExplorer'
import { emptyCriteria } from './explorer'
const route: RouteSummary = {
  provider: 'geoapify',
  mode: 'drive',
  distanceMeters: 100000,
  durationSeconds: 3600,
  geometry: {
    type: 'LineString',
    coordinates: [
      [9, 45],
      [9.1, 45.1],
    ],
  },
  legs: [{ distanceMeters: 100000, durationSeconds: 3600 }],
  fingerprint: 'test-only',
  calculatedAt: new Date().toISOString(),
}
const trip: Trip = {
  id: 'fixture-only',
  name: 'Fixture',
  origin: null,
  date: '',
  waypoints: [{ experienceId: 'place', stopMinutes: 30 }],
  routeSummary: route,
  createdAt: '',
  updatedAt: '',
}
const item: Experience = {
  id: 'place',
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
  cost: { amount: 20, mode: 'person' },
}
const quote = (comparison: 'matched' | 'alternative' = 'matched'): TollQuote => ({
  reference: routeReferenceKey(route),
  comparison,
  hereDistanceMeters: 101000,
  calculatedAt: new Date().toISOString(),
  tolls: {
    complete: true,
    noTolls: false,
    notes: [],
    groups: [
      {
        id: 'ticket',
        name: 'Fixture',
        fares: [
          {
            id: 'cash',
            name: 'Fixture',
            euros: 11.4,
            paymentMethods: ['cash'],
            conditional: false,
            details: '',
          },
          {
            id: 'card',
            name: 'Fixture',
            euros: 11.4,
            paymentMethods: ['bankCard'],
            conditional: false,
            details: '',
          },
        ],
      },
    ],
  },
})
afterEach(() => vi.restoreAllMocks())
describe('trip car category: local estimates only', () => {
  it('starts with Utilitaria, immutable presets and fixed petrol price', () => {
    expect(carCategory()).toBe('city')
    expect(carCategory({ ...defaultBudget(), carCategory: 'bad' as CarCategory })).toBe('city')
    expect(Object.values(carPresets).map((p) => p.litersPer100Km)).toEqual([5.5, 7.5, 7])
    expect(fuelAssumptions.pricePerLiter).toBe(2.09)
    expect(Object.isFrozen(carPresets.city)).toBe(true)
  })
  it.each([
    ['city', 5.5],
    ['sport', 7.5],
    ['suv', 7],
  ] as const)(
    'recalculates fuel, subtotal and residual immediately for %s',
    (category, consumption) => {
      const result = tripSpending(
        { ...trip, budget: { ...defaultBudget(), max: 100, carCategory: category } },
        [item],
        route,
        quote(),
      )
      const fuel = Math.round(consumption * 2.09 * 100 + 1e-7) / 100
      expect(result.fuel.euros).toBeCloseTo(fuel)
      expect(result.known).toBeCloseTo(40 + fuel + 11.4)
      expect(result.total).toBeCloseTo(result.known)
      expect(result.budgetRemaining).toBeCloseTo(100 - result.known)
      expect(result.displayedTolls).toBe(11.4)
    },
  )
  it('changes no route, toll, fingerprint or network request when switching cars', () => {
    const network = vi.spyOn(globalThis, 'fetch'),
      q = quote(),
      before = JSON.stringify({ route, q })
    for (const category of ['city', 'sport', 'suv'] as const)
      tripSpending(
        { ...trip, budget: { ...defaultBudget(), carCategory: category } },
        [item],
        route,
        q,
      )
    expect(network).not.toHaveBeenCalled()
    expect(JSON.stringify({ route, q })).toBe(before)
  })
  it('keeps visible components, indicative scenario and residual consistent to the cent', () => {
    const result = tripSpending(
      { ...trip, budget: { ...defaultBudget(), max: 80 } },
      [item],
      route,
      quote('alternative'),
    )
    expect(result.fuel.euros).toBe(11.5)
    expect(result.known).toBe(51.5)
    expect(result.withIndicativeTolls).toBe(62.9)
    expect(result.budgetRemaining).toBe(28.5)
  })
  it('uses only the actual itinerary distance, including its separately routed return', () => {
    const rt = { ...trip, budget: { ...defaultBudget(), roundTrip: true } },
      r = { ...route, distanceMeters: 180000 }
    expect(tripSpending(rt, [], r, null).fuel.euros).toBeCloseTo(1.8 * 5.5 * 2.09)
  })
  it('restores selection from existing trip JSON without a schema change', () => {
    const reopened = JSON.parse(
      JSON.stringify({ ...trip, budget: { ...defaultBudget(), carCategory: 'sport' } }),
    ) as Trip
    expect(tripSpending(reopened, [item], route, null).category).toBe('sport')
  })
  it('opens AI proposals through the same default and preserves a supplied trip category', () => {
    const proposal = {
      id: 'fixture',
      title: 'Fixture',
      description: '',
      reason: '',
      experienceIds: [item.id],
      stopMinutes: [30],
      route,
      totalSeconds: 5400,
      weatherById: {},
      weatherRequests: {},
      warnings: [],
      budget: defaultBudget(),
    }
    const opened = proposalTrip(proposal, emptyCriteria)
    expect(tripSpending(opened, [item], route, null).fuel.euros).toBe(11.5)
    const sport = proposalTrip(
      { ...proposal, budget: { ...defaultBudget(), carCategory: 'sport' } },
      emptyCriteria,
    )
    expect(carCategory(sport.budget)).toBe('sport')
  })
})
describe('compact toll row and honest totals', () => {
  it('shows an alternative in the main row without including it in the known subtotal', () => {
    const result = tripSpending(trip, [item], route, quote('alternative'))
    expect(result.displayedTolls).toBe(11.4)
    expect(result.alternative).toBe(true)
    expect(result.known).toBe(51.5)
    expect(result.withIndicativeTolls).toBeCloseTo(result.known + 11.4)
    expect(result.total).toBeNull()
  })
  it('shows a single transponder fare with its condition, never as a verified Geoapify cost', () => {
    const q = quote('alternative')
    q.tolls.groups[0]!.fares = [
      {
        id: 'pass',
        name: 'Fixture',
        euros: 11.4,
        paymentMethods: ['transponder'],
        conditional: true,
        details: 'Transponder richiesto',
      },
    ]
    const result = tripSpending(trip, [item], route, q)
    expect(result.displayedTolls).toBe(11.4)
    expect(result.conditional).toBe(true)
    expect(result.feedback?.conditionalTariff?.conditions).toBe('Transponder richiesto')
    expect(result.tolls.known).toBe(0)
  })
  it('keeps missing experience prices/tolls unknown and treats zero as a real amount', () => {
    const result = tripSpending(trip, [{ ...item, cost: null }], route, null)
    expect(result.experiencesComplete).toBe(false)
    expect(result.total).toBeNull()
    expect(result.displayedTolls).toBeNull()
    const free = quote()
    free.tolls = { complete: true, noTolls: true, groups: [], notes: [] }
    expect(tripSpending(trip, [], route, free).displayedTolls).toBe(0)
    expect(
      tripSpending(trip, [], route, { ...quote(), reference: 'old-route' }).displayedTolls,
    ).toBeNull()
  })
  it('has three small native radios and a single Pedaggi row, without the old duplicate block', () => {
    const selector = renderToStaticMarkup(
      createElement(CarCategorySelector, { value: 'city', onChange: () => {} }),
    )
    expect(selector.match(/type="radio"/g)).toHaveLength(3)
    expect(selector.match(/checked=""/g)).toHaveLength(1)
    for (const label of ['Utilitaria', 'Sportiva', 'SUV']) expect(selector).toContain(label)
    const markup = renderToStaticMarkup(
      createElement(TripCostCard, {
        trip: { ...trip, tollQuote: quote('alternative') },
        items: [item],
        route,
        onChange: () => {},
      }),
    )
    expect(markup).toContain('Stima HERE su percorso alternativo')
    expect(markup).not.toContain('Pedaggio indicativo su percorso alternativo:')
    expect(markup).not.toContain('Pedaggi non disponibili')
    expect(markup).toContain('Con pedaggio indicativo')
    expect(markup.split('</dl>')[0]!.match(/11,40/g)).toHaveLength(1)
    expect(markup).not.toContain('class="alternative-toll"')
  })
})
