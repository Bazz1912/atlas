import type { Experience } from './atlas/domain.ts'
import type { ExplorerCriteria, ExplorerStage } from './atlas/contracts.ts'

export class ExplorerError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message)
  }
}
export const aiLimits = {
  message: 3000,
  candidates: 60,
  stages: 5,
  proposals: 3,
  outputTokens: 1800,
  modelTimeoutMs: 30_000,
}
export const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)
export function text(value: unknown, max: number, name: string) {
  if (typeof value !== 'string' || value.length > max)
    throw new ExplorerError('INVALID_INPUT', `${name} non valido.`)
  return value.trim()
}
function choice<T extends string>(value: unknown, options: readonly T[], name: string): T {
  if (typeof value !== 'string' || !options.includes(value as T))
    throw new ExplorerError('INVALID_INPUT', `${name} non valido.`)
  return value as T
}
function numeric(value: unknown, min: number, max: number, name: string): number | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    throw new ExplorerError('INVALID_INPUT', `${name} non valido.`)
  return value
}
function ids(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 20 ||
    value.some((v) => typeof v !== 'string' || v.length > 100)
  )
    throw new ExplorerError('INVALID_INPUT', 'Categorie non valide.')
  return [...new Set(value as string[])]
}
export const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
export function parseStage(value: unknown): ExplorerStage {
  if (!isRecord(value)) throw new ExplorerError('INVALID_INPUT', 'Tappa non valida.')
  return {
    label: text(value.label, 100, 'Nome tappa'),
    categoryIds: ids(value.categoryIds),
    status: choice(value.status, ['ALL', 'DONE', 'TO_DO'], 'Stato'),
    environment: choice(value.environment, ['', 'INDOOR', 'OUTDOOR', 'MIXED'], 'Ambiente'),
    minRating: numeric(value.minRating, 0, 5, 'Voto'),
    stopMinutes: numeric(value.stopMinutes, 0, 480, 'Sosta'),
  }
}
export function parseCriteria(value: unknown): ExplorerCriteria {
  if (!isRecord(value)) throw new ExplorerError('INVALID_INPUT', 'Filtri non validi.')
  const date = text(value.date, 10, 'Data'),
    time = text(value.time, 5, 'Ora')
  if (
    date &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date)
  )
    throw new ExplorerError('INVALID_INPUT', 'Data non valida.')
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new ExplorerError('INVALID_INPUT', 'Ora non valida.')
  let origin = null
  if (value.origin != null) {
    if (!isRecord(value.origin)) throw new ExplorerError('INVALID_INPUT', 'Partenza non valida.')
    const latitude = numeric(value.origin.latitude, -85.051129, 85.051129, 'Latitudine'),
      longitude = numeric(value.origin.longitude, -180, 180, 'Longitudine')
    if (latitude === null || longitude === null)
      throw new ExplorerError('INVALID_INPUT', 'Coordinate partenza mancanti.')
    origin = { latitude, longitude, address: text(value.origin.address, 500, 'Partenza') }
  }
  const stopsCount = numeric(value.stopsCount ?? 1, 1, 5, 'Numero tappe')!
  if (!Number.isInteger(stopsCount))
    throw new ExplorerError('INVALID_INPUT', 'Numero tappe non valido.')
  if (
    value.stages !== undefined &&
    (!Array.isArray(value.stages) || value.stages.length > aiLimits.stages)
  )
    throw new ExplorerError('INVALID_INPUT', 'Troppe tappe.')
  return {
    status: choice(value.status, ['ALL', 'DONE', 'TO_DO'], 'Stato'),
    categoryIds: ids(value.categoryIds),
    priority: choice(value.priority, ['', 'LOW', 'MEDIUM', 'HIGH'], 'Priorità'),
    environment: choice(value.environment, ['', 'INDOOR', 'OUTDOOR', 'MIXED'], 'Ambiente'),
    minRating: numeric(value.minRating, 0, 5, 'Voto'),
    date,
    time,
    origin,
    maxDriveMinutes: numeric(value.maxDriveMinutes, 1, 1440, 'Tempo di guida'),
    availableMinutes: numeric(value.availableMinutes, 1, 1440, 'Tempo disponibile'),
    stopMinutes: numeric(value.stopMinutes, 0, 480, 'Sosta'),
    stopsCount,
    budgetMax: numeric(value.budgetMax, 0, 100000, 'Budget'),
    participants: (() => {
      const n = numeric(value.participants ?? 2, 1, 100, 'Partecipanti')!
      if (!Number.isInteger(n)) throw new ExplorerError('INVALID_INPUT', 'Partecipanti non validi.')
      return n
    })(),
    roundTrip: (() => {
      if (value.roundTrip !== undefined && typeof value.roundTrip !== 'boolean')
        throw new ExplorerError('INVALID_INPUT', 'Ritorno non valido.')
      return value.roundTrip === true
    })(),
    preferences: text(value.preferences, 1500, 'Preferenze'),
    stages: (value.stages as unknown[] | undefined)?.map(parseStage) || [],
  }
}
export function matches(
  item: Experience,
  criteria: ExplorerCriteria,
  ownRating: number | null,
  stage?: ExplorerStage,
) {
  if (
    item.deletedAt ||
    (criteria.status !== 'ALL' && item.status !== criteria.status) ||
    (criteria.categoryIds.length && !criteria.categoryIds.includes(item.category)) ||
    (criteria.priority && item.priority !== criteria.priority) ||
    (criteria.environment && item.environment !== criteria.environment) ||
    (criteria.minRating !== null &&
      item.status === 'DONE' &&
      (ownRating === null || ownRating < criteria.minRating))
  )
    return false
  if (
    stage &&
    ((stage.status !== 'ALL' && item.status !== stage.status) ||
      (stage.categoryIds.length && !stage.categoryIds.includes(item.category)) ||
      (stage.environment && item.environment !== stage.environment) ||
      (stage.minRating !== null && (ownRating === null || ownRating < stage.minRating)))
  )
    return false
  return true
}
export function assertCategories(criteria: ExplorerCriteria, allowed: string[]) {
  if (
    [...criteria.categoryIds, ...(criteria.stages || []).flatMap((s) => s.categoryIds)].some(
      (id) => !allowed.includes(id),
    )
  )
    throw new ExplorerError(
      'INVALID_CATEGORIES',
      'Una categoria non appartiene alla mappa selezionata.',
    )
}
/** The model cannot loosen explicit structured selections. Review is required for new constraints. */
export function mergeInterpretation(
  base: ExplorerCriteria,
  parsed: ExplorerCriteria,
): ExplorerCriteria {
  if (
    (base.status !== 'ALL' && parsed.status !== 'ALL' && base.status !== parsed.status) ||
    (base.environment && parsed.environment && base.environment !== parsed.environment) ||
    (base.categoryIds.length && parsed.categoryIds.some((id) => !base.categoryIds.includes(id))) ||
    (base.date && parsed.date && base.date !== parsed.date) ||
    (base.time && parsed.time && base.time !== parsed.time)
  )
    throw new ExplorerError(
      'CONFLICTING_FILTERS',
      'La richiesta contrasta con le selezioni: chiarisci quali condizioni mantenere.',
      422,
    )
  const stricter = (a: number | null | undefined, b: number | null | undefined) =>
    a == null ? (b ?? null) : b == null ? a : Math.min(a, b)
  return {
    ...parsed,
    status: base.status === 'ALL' ? parsed.status : base.status,
    categoryIds: base.categoryIds.length ? base.categoryIds : parsed.categoryIds,
    priority: base.priority || parsed.priority,
    environment: base.environment || parsed.environment,
    origin: base.origin,
    date: base.date || parsed.date,
    time: base.time || parsed.time,
    preferences: base.preferences,
    minRating:
      base.minRating == null ? parsed.minRating : Math.max(base.minRating, parsed.minRating ?? 0),
    maxDriveMinutes: stricter(base.maxDriveMinutes, parsed.maxDriveMinutes),
    availableMinutes: stricter(base.availableMinutes, parsed.availableMinutes),
    budgetMax: stricter(base.budgetMax, parsed.budgetMax),
    stopMinutes: base.stopMinutes ?? parsed.stopMinutes,
    participants:
      base.participants != null && base.participants !== 2
        ? base.participants
        : parsed.participants,
    roundTrip: !!base.roundTrip || !!parsed.roundTrip,
  }
}
