import { routeReferenceKey } from './tollComparison.ts'
import type { Experience, RouteSummary, TripBudget, TollQuote } from './domain.ts'
// Conventional petrol city-car estimates, not certified vehicle specifications.
export const fuelAssumptions = Object.freeze({
  pricePerLiter: 2.09,
  urban: 6.5,
  rural: 4.8,
  motorway: 5.8,
  mixed: 5.8,
})
export const defaultBudget = (): TripBudget => ({ participants: 2, max: null, roundTrip: false })
export const money = (n: number) =>
  n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
export function validBudget(b: TripBudget) {
  return (
    !!b &&
    Number.isInteger(b.participants) &&
    b.participants >= 1 &&
    b.participants <= 100 &&
    typeof b.roundTrip === 'boolean' &&
    [b.max].every(
      (n) => n === null || (typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1000000),
    )
  )
}
export function fuelEstimate(route: RouteSummary | null) {
  if (!route || !Number.isFinite(route.distanceMeters) || route.distanceMeters < 0)
    return { euros: null, missing: ['Carburante: percorso da calcolare'] }
  // Geoapify already supplies exact road distance, not reliable road classes. No extra API/classification.
  return {
    euros:
      (route.distanceMeters / 1000 / 100) * fuelAssumptions.mixed * fuelAssumptions.pricePerLiter,
    missing: [] as string[],
  }
}
export function tollEstimate(quote: TollQuote | null, selected: Record<string, string> = {}) {
  const t = quote?.comparison === 'matched' ? quote.tolls : null
  if (!t)
    return {
      euros: null,
      known: 0,
      missing: ['Pedaggi non disponibili per questo percorso'],
      choices: {} as Record<string, string>,
    }
  const missing = t.complete ? [] : ['Copertura o tariffe dei pedaggi incomplete']
  const used = new Set<string>(),
    choices: Record<string, string> = {}
  let known = 0
  for (const group of t.groups) {
    // Prefer a standard cash/card fare; passes/transponders/time-dependent fares require explicit selection.
    const fare =
      group.fares.find((f) => f.id === selected[group.id]) ||
      group.fares.find(
        (f) =>
          f.euros !== null &&
          !f.conditional &&
          f.paymentMethods.some((m) => ['cash', 'bankCard', 'creditCard'].includes(m)),
      )
    if (!fare || fare.euros === null) {
      missing.push(`Tariffa da scegliere: ${group.name}`)
      continue
    }
    choices[group.id] = fare.id
    if (!used.has(fare.id)) {
      known += fare.euros
      used.add(fare.id)
    }
  }
  return { euros: missing.length ? null : known, known, missing, choices }
}
export function tripEstimate(
  items: Experience[],
  route: RouteSummary | null,
  budget: TripBudget,
  quote: TollQuote | null = null,
) {
  if (!validBudget(budget)) throw new Error('Partecipanti o spese non validi.')
  const fuel = fuelEstimate(route),
    tolls = tollEstimate(
      quote && route && quote.reference === routeReferenceKey(route) ? quote : null,
      budget.selectedFares,
    )
  const missing = [...fuel.missing, ...tolls.missing]
  let experiences = 0
  for (const item of items) {
    if (item.cost == null) missing.push(`Costo esperienza sconosciuto: ${item.title}`)
    else experiences += item.cost.amount * (item.cost.mode === 'person' ? budget.participants : 1)
  }
  const known = experiences + (fuel.euros ?? 0) + tolls.known
  const total = missing.length ? null : known
  return {
    fuel,
    tolls,
    experiences,
    experiencesComplete: items.every((i) => i.cost != null),
    known,
    total,
    perPerson: total === null ? null : total / budget.participants,
    missing,
    budgetStatus:
      budget.max === null
        ? 'none'
        : known > budget.max
          ? 'over'
          : total === null
            ? 'uncertain'
            : 'within',
  }
}

export function costLabel(item: Experience) {
  if (item.cost == null) return 'Costo non indicato'
  if (item.cost.amount === 0) return 'Gratis'
  return `${money(item.cost.amount)} ${item.cost.mode === 'person' ? 'a persona' : 'totali'}`
}
