import type {
  RouteSummary,
  TripBudget,
  TollQuote,
  CategoryRecord,
  Experience,
  Place,
  Review,
  ReviewDraft,
  Trip,
  Visit,
  Priority,
  StatusFilter,
  Environment,
} from './domain.ts'
export interface ExperienceRepository {
  list(): Promise<Experience[]>
  save(item: Experience, photo: Blob | null, review?: ReviewDraft): Promise<Experience>
  remove(id: string): Promise<void>
}
export interface CategoryRepository {
  list(): Promise<CategoryRecord[]>
  save(category: CategoryRecord): Promise<void>
  remove(id: string, replacementId?: string): Promise<void>
}
export interface ReviewRepository {
  list(experienceId?: string): Promise<Review[]>
  visits(): Promise<Visit[]>
  save(experienceId: string, draft: ReviewDraft): Promise<void>
}
export interface TripRepository {
  list(): Promise<Trip[]>
  save(trip: Trip): Promise<void>
  remove(id: string): Promise<void>
}
export interface ExplorerCriteria {
  status: StatusFilter
  categoryIds: string[]
  priority: Priority | ''
  environment: Environment | ''
  minRating: number | null
  date: string
  time: string
  maxDriveMinutes: number | null
  origin: Place | null
  preferences: string
  availableMinutes?: number | null
  stopMinutes?: number | null
  stopsCount?: number
  budgetMax?: number | null
  participants?: number
  roundTrip?: boolean
  stages?: ExplorerStage[]
}
export interface ExplorerStage {
  label: string
  categoryIds: string[]
  status: StatusFilter
  environment: Environment | ''
  minRating: number | null
  stopMinutes: number | null
}
export interface ExplorerProposal {
  id: string
  title: string
  description: string
  reason: string
  experienceIds: string[]
  stopMinutes: number[]
  route: RouteSummary | null
  totalSeconds: number | null
  tollQuote?: TollQuote | null
  budget?: TripBudget
  costEstimate?: { known: number; total: number | null; missing: string[]; budgetStatus: string }
  weatherById: Record<string, WeatherResult>
  weatherRequests: Record<string, WeatherRequest>
  warnings: string[]
}
export interface ExplorerAiResponse {
  status: 'review' | 'clarification' | 'results'
  criteria: ExplorerCriteria
  clarifications: string[]
  warnings: string[]
  proposals: ExplorerProposal[]
  generatedAt: string
  expiresAt: string
}
export interface ExplorerResult {
  experiences: Experience[]
  reasons: Record<string, string>
  warnings: string[]
  appliedConstraints: string[]
  weatherById?: Record<string, WeatherResult>
}
export interface AiExplorerService {
  find(
    criteria: ExplorerCriteria,
    items: Experience[],
    reviews: Review[],
    authorId: string,
    excludedIds?: string[],
    signal?: AbortSignal,
  ): Promise<ExplorerResult>
  interpret(text: string): Promise<ExplorerCriteria>
}
export interface RoutingService {
  readonly configured: boolean
  calculate(trip: Trip, items: Experience[], signal?: AbortSignal): Promise<RouteSummary>
}
export interface WeatherRequest {
  latitude: number
  longitude: number
  date: string
  localTime?: string
  timezone?: string
  /** Absolute arrival instant; overrides the visit date/time after timezone conversion. */
  instant?: string
}
export interface WeatherMetrics {
  temperature: number | null
  temperatureMin: number | null
  temperatureMax: number | null
  precipitationProbability: number | null
  rain: number | null
  precipitation: number | null
  wind: number | null
  gusts: number | null
  weatherCode: number | null
  thunderstorm: boolean | null
}
export type WeatherResult =
  | { available: false; reason: string }
  | {
      available: true
      date: string
      timezone: string
      localTime?: string
      instant?: string
      period: 'hour' | 'day'
      adverse: boolean
      incomplete: boolean
      risks: string[]
      metrics: WeatherMetrics
      summary: string
      source: string
      fetchedAt: string
    }
export interface WeatherService {
  readonly configured: boolean
  seed?(request: WeatherRequest, result: WeatherResult): void
  forecast(request: WeatherRequest, signal?: AbortSignal): Promise<WeatherResult>
}
