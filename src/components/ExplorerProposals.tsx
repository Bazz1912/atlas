import { money } from '../../supabase/functions/_shared/atlas/costs'
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import type { Experience, Review } from '../domain'
import type { ExplorerAiResponse, ExplorerProposal } from '../services/contracts'
import { formatDistance, formatDuration } from '../services/routing'
import { weatherConsentKey, weatherDecision } from '../services/weather'
import { WeatherNotice } from './WeatherNotice'
export function ExplorerProposals({
  response,
  items,
  reviews,
  authorId,
  onPlan,
  onAlternative,
}: {
  response: ExplorerAiResponse
  items: Experience[]
  reviews: Review[]
  authorId: string
  onPlan: (proposal: ExplorerProposal, consents: Record<string, string>) => void
  onAlternative: () => void
}) {
  const [consents, setConsents] = useState<Record<string, string>>({})
  return (
    <section className="explorer-results" aria-label="Proposte AI verificate">
      <h2>
        {response.proposals.length
          ? `${response.proposals.length} proposte dai tuoi luoghi`
          : 'Nessuna proposta verificata'}
      </h2>
      {response.warnings.map((warning, i) => (
        <p className="constraint-note" key={i}>
          {warning}
        </p>
      ))}
      {response.proposals.map((proposal) => {
        const needsConsent = proposal.experienceIds.some((id) => {
          const item = items.find((i) => i.id === id),
            forecast = proposal.weatherById[id],
            request = proposal.weatherRequests[id]
          return (
            item &&
            forecast &&
            request &&
            weatherDecision(item.environment, forecast).requiresConsent &&
            consents[`${proposal.id}:${id}`] !== weatherConsentKey(request, forecast)
          )
        })
        return (
          <article className="idea-card ai-proposal" key={proposal.id}>
            <h3>{proposal.title}</h3>
            <p>{proposal.description}</p>
            <p className="field-help">{proposal.reason}</p>
            <ol className="ai-proposal-stops">
              {proposal.experienceIds.map((id, index) => {
                const item = items.find((i) => i.id === id)
                if (!item) return null
                const rating = reviews
                  .filter(
                    (r) => r.experienceId === id && r.authorId === authorId && r.rating !== null,
                  )
                  .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.rating
                const request = proposal.weatherRequests[id],
                  forecast = proposal.weatherById[id]
                return (
                  <li key={id}>
                    <div className="ai-stop-heading">
                      {item.imageUrl && <img src={item.imageUrl} alt="" />}
                      <div>
                        <strong>
                          {index + 1}. {item.title}
                        </strong>
                        <small>
                          {item.status === 'DONE' ? 'Già fatta' : 'Da fare'}
                          {rating != null
                            ? ` · Ultimo tuo voto: ${rating.toLocaleString('it')}/5`
                            : ''}{' '}
                          · Sosta prevista {proposal.stopMinutes[index]} min
                        </small>
                      </div>
                    </div>
                    <WeatherNotice
                      item={item}
                      date={response.criteria.date}
                      time={request?.localTime}
                      instant={request?.instant}
                      forecast={forecast || { available: false, reason: 'Meteo non verificato' }}
                      acceptedKey={consents[`${proposal.id}:${id}`]}
                      onAccept={(key) =>
                        setConsents((old) => ({ ...old, [`${proposal.id}:${id}`]: key }))
                      }
                      onAlternative={onAlternative}
                    />
                  </li>
                )
              })}
            </ol>
            {proposal.route ? (
              <p className="context-strip">
                Guida verificata: {formatDuration(proposal.route.durationSeconds)} ·{' '}
                {formatDistance(proposal.route.distanceMeters)}
              </p>
            ) : (
              <p className="field-help">Guida dalla partenza non verificata.</p>
            )}
            <p>
              <strong>
                {proposal.totalSeconds !== null
                  ? `Durata totale prevista: ${formatDuration(proposal.totalSeconds)} (guida e soste)`
                  : 'Durata totale non verificata senza partenza/percorso.'}
              </strong>
            </p>
            {proposal.costEstimate && (
              <p className="context-strip">
                {proposal.costEstimate.total === null
                  ? `Spese note: ${money(proposal.costEstimate.known)} · totale incompleto, budget non garantito`
                  : `Totale stimato: ${money(proposal.costEstimate.total)} per ${proposal.budget?.participants ?? 2} persone`}
              </p>
            )}
            {proposal.warnings.map((w, i) => (
              <p className="field-help" key={i}>
                {w}
              </p>
            ))}
            {needsConsent && (
              <p className="constraint-note">
                Conferma le tappe con avvisi meteo usando “Mantieni comunque”, oppure cerca
                un’alternativa al chiuso.
              </p>
            )}
            <button
              className="primary-button"
              disabled={needsConsent}
              onClick={() =>
                onPlan(
                  proposal,
                  Object.fromEntries(
                    proposal.experienceIds.map((id) => [
                      id,
                      consents[`${proposal.id}:${id}`] || '',
                    ]),
                  ),
                )
              }
            >
              Apri in Viaggi <ArrowRight size={17} />
            </button>
          </article>
        )
      })}
      <p className="field-help">
        Combinazioni proposte dall’AI; dati, filtri e misure verificati dal server. Prezzi, aperture
        e prenotazioni non verificati.
      </p>
    </section>
  )
}
