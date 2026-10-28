/** Local deterministic helpers retained for archive/routing regression checks.
 * The production AI interface calls requestAiExplorer through the authenticated Edge Function. */
import { routingService, formatDuration } from './routing'
import { weatherService, weatherDecision } from './weather'
import { weatherLimits } from './weatherPolicy'
import type { AiExplorerService, ExplorerCriteria, ExplorerResult } from './contracts'
import type { Experience, Review, Trip } from '../domain'
export const emptyCriteria: ExplorerCriteria = {
  status: 'ALL',
  categoryIds: [],
  priority: '',
  environment: '',
  minRating: null,
  date: '',
  time: '',
  maxDriveMinutes: null,
  origin: null,
  preferences: '',
}
export function matchExperiences(
  criteria: ExplorerCriteria,
  items: Experience[],
  reviews: Review[],
  authorId: string,
  excludedIds: string[] = [],
): ExplorerResult {
  const experiences = items.filter((item) => {
    if (item.deletedAt || excludedIds.includes(item.id)) return false
    if (criteria.status !== 'ALL' && item.status !== criteria.status) return false
    if (criteria.categoryIds.length && !criteria.categoryIds.includes(item.category)) return false
    if (criteria.priority && item.priority !== criteria.priority) return false
    if (criteria.environment && item.environment !== criteria.environment) return false
    if (criteria.minRating !== null && item.status === 'DONE') {
      const own = reviews
        .filter((r) => r.experienceId === item.id && r.authorId === authorId && r.rating !== null)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
      if (!own || own.rating! < criteria.minRating) return false
    }
    return true
  })
  const warnings: string[] = []
  if (criteria.maxDriveMinutes !== null)
    warnings.push(
      'Limite in automobile non verificato: serve un servizio di routing. Questi risultati rispettano solo i filtri locali.',
    )
  if (criteria.preferences.trim())
    warnings.push(
      'Le preferenze in testo libero sono conservate nel riepilogo, ma non interpretate: serve OpenAI nel backend.',
    )
  if (criteria.date)
    warnings.push(
      'La data è una preferenza del piano: disponibilità e orari di apertura non sono verificati.',
    )
  return {
    experiences,
    reasons: Object.fromEntries(
      experiences.map((i) => [
        i.id,
        `Corrisponde ai filtri su ${[criteria.categoryIds.length ? 'categoria' : '', criteria.status !== 'ALL' ? 'stato' : '', criteria.environment ? 'ambiente' : '', criteria.priority ? 'priorità' : '', criteria.minRating !== null && i.status === 'DONE' ? 'ultima tua valutazione' : ''].filter(Boolean).join(', ') || 'luoghi salvati'}.`,
      ]),
    ),
    warnings,
    appliedConstraints: [
      'Categoria',
      'Stato',
      'Priorità',
      'Ambiente',
      'Ultima valutazione personale dei luoghi già fatti',
    ],
  }
}
async function findWithRouting(
  criteria: ExplorerCriteria,
  items: Experience[],
  reviews: Review[],
  authorId: string,
  excludedIds: string[],
  signal?: AbortSignal,
): Promise<ExplorerResult> {
  const result = matchExperiences(criteria, items, reviews, authorId, excludedIds)
  if (criteria.maxDriveMinutes === null || !routingService.configured) return result
  if (!criteria.origin)
    throw new Error('Scegli la partenza per verificare il limite in auto con Geoapify.')
  if (!Number.isFinite(criteria.maxDriveMinutes) || criteria.maxDriveMinutes <= 0)
    throw new Error('Limite di guida non valido.')
  if (result.experiences.length > 10)
    throw new Error(
      'Il limite in auto verifica fino a 10 luoghi per ricerca. Restringi categoria, stato o altri filtri prima di riprovare.',
    )
  const verified: Experience[] = []
  for (const item of result.experiences) {
    if (signal?.aborted) throw new DOMException('Ricerca annullata', 'AbortError')
    const route = await routingService.calculate(
      {
        id: 'explorer-routing',
        name: 'Ricerca guidata',
        origin: criteria.origin,
        date: criteria.date,
        waypoints: [{ experienceId: item.id, stopMinutes: 0 }],
        routeSummary: null,
        createdAt: '',
        updatedAt: '',
      },
      items,
      signal,
    )
    if (route.durationSeconds <= criteria.maxDriveMinutes * 60) {
      verified.push(item)
      result.reasons[item.id] +=
        ` Guida dalla partenza: ${formatDuration(route.durationSeconds)} (Geoapify).`
    }
  }
  return {
    ...result,
    experiences: verified,
    warnings: result.warnings
      .filter((w) => !w.startsWith('Limite in automobile'))
      .concat(
        'Limite verificato dalla partenza a ciascun luogo, in auto e senza traffico live. Calcola in Viaggi il percorso completo delle tappe selezionate.',
      ),
    appliedConstraints: [...result.appliedConstraints, 'Tempo in auto dalla partenza (Geoapify)'],
  }
}
export const aiExplorerService: AiExplorerService = {
  async find(criteria, items, reviews, authorId, excludedIds = [], signal) {
    const result = await findWithRouting(criteria, items, reviews, authorId, excludedIds, signal)
    if (!criteria.date) {
      result.warnings.push('Scegli una data per verificare il meteo dei luoghi candidati.')
      return result
    }
    result.weatherById = {}
    const candidates = result.experiences.slice(0, weatherLimits.explorerCandidates)
    // Small sequential batches avoid request bursts; the provider cache is shared with Viaggi.
    for (let index = 0; index < candidates.length; index += 3) {
      if (signal?.aborted) throw new DOMException('Ricerca annullata', 'AbortError')
      await Promise.all(
        candidates.slice(index, index + 3).map(async (item) => {
          result.weatherById![item.id] = await weatherService.forecast(
            {
              latitude: item.latitude,
              longitude: item.longitude,
              date: criteria.date,
              localTime: criteria.time,
            },
            signal,
          )
        }),
      )
    }
    const rank = (item: Experience) => {
      const forecast = result.weatherById?.[item.id]
      if (item.environment === 'INDOOR') return 0
      if (!forecast?.available || forecast.incomplete || !item.environment) return 1
      return weatherDecision(item.environment, forecast).requiresConsent ? 2 : 0
    }
    result.experiences.sort((a, b) => rank(a) - rank(b))
    if (result.experiences.length > candidates.length)
      result.warnings.push(
        `Meteo verificato per i primi ${weatherLimits.explorerCandidates} candidati. Gli altri restano visibili senza verifica; restringi i filtri.`,
      )
    result.warnings.push(
      criteria.time
        ? 'Meteo all’orario scelto, nel fuso locale di ciascun luogo. In Viaggi verrà aggiornato agli arrivi stimati dopo il calcolo del percorso.'
        : 'Meteo sull’intera giornata locale; specifica un orario per una previsione oraria.',
    )
    result.warnings.push(
      'Le tappe con avvisi restano visibili: scegli Mantieni comunque per selezionarle. Nessun filtro viene modificato automaticamente.',
    )
    result.appliedConstraints.push(
      'Previsioni Open-Meteo: compatibilità ordinata, senza esclusioni automatiche',
    )
    return result
  },
  async interpret() {
    throw new Error(
      'Le richieste libere richiedono OpenAI attraverso una funzione backend. Usa i filtri guidati.',
    )
  },
}
export { routingService } from './routing'
export { weatherService, weatherDecision } from './weather'
export function activeWaypoints(trip: Trip, items: Experience[]) {
  return trip.waypoints.filter((w) => items.some((i) => i.id === w.experienceId && !i.deletedAt))
}
