import { Info } from 'lucide-react'
import { CarCategorySelector } from './CarCategorySelector'
import { carCategory, tripSpending } from '../services/tripSpending'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Experience, RouteSummary, Trip } from '../domain'
import { defaultBudget, money, validBudget } from '../../supabase/functions/_shared/atlas/costs'
import { routeReferenceKey } from '../../supabase/functions/_shared/atlas/tollComparison'
import { recentTollQuote } from '../services/tollFeedback'
import { requestHereTolls } from '../services/hereRouting'
export function TripCostCard({
  trip,
  items,
  route,
  onChange,
}: {
  trip: Trip
  items: Experience[]
  route: RouteSummary | null
  onChange: (trip: Trip) => void
}) {
  const budget = trip.budget || defaultBudget(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [reused, setReused] = useState(false)
  const controller = useRef<AbortController | null>(null),
    latest = useRef({ trip, route, onChange })
  latest.current = { trip, route, onChange }
  const key = useMemo(() => (route ? routeReferenceKey(route) : ''), [route])
  useEffect(() => {
    controller.current?.abort()
    controller.current = null
    setReused(false)
    setBusy(false)
    setError('')
    return () => {
      controller.current?.abort()
      controller.current = null
    }
  }, [key, trip.id])
  const quote = trip.tollQuote?.reference === key ? trip.tollQuote : null
  const selected = trip.waypoints
    .map((w) => items.find((i) => i.id === w.experienceId))
    .filter((i): i is Experience => !!i)
  const estimate = validBudget(budget) ? tripSpending(trip, selected, route, quote) : null
  const feedback = estimate?.feedback
  const tolls = async () => {
    if (!route || controller.current) return
    if (recentTollQuote(quote)) {
      setError('')
      setReused(true)
      return
    }
    const snapshot = trip,
      request = new AbortController()
    controller.current = request
    setBusy(true)
    setReused(false)
    setError('')
    try {
      const result = await requestHereTolls(trip, items, route, request.signal)
      const now = latest.current
      if (
        !request.signal.aborted &&
        now.trip.id === snapshot.id &&
        now.route &&
        routeReferenceKey(now.route) === result.reference
      )
        now.onChange({ ...now.trip, tollQuote: result, updatedAt: new Date().toISOString() })
    } catch (e) {
      if (!request.signal.aborted)
        setError(e instanceof Error ? e.message : 'Pedaggi non disponibili.')
    } finally {
      if (controller.current === request) {
        controller.current = null
        setBusy(false)
      }
    }
  }
  return (
    <section className="trip-cost-card" aria-label="Spesa indicativa">
      <h2>Spesa indicativa</h2>
      <CarCategorySelector
        value={carCategory(budget)}
        onChange={(value) =>
          onChange({
            ...trip,
            budget: { ...budget, carCategory: value },
            updatedAt: new Date().toISOString(),
          })
        }
      />
      {estimate ? (
        <>
          <dl className="cost-lines">
            <div>
              <dt>Esperienze{!estimate.experiencesComplete ? ' (note)' : ''}</dt>
              <dd>
                {selected.length > 0 && selected.every((i) => i.cost == null)
                  ? 'Non indicato'
                  : money(estimate.experiences)}
              </dd>
            </div>
            <div>
              <dt>Carburante stimato</dt>
              <dd>
                {estimate.fuel.euros === null ? 'Da calcolare' : `~${money(estimate.fuel.euros)}`}
              </dd>
            </div>
            <div>
              <dt>Pedaggi</dt>
              <dd>
                {estimate.displayedTolls !== null ? (
                  <>
                    ~{money(estimate.displayedTolls)}
                    {estimate.partial ? ' (parziali)' : ''}
                    {(estimate.alternative || estimate.conditional) && (
                      <span
                        className="toll-info-icon"
                        title={
                          estimate.alternative
                            ? 'Stima HERE su percorso alternativo'
                            : 'Tariffa con condizioni da verificare'
                        }
                      >
                        <Info size={14} aria-hidden="true" />
                      </span>
                    )}
                  </>
                ) : !quote && !error && !busy ? (
                  'Da verificare'
                ) : (
                  'Non disponibili'
                )}
              </dd>
            </div>
          </dl>
          {estimate.displayedTolls !== null && (estimate.alternative || estimate.conditional) && (
            <p className="cost-toll-note">
              {estimate.alternative
                ? 'Stima HERE su percorso alternativo, esclusa dal subtotale.'
                : 'Tariffa da verificare, esclusa dal subtotale.'}
              {estimate.conditional && <> {feedback?.conditionalTariff?.conditions}.</>}
            </p>
          )}
          <p className="cost-total">
            <strong>
              {estimate.total === null
                ? `Subtotale noto: ~${money(estimate.known)}`
                : `Totale indicativo: ~${money(estimate.total)}`}
            </strong>
          </p>
          {estimate.withIndicativeTolls !== null && (
            <p className="cost-indicative">
              Con pedaggio indicativo: ~{money(estimate.withIndicativeTolls)}
            </p>
          )}
          {estimate.missing.length > 0 && (
            <p className="field-help">
              {!estimate.experiencesComplete ? 'Alcune esperienze non hanno un prezzo. ' : ''}
              {!route ? 'Calcola il percorso per stimare il carburante. ' : ''}
              {estimate.displayedTolls === null && quote ? 'Pedaggi non disponibili. ' : ''}Totale
              incompleto.
            </p>
          )}
        </>
      ) : (
        <p className="inline-error">Stima non disponibile: dati del viaggio non validi.</p>
      )}
      <div
        className="toll-feedback"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-busy={busy}
      >
        {busy ? (
          <p className="field-help">Verifica dei pedaggi in corso… Attendi, massimo 40 secondi.</p>
        ) : error ? (
          <p className="inline-error">{error}</p>
        ) : feedback ? (
          <>
            {estimate?.displayedTolls != null && (
              <span className="toll-sr-status">
                Stima pedaggi: ~{money(estimate.displayedTolls)}
                {estimate.alternative ? ', percorso alternativo' : ''}.
              </span>
            )}
            {!estimate?.displayedTolls && estimate?.displayedTolls !== 0 && (
              <p className="field-help">
                {quote?.comparison === 'alternative'
                  ? 'Percorso HERE alternativo: nessuna tariffa unica disponibile.'
                  : 'Richiesta conclusa: nessun importo dei pedaggi disponibile.'}
              </p>
            )}
            {feedback.tariffs.length > 1 && (
              <details>
                <summary>Tariffe HERE da verificare</summary>
                <p className="field-help">
                  Opzioni distinte, da non sommare come se fossero tutte dovute.
                </p>
                {feedback.tariffs.map((f) => (
                  <p className="field-help" key={f.id}>
                    {f.label}: {f.amount} · {f.conditions}
                  </p>
                ))}
              </details>
            )}
            {reused && <p className="field-help">Stima recente riutilizzata.</p>}
          </>
        ) : (
          <p className="field-help">
            {route
              ? 'Premi “Stima pedaggi” per verificarli con HERE.'
              : 'Calcola prima il percorso Geoapify.'}
          </p>
        )}
      </div>
      <button
        type="button"
        className="text-button"
        disabled={!route || busy}
        aria-busy={busy}
        onClick={() => void tolls()}
      >
        {busy
          ? 'Stima pedaggi…'
          : recentTollQuote(quote)
            ? 'Mostra stima salvata'
            : error
              ? 'Riprova stima pedaggi'
              : 'Stima pedaggi'}
      </button>
    </section>
  )
}
