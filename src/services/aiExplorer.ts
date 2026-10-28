import { backend } from '../account/client'
import { assertScope, requireScope } from '../account/scope'
import type { Experience, Trip } from '../domain'
import type { ExplorerAiResponse, ExplorerCriteria, ExplorerProposal } from './contracts'
import { weatherService } from './weather'
import { currentRoute } from './routing'

/** Explicit submit only; no model calls while editing controls. No OpenAI secrets in this module. */
export async function requestAiExplorer(
  mode: 'interpret' | 'plan',
  criteria: ExplorerCriteria,
  items: Experience[],
  options: { message?: string; trip?: Trip; signal?: AbortSignal } = {},
): Promise<ExplorerAiResponse> {
  const scope = requireScope(),
    client = backend()
  const {
    data: { session },
  } = await client.auth.getSession()
  if (!session || session.user.id !== scope.userId)
    throw new Error('Accedi nuovamente per usare AI Explorer.')
  assertScope(scope)
  const controller = new AbortController(),
    abort = () => controller.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted) abort()
  const timer = setTimeout(abort, 110_000)
  try {
    const { data, error } = await client.functions.invoke('atlas-ai-explorer', {
      body: {
        mode,
        criteria,
        message: options.message || '',
        requestId: crypto.randomUUID(),
        mapId: scope.mapId,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        excludedIds: options.trip?.waypoints.map((w) => w.experienceId) || [],
        prefix: options.trip?.waypoints || [],
      },
      signal: controller.signal,
    })
    assertScope(scope)
    if (controller.signal.aborted)
      throw new DOMException('Richiesta annullata o scaduta', 'AbortError')
    if (error) {
      let message =
        'AI Explorer non raggiungibile. Verifica deployment della funzione, migrazione e secret server; la ricerca non è stata simulata.'
      if (error.context instanceof Response) {
        try {
          const body = await error.context.json()
          if (typeof body.error === 'string') message = body.error
        } catch {
          /* sanitized fallback */
        }
      }
      throw new Error(message)
    }
    if (
      !data ||
      !['review', 'clarification', 'results'].includes(data.status) ||
      !Array.isArray(data.proposals) ||
      data.proposals.length > 3 ||
      !Array.isArray(data.clarifications) ||
      !Array.isArray(data.warnings) ||
      !data.criteria ||
      !Number.isFinite(Date.parse(data.expiresAt))
    )
      throw new Error('Risposta AI non valida. Ripeti la ricerca.')
    const response = data as ExplorerAiResponse
    for (const proposal of response.proposals) {
      if (
        !Array.isArray(proposal.experienceIds) ||
        proposal.experienceIds.length > 25 ||
        proposal.experienceIds.some((id) => !items.some((i) => i.id === id && !i.deletedAt)) ||
        new Set(proposal.experienceIds).size !== proposal.experienceIds.length ||
        !Array.isArray(proposal.stopMinutes) ||
        proposal.stopMinutes.length !== proposal.experienceIds.length ||
        proposal.stopMinutes.some((n) => !Number.isFinite(n) || n < 0 || n > 1440)
      )
        throw new Error('I luoghi della mappa sono cambiati. Aggiorna ATLAS e ripeti la ricerca.')
      if (proposal.route && !currentRoute(proposalTrip(proposal, response.criteria), items))
        throw new Error('Percorso della proposta non valido. Ripeti la ricerca.')
      for (const [id, request] of Object.entries(proposal.weatherRequests || {})) {
        const item = items.find((i) => i.id === id)
        if (
          item &&
          request.latitude === item.latitude &&
          request.longitude === item.longitude &&
          proposal.weatherById[id]
        )
          weatherService.seed?.(request, proposal.weatherById[id]!)
      }
    }
    return response
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abort)
  }
}
export function proposalTrip(proposal: ExplorerProposal, criteria: ExplorerCriteria): Trip {
  return {
    id: crypto.randomUUID(),
    name: proposal.title.slice(0, 120),
    origin: criteria.origin,
    date: criteria.date,
    budget: proposal.budget,
    tollQuote: proposal.tollQuote,
    waypoints: proposal.experienceIds.map((experienceId, i) => ({
      experienceId,
      stopMinutes: proposal.stopMinutes[i]!,
    })),
    planningPreferences: {
      localTime: criteria.time,
      weatherVisitTime: proposal.route ? undefined : criteria.time,
      maxDriveMinutes: criteria.maxDriveMinutes,
      availableMinutes: criteria.availableMinutes,
      notes: criteria.preferences,
    },
    routeSummary: proposal.route,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}
