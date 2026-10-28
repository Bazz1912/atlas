import type { TollQuote } from '../domain'
import { money, tollEstimate } from '../../supabase/functions/_shared/atlas/costs'
export const tollCacheMs = 10 * 60_000
export function recentTollQuote(quote: TollQuote | null, now = Date.now()) {
  const age = quote ? now - Date.parse(quote.calculatedAt) : Infinity
  return Number.isFinite(age) && age >= 0 && age < tollCacheMs
}
/** Presentation only. Alternative fares are never passed into the Geoapify trip total. */
export function tollFeedback(quote: TollQuote | null, selected: Record<string, string> = {}) {
  if (!quote) return null
  const pricing = tollEstimate({ ...quote, comparison: 'matched' }, selected)
  const alternative = quote.comparison === 'alternative'
  const amount =
    pricing.euros !== null
      ? `~${money(pricing.euros)}`
      : pricing.known > 0
        ? `~${money(pricing.known)} (parziale)`
        : null
  // If no ordinary fare can be selected, expose actual returned prices individually,
  // with their conditions. Do not invent an aggregate or assume pass eligibility.
  const tariffs = amount
    ? []
    : quote.tolls.groups
        .flatMap((group) => {
          const fares = [
            ...new Map(group.fares.filter((f) => f.euros !== null).map((f) => [f.id, f])).values(),
          ]
          return fares.map((f) => ({
            id: `${group.id}:${f.id}`,
            label: group.name,
            amount: money(f.euros!),
            euros: f.euros!,
            conditions:
              f.details ||
              (f.conditional
                ? 'Condizioni o abbonamento da verificare'
                : 'Metodo di pagamento non specificato'),
          }))
        })
        .slice(0, 6)
  return {
    kind: alternative ? 'alternative' : amount ? 'available' : 'unavailable',
    label: alternative
      ? 'Pedaggio indicativo su percorso alternativo'
      : 'Stima pedaggi disponibile',
    amount,
    euros: pricing.euros !== null ? pricing.euros : pricing.known > 0 ? pricing.known : null,
    partial: pricing.euros === null,
    tariffs,
    conditionalTariff: tariffs.length === 1 ? tariffs[0]! : null,
    message: alternative
      ? amount
        ? 'HERE ha restituito una tariffa per un percorso diverso. Non è inclusa nel totale del percorso Geoapify.'
        : tariffs.length
          ? 'HERE ha restituito tariffe su un percorso alternativo con condizioni da verificare. Non sono incluse nel totale Geoapify.'
          : 'HERE ha restituito un percorso alternativo, ma nessun importo dei pedaggi utilizzabile. Nessun importo aggiunto al totale.'
      : amount
        ? pricing.euros !== null
          ? 'Stima HERE sul percorso compatibile con Geoapify. La tariffa effettiva può variare.'
          : 'HERE restituisce solo una parte dei pedaggi: il totale resta incompleto.'
        : 'Richiesta conclusa: HERE non restituisce pedaggi quantificabili per questo percorso. Il totale resta incompleto.',
  }
}
