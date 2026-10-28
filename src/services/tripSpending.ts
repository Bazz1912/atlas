import type { Experience, RouteSummary, TollQuote, Trip, TripBudget } from '../domain'
import {
  defaultBudget,
  fuelAssumptions,
  tripEstimate,
} from '../../supabase/functions/_shared/atlas/costs'
import { routeReferenceKey } from '../../supabase/functions/_shared/atlas/tollComparison'
import { tollFeedback } from './tollFeedback'
export type CarCategory = NonNullable<TripBudget['carCategory']>
// User-requested conventional petrol estimates, not certified model specifications.
export const carPresets = Object.freeze({
  city: Object.freeze({ label: 'Utilitaria', litersPer100Km: 5.5 }),
  sport: Object.freeze({ label: 'Sportiva', litersPer100Km: 7.5 }),
  suv: Object.freeze({ label: 'SUV', litersPer100Km: 7.0 }),
})
export const carCategory = (budget?: TripBudget): CarCategory =>
  budget?.carCategory && Object.hasOwn(carPresets, budget.carCategory) ? budget.carCategory : 'city'
const cents = (value: number) => Math.round(value * 100 + 1e-7)
/** Pure frontend recalculation. Never performs routing or toll requests. */
export function tripSpending(
  trip: Trip,
  items: Experience[],
  route: RouteSummary | null,
  quote: TollQuote | null,
) {
  const budget = trip.budget || defaultBudget()
  const currentQuote = route && quote?.reference === routeReferenceKey(route) ? quote : null
  const base = tripEstimate(items, route, budget, currentQuote)
  const category = carCategory(budget)
  const fuelEuros =
    base.fuel.euros === null || !route
      ? null
      : (route.distanceMeters / 1000 / 100) *
        carPresets[category].litersPer100Km *
        fuelAssumptions.pricePerLiter
  const roundedFuel = fuelEuros === null ? null : cents(fuelEuros) / 100
  const knownCents = cents(base.experiences) + cents(base.tolls.known) + cents(roundedFuel ?? 0)
  const known = knownCents / 100
  const total = base.total === null ? null : known
  const feedback = tollFeedback(currentQuote, budget.selectedFares)
  // Display a genuine single conditional fare with its condition; never assume eligibility.
  const displayedTolls =
    base.tolls.euros ?? feedback?.euros ?? feedback?.conditionalTariff?.euros ?? null
  const alternative = currentQuote?.comparison === 'alternative'
  return {
    ...base,
    fuel: { ...base.fuel, euros: roundedFuel },
    known,
    total,
    perPerson: total === null ? null : total / budget.participants,
    budgetStatus:
      budget.max === null
        ? 'none'
        : known > budget.max
          ? 'over'
          : total === null
            ? 'uncertain'
            : 'within',
    budgetRemaining: budget.max === null ? null : (cents(budget.max) - knownCents) / 100,
    category,
    feedback,
    displayedTolls,
    alternative,
    conditional: !feedback?.amount && !!feedback?.conditionalTariff,
    partial: displayedTolls !== null && currentQuote?.tolls.complete === false,
    // This second scenario is explicitly separate from the known Geoapify subtotal.
    withIndicativeTolls:
      alternative && displayedTolls !== null && currentQuote?.tolls.complete
        ? (knownCents + cents(displayedTolls)) / 100
        : null,
  }
}
