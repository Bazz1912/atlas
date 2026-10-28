import type { Experience, CategoryRecord, Trip } from '../_shared/atlas/domain.ts'
import type {
  ExplorerAiResponse,
  ExplorerCriteria,
  ExplorerProposal,
  ExplorerStage,
  WeatherRequest,
} from '../_shared/atlas/contracts.ts'
import {
  aiLimits,
  assertCategories,
  ExplorerError,
  isRecord,
  matches,
  mergeInterpretation,
  parseCriteria,
  text,
} from '../_shared/explorer-domain.ts'
import {
  interpretationInstructions,
  interpretationSchema,
  selectionInstructions,
  suggestionsSchema,
} from '../_shared/openai.ts'
import { defaultBudget, tripEstimate } from '../_shared/atlas/costs.ts'
import type { TollQuote, RouteSummary } from '../_shared/atlas/domain.ts'
import { routingService } from '../_shared/atlas/routing.ts'
import {
  visitInstant,
  weatherService,
  weatherDecision,
  localParts,
} from '../_shared/atlas/weather.ts'
import { arrivalInstants } from '../_shared/atlas/tripSchedule.ts'
export interface Snapshot {
  map: { id: string; type: string; created_by: string }
  member: boolean
  items: Experience[]
  categories: CategoryRecord[]
  ratings: Record<string, number | null>
  actorId?: string
}
export interface EngineInput {
  mode: 'interpret' | 'plan'
  criteria: ExplorerCriteria
  message: string
  timezone: string
  excludedIds: string[]
  prefix: { experienceId: string; stopMinutes: number }[]
}
export type ModelCall = (options: {
  schema: unknown
  name: string
  instructions: string
  input: unknown
  signal?: AbortSignal
}) => Promise<Record<string, unknown>>
export interface EngineDependencies {
  hereTolls?: (
    snapshot: Snapshot,
    trip: Trip,
    items: Experience[],
    route: RouteSummary,
    signal?: AbortSignal,
  ) => Promise<TollQuote>
  model: ModelCall
  routing?: typeof routingService
  weather?: typeof weatherService
  now?: () => number
}
export function blankResponse(
  criteria: ExplorerCriteria,
  now: number,
  status: ExplorerAiResponse['status'] = 'results',
): ExplorerAiResponse {
  return {
    status,
    criteria,
    clarifications: [],
    warnings: [],
    proposals: [],
    generatedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 120_000).toISOString(),
  }
}
export async function runExplorer(
  input: EngineInput,
  snapshot: Snapshot,
  dependencies: EngineDependencies,
  signal?: AbortSignal,
): Promise<ExplorerAiResponse> {
  const { criteria } = input,
    now = dependencies.now?.() ?? Date.now(),
    response = blankResponse(criteria, now)
  assertCategories(
    criteria,
    snapshot.categories.map((c) => c.id),
  )
  if (input.mode === 'interpret') {
    const local = localParts(now, input.timezone).date
    const parsed = await dependencies.model({
      name: 'atlas_interpretation',
      schema: interpretationSchema,
      instructions: interpretationInstructions,
      input: {
        request: input.message,
        selections: { ...criteria, origin: undefined },
        originProvided: !!criteria.origin,
        today: local,
        timezone: input.timezone,
        categories: snapshot.categories.map((c) => ({ id: c.id, name: c.name })),
      },
      signal,
    })
    if (!Array.isArray(parsed.clarifications) || parsed.clarifications.length > 5)
      throw new ExplorerError('AI_INVALID_RESPONSE', 'Chiarimenti AI non validi.', 502)
    const interpreted = parseCriteria({
      ...criteria,
      ...parsed,
      priority: criteria.priority,
      origin: criteria.origin,
      preferences: criteria.preferences,
      stopsCount:
        Array.isArray(parsed.stages) && parsed.stages.length
          ? parsed.stages.length
          : criteria.stopsCount,
    })
    response.criteria = mergeInterpretation(criteria, interpreted)
    assertCategories(
      response.criteria,
      snapshot.categories.map((c) => c.id),
    )
    response.clarifications = parsed.clarifications.map((c) => text(c, 500, 'Chiarimento'))
    response.status = response.clarifications.length ? 'clarification' : 'review'
    response.warnings.push(
      'Controlla i filtri interpretati e confermali prima della ricerca. Le soste sono durate pianificate, non orari di apertura verificati.',
    )
    return response
  }
  if ((criteria.maxDriveMinutes != null || criteria.availableMinutes != null) && !criteria.origin)
    response.clarifications.push(
      'Scegli una partenza reale per verificare guida e tempo totale disponibile.',
    )
  const stages: ExplorerStage[] = criteria.stages?.length
    ? criteria.stages
    : Array.from({ length: criteria.stopsCount || 1 }, (_, i) => ({
        label: `Tappa ${i + 1}`,
        categoryIds: [],
        status: 'ALL',
        environment: '',
        minRating: null,
        stopMinutes: criteria.stopMinutes ?? null,
      }))
  if (stages.some((s) => (s.stopMinutes ?? criteria.stopMinutes) == null))
    response.clarifications.push(
      'Indica la durata prevista delle soste per calcolare la durata totale.',
    )
  if (response.clarifications.length) {
    response.status = 'clarification'
    return response
  }
  const prefix = input.prefix.map((w) => {
    const item = snapshot.items.find((i) => i.id === w.experienceId && !i.deletedAt)
    if (!item)
      throw new ExplorerError(
        'STALE_TRIP',
        'Una tappa del viaggio non è più accessibile nella mappa.',
        409,
      )
    return item
  })
  const candidates = snapshot.items.filter(
    (i) =>
      !input.excludedIds.includes(i.id) &&
      !prefix.some((p) => p.id === i.id) &&
      stages.some((s) => matches(i, criteria, snapshot.ratings[i.id] ?? null, s)),
  )
  if (candidates.length > aiLimits.candidates)
    throw new ExplorerError(
      'TOO_MANY_CANDIDATES',
      'Più di 60 luoghi compatibili: restringi categoria, ambiente o stato.',
      422,
    )
  const eligible = stages.map((s) =>
    candidates
      .filter((i) => matches(i, criteria, snapshot.ratings[i.id] ?? null, s))
      .map((i) => i.id),
  )
  if (!candidates.length || eligible.some((ids) => !ids.length)) {
    response.warnings.push(
      'Nessun luogo salvato soddisfa tutte le tappe richieste. Modifica esplicitamente i filtri per ampliare la ricerca.',
    )
    return response
  }
  const selected = await dependencies.model({
    name: 'atlas_combinations',
    schema: suggestionsSchema(candidates.map((i) => i.id)),
    instructions: selectionInstructions,
    input: {
      budgetMax: criteria.budgetMax ?? null,
      participants: criteria.participants ?? 2,
      preferences: input.message || criteria.preferences,
      stages: stages.map((s, i) => ({ ...s, eligibleIds: eligible[i] })),
      candidates: candidates.map((i) => ({
        id: i.id,
        title: i.title.slice(0, 160),
        category: i.category,
        status: i.status,
        environment: i.environment || 'UNKNOWN',
        cost: i.cost ?? null,
        ownRating: snapshot.ratings[i.id] ?? null,
      })),
    },
    signal,
  })
  if (!Array.isArray(selected.proposals) || selected.proposals.length > 3)
    throw new ExplorerError('AI_INVALID_RESPONSE', 'Combinazioni AI non valide.', 502)
  const seen = new Set<string>()
  const routing = dependencies.routing || routingService,
    weather = dependencies.weather || weatherService
  for (const [position, raw] of selected.proposals.entries()) {
    if (
      !isRecord(raw) ||
      !Array.isArray(raw.experienceIds) ||
      raw.experienceIds.length !== stages.length ||
      !raw.experienceIds.every((id, i) => typeof id === 'string' && eligible[i]!.includes(id)) ||
      new Set(raw.experienceIds).size !== raw.experienceIds.length ||
      !Array.isArray(raw.reasons) ||
      raw.reasons.some(
        (r) =>
          !['CATEGORY', 'STATUS', 'OWN_RATING', 'ENVIRONMENT', 'PREFERENCES'].includes(String(r)),
      )
    )
      throw new ExplorerError(
        'AI_INVALID_IDS',
        'La risposta AI non rispetta gli ID o i vincoli delle tappe. Nessuna proposta utilizzata.',
        502,
      )
    const signature = JSON.stringify(raw.experienceIds)
    if (seen.has(signature)) continue
    seen.add(signature)
    const selectedItems = raw.experienceIds.map((id) => candidates.find((i) => i.id === id)!)
    const allItems = [...prefix, ...selectedItems]
    const waypoints = [
      ...input.prefix,
      ...selectedItems.map((item, i) => ({
        experienceId: item.id,
        stopMinutes: stages[i]!.stopMinutes ?? criteria.stopMinutes!,
      })),
    ]
    const trip: Trip = {
      id: 'ai-verified-route',
      name: 'Proposta verificata',
      origin: criteria.origin,
      date: criteria.date,
      budget: {
        ...defaultBudget(),
        participants: criteria.participants ?? 2,
        max: criteria.budgetMax ?? null,
        roundTrip: !!criteria.roundTrip,
      },
      waypoints,
      routeSummary: null,
      createdAt: '',
      updatedAt: '',
    }
    let route = null
    const warnings: string[] = []
    if (allItems.length + (criteria.origin ? 1 : 0) >= 2) {
      if (!routing.configured)
        throw new ExplorerError(
          'ROUTING_NOT_CONFIGURED',
          'Configura il secret server GEOAPIFY_API_KEY per verificare le combinazioni. La chiave browser resta invariata.',
          503,
        )
      try {
        route = await routing.calculate(trip, allItems, signal)
      } catch {
        response.warnings.push(
          `Proposta ${position + 1} non utilizzata: percorso stradale non verificabile. Controlla il servizio di routing e le posizioni.`,
        )
        continue
      }
      if (
        route.legs.length !==
        allItems.length - (criteria.origin ? 0 : 1) + (criteria.roundTrip ? 1 : 0)
      ) {
        response.warnings.push(
          'Una proposta non contiene tutti i tempi dei tratti: non utilizzata.',
        )
        continue
      }
    } else warnings.push('Guida dalla partenza non verificata: nessuna partenza selezionata.')
    if (
      criteria.maxDriveMinutes != null &&
      (!route || route.durationSeconds > criteria.maxDriveMinutes * 60)
    ) {
      response.warnings.push(
        'Una combinazione supera il limite totale di guida ed è stata scartata.',
      )
      continue
    }
    const totalSeconds = route
      ? route.durationSeconds + waypoints.reduce((sum, w) => sum + w.stopMinutes * 60, 0)
      : null
    if (
      criteria.availableMinutes != null &&
      (totalSeconds === null || totalSeconds > criteria.availableMinutes * 60)
    ) {
      response.warnings.push(
        'Una combinazione non rispetta il tempo disponibile ed è stata scartata.',
      )
      continue
    }
    if (
      criteria.budgetMax != null &&
      tripEstimate(allItems, route, trip.budget!).known > criteria.budgetMax
    ) {
      response.warnings.push(
        'Una proposta supera il budget già con le spese conosciute: scartata dal codice.',
      )
      continue
    }
    let tollQuote: TollQuote | null = null
    // Toll lookup is useful only for an explicit budget request, on submit, after a Geoapify route.
    if (criteria.budgetMax != null && route && dependencies.hereTolls) {
      try {
        tollQuote = await dependencies.hereTolls(snapshot, trip, allItems, route, signal)
      } catch {
        warnings.push('Pedaggi non disponibili: budget non garantito.')
      }
    }
    const estimate = tripEstimate(allItems, route, trip.budget!, tollQuote)
    if (criteria.budgetMax != null && !criteria.origin && estimate.budgetStatus !== 'over') {
      estimate.total = null
      estimate.budgetStatus = 'uncertain'
      estimate.missing.push(
        'Guida fino alla prima esperienza non quantificata: scegli una partenza.',
      )
    }
    if (estimate.budgetStatus === 'over') {
      response.warnings.push(
        'Una proposta supera il budget già con le spese conosciute: scartata dal codice.',
      )
      continue
    }
    if (estimate.budgetStatus === 'uncertain')
      warnings.push(
        'Budget non garantito: costi sconosciuti potrebbero farlo superare. ' +
          estimate.missing.join(' · '),
      )
    const labels = selectedItems.map(
      (i) => snapshot.categories.find((c) => c.id === i.category)?.name || 'Esperienza',
    )
    const proposal: ExplorerProposal = {
      id: `proposal-${position + 1}`,
      title: labels.join(' + '),
      description: allItems.map((i) => i.title).join(' → '),
      reason:
        'Tappe reali della mappa selezionata, nell’ordine proposto dall’AI. Stato, categorie, ambiente e valutazioni richieste sono verificati dal codice.',
      experienceIds: allItems.map((i) => i.id),
      stopMinutes: waypoints.map((w) => w.stopMinutes),
      route,
      totalSeconds,
      budget: trip.budget,
      tollQuote,
      costEstimate: {
        known: estimate.known,
        total: estimate.total,
        missing: estimate.missing,
        budgetStatus: estimate.budgetStatus,
      },
      weatherById: {},
      weatherRequests: {},
      warnings,
    }
    if (!criteria.origin && route)
      warnings.push('Partenza dalla prima esperienza: il tempo per raggiungerla non è incluso.')
    if (route)
      warnings.push(
        `Guida ${route.provider === 'here' ? 'HERE' : 'Geoapify'}, ${criteria.roundTrip ? 'ritorno incluso' : 'solo andata'} e senza traffico live. Soste pianificate; aperture e disponibilità non verificate.`,
      )
    let arrivals: Record<string, string> = {}
    if (criteria.date && criteria.time && route) {
      const origin = criteria.origin || allItems[0]!
      const departureWeather = await weather.forecast(
        {
          latitude: origin.latitude,
          longitude: origin.longitude,
          date: criteria.date,
          localTime: criteria.time,
        },
        signal,
      )
      const departure = departureWeather.available
        ? visitInstant(criteria.date, criteria.time, departureWeather.timezone)
        : null
      if (departure)
        arrivals = arrivalInstants({ ...trip, routeSummary: route }, allItems, departure)
      if (!Object.keys(arrivals).length)
        warnings.push(
          'Arrivi non stimati: fuso/orario della partenza non verificato. Meteo giornaliero.',
        )
      else
        warnings.push(
          'L’orario selezionato è la partenza nel fuso della partenza; meteo verificato agli arrivi stimati.',
        )
    }
    for (let start = 0; start < allItems.length; start += 3) {
      await Promise.all(
        allItems.slice(start, start + 3).map(async (item) => {
          if (!criteria.date) {
            proposal.weatherById[item.id] = {
              available: false,
              reason: 'Meteo non verificato: scegli una data.',
            }
            return
          }
          const request: WeatherRequest = {
            latitude: item.latitude,
            longitude: item.longitude,
            date: criteria.date,
            localTime: route ? undefined : criteria.time || undefined,
            instant: arrivals[item.id],
          }
          proposal.weatherRequests[item.id] = request
          proposal.weatherById[item.id] = await weather.forecast(request, signal)
        }),
      )
    }
    if (Object.values(proposal.weatherById).some((f) => !f.available))
      warnings.push(
        'Meteo non verificato per una o più tappe: consulta i dettagli prima di scegliere.',
      )
    response.proposals.push(proposal)
  }
  const weatherRank = (proposal: ExplorerProposal) =>
    proposal.experienceIds.reduce((score, id) => {
      const item = snapshot.items.find((i) => i.id === id),
        forecast = proposal.weatherById[id]
      if (item?.environment === 'INDOOR') return score
      if (!forecast?.available || forecast.incomplete || !item?.environment) return score + 1
      return score + (weatherDecision(item.environment, forecast).requiresConsent ? 2 : 0)
    }, 0)
  response.proposals.sort((a, b) => weatherRank(a) - weatherRank(b))
  if (!response.proposals.length)
    response.warnings.push(
      'Nessuna delle combinazioni proposte è risultata verificabile con tutti i vincoli. Nessuna alternativa casuale aggiunta.',
    )
  return response
}
