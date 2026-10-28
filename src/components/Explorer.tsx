import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Sparkles } from 'lucide-react'
import {
  environmentLabels,
  priorityLabels,
  type CategoryRecord,
  type Experience,
  type Review,
  type Trip,
} from '../domain'
import type { ExplorerCriteria, ExplorerAiResponse, ExplorerProposal } from '../services/contracts'
import { emptyCriteria } from '../services/explorer'
import { requestAiExplorer } from '../services/aiExplorer'
import { ExplorerProposals } from './ExplorerProposals'
import { OriginPicker } from './OriginPicker'
import { CategoryIcon } from './CategoryIcon'
function quickDate(which: string) {
  const day = new Date()
  if (which === 'tomorrow') day.setDate(day.getDate() + 1)
  if (which === 'weekend' && day.getDay() !== 0) day.setDate(day.getDate() + (6 - day.getDay()))
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
}
export function Explorer({
  items,
  categories,
  reviews,
  authorId,
  trip,
  suggesting,
  indoor = false,
  onPlan,
  onCancel,
}: {
  items: Experience[]
  categories: CategoryRecord[]
  reviews: Review[]
  authorId: string
  trip: Trip
  suggesting: boolean
  indoor?: boolean
  onPlan: (
    ids: string[],
    criteria: ExplorerCriteria,
    weatherConsents: Record<string, string>,
    proposal?: ExplorerProposal,
  ) => void
  onCancel: () => void
}) {
  const [criteria, setCriteria] = useState<ExplorerCriteria>({
      ...emptyCriteria,
      participants: trip.budget?.participants ?? 2,
      budgetMax: trip.budget?.max ?? null,
      roundTrip: trip.budget?.roundTrip ?? false,
      origin: trip.origin,
      date: trip.date,
      time: trip.planningPreferences?.localTime || '',
      maxDriveMinutes: trip.planningPreferences?.maxDriveMinutes ?? null,
      preferences: trip.planningPreferences?.notes || '',
      environment: indoor ? 'INDOOR' : '',
      availableMinutes: trip.planningPreferences?.availableMinutes ?? null,
      stopMinutes: 30,
      stopsCount: 1,
    }),
    [step, setStep] = useState(0),
    [result, setResult] = useState<ExplorerAiResponse | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('')
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])
  const searchDataKey = JSON.stringify([
    items.map((i) => [i.id, i.updatedAt, i.latitude, i.longitude]),
    reviews,
  ])
  useEffect(() => {
    request.current?.abort()
    setResult(null)
    setBusy(false)
  }, [searchDataKey])
  useEffect(() => {
    if (!result || result.status !== 'results') return
    const timer = setTimeout(
      () => {
        setResult(null)
        setError('Proposte scadute: ripeti la ricerca per aggiornare dati e meteo.')
      },
      Math.max(0, Date.parse(result.expiresAt) - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [result])
  const update = (patch: Partial<ExplorerCriteria>) => {
    request.current?.abort()
    setError('')
    setBusy(false)
    const next = { ...criteria, ...patch }
    setCriteria(next)
    setResult((current) => (current?.status === 'review' ? { ...current, criteria: next } : null))
  }
  const find = async (mode: 'interpret' | 'plan' = 'plan', source?: 'guided' | 'natural') => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setError('')
    setResult(null)
    const queryText = source === 'guided' ? criteria.preferences : message || criteria.preferences
    try {
      const found = await requestAiExplorer(mode, criteria, items, {
        message: queryText,
        trip: suggesting ? trip : undefined,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      if (mode === 'interpret') found.criteria.preferences = queryText.slice(0, 1500)
      setResult(found)
      setCriteria(found.criteria)
      if (found.status !== 'results') setStep(2)
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : 'Ricerca AI non disponibile.')
    } finally {
      if (request.current === controller) setBusy(false)
    }
  }
  return (
    <div className="explorer">
      <div className="feature-banner">
        <Sparkles size={22} />
        <div>
          <strong>
            {suggesting ? 'Una nuova tappa per il tuo viaggio' : 'Idee dai tuoi luoghi'}
          </strong>
          <p>Proposte AI dai posti della mappa selezionata</p>
        </div>
      </div>
      {suggesting && (
        <div className="context-strip">
          {trip.name} · {trip.waypoints.length}{' '}
          {trip.waypoints.length === 1 ? 'tappa già selezionata' : 'tappe già selezionate'}
          <button className="text-button" onClick={onCancel}>
            Torna al viaggio
          </button>
        </div>
      )}
      <div className="wizard-steps" aria-label="Passaggi della ricerca">
        {['Cosa', 'Da dove', 'Quando'].map((label, i) => (
          <button key={label} className={step === i ? 'selected' : ''} onClick={() => setStep(i)}>
            <span>{i + 1}</span>
            {label}
          </button>
        ))}
      </div>
      {step === 0 ? (
        <div className="wizard-fields">
          <label className="field-label">
            Quali esperienze?
            <select
              value={criteria.status}
              onChange={(e) => update({ status: e.target.value as ExplorerCriteria['status'] })}
            >
              <option value="ALL">Tutte</option>
              <option value="TO_DO">Solo da fare</option>
              <option value="DONE">Solo già fatte</option>
            </select>
          </label>
          <fieldset>
            <legend>
              Cosa ti va? <span>Facoltativo · più scelte</span>
            </legend>
            <div className="category-chips">
              {categories.map((c) => (
                <button
                  key={c.id}
                  aria-pressed={criteria.categoryIds.includes(c.id)}
                  className={criteria.categoryIds.includes(c.id) ? 'selected' : ''}
                  onClick={() =>
                    update({
                      categoryIds: criteria.categoryIds.includes(c.id)
                        ? criteria.categoryIds.filter((id) => id !== c.id)
                        : [...criteria.categoryIds, c.id],
                    })
                  }
                >
                  <span style={{ color: c.color }}>
                    <CategoryIcon name={c.icon} size={16} />
                  </span>
                  {c.name}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="field-label">
            Ambiente
            <select
              value={criteria.environment}
              onChange={(e) =>
                update({ environment: e.target.value as ExplorerCriteria['environment'] })
              }
            >
              <option value="">Indifferente</option>
              {Object.entries(environmentLabels).map(([id, label]) => (
                <option value={id} key={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Priorità
            <select
              value={criteria.priority}
              onChange={(e) => update({ priority: e.target.value as ExplorerCriteria['priority'] })}
            >
              <option value="">Qualsiasi</option>
              {Object.entries(priorityLabels).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Valutazione minima · ultima tua recensione
            <select
              value={criteria.minRating ?? ''}
              onChange={(e) =>
                update({ minRating: e.target.value === '' ? null : Number(e.target.value) })
              }
            >
              <option value="">Qualsiasi</option>
              {[3, 3.5, 4, 4.5, 5].map((r) => (
                <option key={r} value={r}>
                  {r.toLocaleString('it')} stelle
                </option>
              ))}
            </select>
            <small className="field-help">
              Si applica solo ai già fatti; quelli senza un tuo voto vengono esclusi. Le esperienze
              da fare restano ammissibili.
            </small>
          </label>
        </div>
      ) : step === 1 ? (
        <div className="wizard-fields">
          <OriginPicker
            items={items}
            value={criteria.origin}
            onChange={(origin) => update({ origin })}
          />
          <label className="field-label">
            Quanto vuoi spostarti?
            <select
              value={criteria.maxDriveMinutes ?? ''}
              onChange={(e) =>
                update({ maxDriveMinutes: e.target.value ? Number(e.target.value) : null })
              }
            >
              <option value="">Nessun limite</option>
              {[15, 30, 60, 120].map((n) => (
                <option key={n} value={n}>
                  {n < 60 ? `${n} minuti` : `${n / 60} ${n === 60 ? 'ora' : 'ore'}`}
                </option>
              ))}
            </select>
            <small className="field-help">
              Limite totale di guida delle tappe, verificato dal server con Geoapify, con il ritorno
              se selezionato e senza traffico live.
            </small>
          </label>
        </div>
      ) : (
        <div className="wizard-fields">
          <fieldset>
            <legend>Quando vuoi andare?</legend>
            <div className="date-presets">
              {[
                ['today', 'Oggi'],
                ['tomorrow', 'Domani'],
                ['weekend', 'Questo weekend'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className="secondary-button"
                  onClick={() => update({ date: quickDate(id!) })}
                >
                  {label}
                </button>
              ))}
              <button className="text-button" onClick={() => update({ date: '' })}>
                Indifferente
              </button>
            </div>
          </fieldset>
          <label className="field-label">
            Giorno specifico
            <input
              type="date"
              value={criteria.date}
              onChange={(e) => update({ date: e.target.value })}
            />
          </label>
          <label className="field-label">
            Ora di partenza / visita (fuso della partenza o del singolo luogo)
            <input
              type="time"
              value={criteria.time}
              onInput={(e) => update({ time: e.currentTarget.value })}
            />
          </label>
          <label className="field-label">
            Tempo disponibile complessivo (minuti, facoltativo)
            <input
              type="number"
              min="1"
              max="1440"
              value={criteria.availableMinutes ?? ''}
              onChange={(e) =>
                update({ availableMinutes: e.target.value ? Number(e.target.value) : null })
              }
            />
          </label>
          <label className="field-label">
            Numero tappe desiderate
            <select
              value={criteria.stages?.length || criteria.stopsCount || 1}
              onChange={(e) => update({ stopsCount: Number(e.target.value), stages: [] })}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Sosta proposta per tappa (minuti, modificabile)
            <input
              type="number"
              min="0"
              max="480"
              value={criteria.stopMinutes ?? ''}
              onChange={(e) =>
                update({ stopMinutes: e.target.value ? Number(e.target.value) : null })
              }
            />
            <small className="field-help">
              Durata pianificata, non misurata. Le eventuali durate esplicite delle singole tappe
              prevalgono.
            </small>
          </label>
          <div className="cost-grid">
            <label className="field-label">
              Partecipanti
              <input
                type="number"
                min="1"
                max="100"
                step="1"
                value={criteria.participants ?? 2}
                onChange={(e) => update({ participants: Number(e.target.value) })}
              />
            </label>
          </div>
          <label className="cost-toggle">
            <input
              type="checkbox"
              checked={!!criteria.roundTrip}
              onChange={(e) => update({ roundTrip: e.target.checked })}
            />
            Includi ritorno alla partenza
          </label>
          <p className="field-help">
            Prezzi salvati e carburante stimato automaticamente. Se mancano importi o pedaggi, il
            budget non è garantito.
          </p>
          <label className="field-label">
            Budget totale €
            <input
              type="number"
              min="0"
              max="100000"
              step="0.01"
              inputMode="decimal"
              placeholder="Facoltativo"
              value={criteria.budgetMax ?? ''}
              onChange={(e) =>
                update({ budgetMax: e.target.value === '' ? null : Number(e.target.value) })
              }
            />
          </label>
          <label className="field-label">
            Preferenze aggiuntive
            <textarea
              maxLength={1500}
              value={criteria.preferences}
              onChange={(e) => update({ preferences: e.target.value })}
              placeholder="Annotazioni per il piano…"
            />
            <small className="field-help">
              Le preferenze vengono interpretate solo all’invio. Controlla i filtri estratti prima
              di confermare.
            </small>
          </label>
        </div>
      )}
      <div className="wizard-actions">
        {step > 0 && (
          <button className="secondary-button" onClick={() => setStep((s) => s - 1)}>
            Indietro
          </button>
        )}
        {step < 2 && (
          <button className="secondary-button" onClick={() => setStep((s) => s + 1)}>
            Avanti
            <ArrowRight size={16} />
          </button>
        )}
        <button
          className="primary-button"
          disabled={busy}
          onClick={() =>
            void find(
              result?.status === 'review'
                ? 'plan'
                : criteria.preferences.trim()
                  ? 'interpret'
                  : 'plan',
              'guided',
            )
          }
        >
          <Sparkles size={17} />
          {busy ? 'Ricerca…' : 'Trova un’idea'}
        </button>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {result && result.status !== 'results' && (
        <section className="ai-interpretation" aria-label="Filtri interpretati">
          <h2>
            {result.status === 'clarification'
              ? 'Serve un chiarimento'
              : 'Controlla le scelte interpretate'}
          </h2>
          {result.clarifications.map((question, i) => (
            <p className="constraint-note" key={i}>
              {question}
            </p>
          ))}
          {result.warnings.map((warning, i) => (
            <p className="field-help" key={i}>
              {warning}
            </p>
          ))}
          <p>
            Stato:{' '}
            {criteria.status === 'ALL'
              ? 'Tutte'
              : criteria.status === 'DONE'
                ? 'Già fatte'
                : 'Da fare'}{' '}
            · Ambiente:{' '}
            {criteria.environment ? environmentLabels[criteria.environment] : 'Indifferente'}
          </p>
          <p>
            Categorie:{' '}
            {criteria.categoryIds.length
              ? criteria.categoryIds
                  .map((id) => categories.find((c) => c.id === id)?.name || id)
                  .join(', ')
              : 'Qualsiasi'}
          </p>
          <p>
            Data: {criteria.date || 'Non indicata'} · Ora: {criteria.time || 'Non indicata'} · Guida
            massima: {criteria.maxDriveMinutes ?? 'Nessun limite'} min · Tempo disponibile:{' '}
            {criteria.availableMinutes ?? 'Non indicato'} min
          </p>
          {criteria.stages?.map((stage, i) => (
            <p key={i}>
              {i + 1}. {stage.label} ·{' '}
              {stage.categoryIds
                .map((id) => categories.find((c) => c.id === id)?.name || id)
                .join(', ') || 'Qualsiasi categoria'}{' '}
              · {stage.status} · {stage.environment || 'Ambiente indifferente'}
              {stage.minRating != null ? ` · Tuo voto minimo ${stage.minRating}` : ''} · Sosta{' '}
              {stage.stopMinutes ?? criteria.stopMinutes ?? 'da specificare'} min
            </p>
          ))}
          <p className="field-help">
            Modifica i campi sopra, oppure aggiorna la richiesta libera. I filtri non vengono
            allentati automaticamente.
          </p>
          {criteria.budgetMax != null && (
            <button
              className="secondary-button"
              onClick={() => {
                const next = { ...criteria, budgetMax: null }
                const questions = result.clarifications.filter((q) => !/budget|prezzi/i.test(q))
                setCriteria(next)
                setResult({
                  ...result,
                  criteria: next,
                  clarifications: questions,
                  status: questions.length ? 'clarification' : 'review',
                })
              }}
            >
              Rimuovi il vincolo budget
            </button>
          )}
          <button
            className="primary-button"
            disabled={busy || result.status === 'clarification'}
            onClick={() => void find('plan')}
          >
            Conferma i filtri e cerca proposte
          </button>
          {result.status === 'clarification' && (
            <button
              className="secondary-button"
              onClick={() => {
                setMessage('')
                update({ preferences: '', stages: [] })
              }}
            >
              Passa alla ricerca con soli filtri guidati
            </button>
          )}
        </section>
      )}
      {result?.status === 'results' && (
        <ExplorerProposals
          key={result.generatedAt}
          response={result}
          items={items}
          reviews={reviews}
          authorId={authorId}
          onPlan={(proposal, consents) =>
            onPlan(proposal.experienceIds, result.criteria, consents, proposal)
          }
          onAlternative={() => {
            update({
              environment: 'INDOOR',
              stages: criteria.stages?.map((s) => ({ ...s, environment: 'INDOOR' })),
            })
            setStep(0)
            setError(
              'Alternativa al chiuso: filtro Ambiente aggiornato; gli altri vincoli restano invariati.',
            )
          }}
        />
      )}
      <details className="free-request" open={result?.status === 'clarification'}>
        <summary>Richiesta in linguaggio naturale</summary>
        <label className="field-label">
          Cosa vorresti fare?
          <textarea
            maxLength={3000}
            value={message}
            onChange={(e) => {
              request.current?.abort()
              setBusy(false)
              setResult(null)
              setMessage(e.target.value)
            }}
            placeholder="Domenica vorrei pranzare e poi passeggiare, massimo un’ora in auto da casa…"
          />
        </label>
        <button
          className="primary-button"
          disabled={busy || !message.trim()}
          onClick={() => void find('interpret', 'natural')}
        >
          <Sparkles size={17} /> Interpreta richiesta
        </button>
      </details>
      <p className="field-help">
        Solo all’invio, richiesta e dati essenziali dei luoghi della mappa vengono elaborati da
        OpenAI. Le foto non vengono inviate. Massimo 2 richieste al minuto e 20 al giorno;
        interpretazione e ricerca sono due richieste distinte.
      </p>
    </div>
  )
}
