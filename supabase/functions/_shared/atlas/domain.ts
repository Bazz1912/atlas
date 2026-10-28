export const categories = [
  'Food',
  'Experience',
  'Walks',
  'Nature',
  'Culture',
  'Travel',
  'Shopping',
  'Nightlife',
  'Other',
] as const
export type Category = string
export type Environment = 'INDOOR' | 'OUTDOOR' | 'MIXED'
export const environmentLabels = {
  INDOOR: 'Al chiuso',
  OUTDOOR: 'All’aperto',
  MIXED: 'Misto / Entrambi',
}
export interface CategoryRecord {
  id: string
  slug: string
  name: string
  icon: string
  color: string
  isDefault: boolean
}
export const defaultCategories: CategoryRecord[] = categories.map((id, i) => ({
  id,
  slug: id.toLowerCase(),
  name: [
    'Cibo',
    'Esperienze',
    'Passeggiate',
    'Natura',
    'Cultura',
    'Viaggi',
    'Shopping',
    'Vita notturna',
    'Altro',
  ][i]!,
  icon: [
    'utensils',
    'sparkles',
    'footprints',
    'trees',
    'landmark',
    'plane',
    'shopping',
    'moon',
    'map-pin',
  ][i]!,
  color: [
    '#ff9c7d',
    '#b5a3ff',
    '#79dfca',
    '#98d58c',
    '#f2ce78',
    '#88b7ff',
    '#f2a0cf',
    '#ab9ffa',
    '#a9bad1',
  ][i]!,
  isDefault: true,
}))
export const categoryName = (id: string, list = defaultCategories) =>
  list.find((c) => c.id === id)?.name || 'Categoria archiviata'
export interface ReviewDraft {
  id?: string
  visitId?: string
  rating: number | null
  notes: string
  visitedAt: string | null
}
export interface Visit {
  id: string
  experienceId: string
  visitedAt: string | null
  createdBy: string
  createdAt: string
}
export interface Review {
  id: string
  experienceId: string
  visitId: string
  authorId: string
  rating: number | null
  notes: string
  createdAt: string
  updatedAt: string
}
export interface Waypoint {
  experienceId: string
  stopMinutes: number
}
export interface RouteSummary {
  provider: 'geoapify' | 'here'
  roadMeters?: Record<RoadKind, number>
  tolls?: TollEstimate
  hereRouteId?: string
  mode: 'drive'
  distanceMeters: number
  durationSeconds: number
  geometry: GeoJSON.LineString | GeoJSON.MultiLineString
  legs: { distanceMeters: number; durationSeconds: number }[]
  fingerprint: string
  calculatedAt: string
}
export interface Trip {
  id: string
  name: string
  origin: Place | null
  date: string
  budget?: TripBudget
  tollQuote?: TollQuote | null
  planningPreferences?: {
    maxDriveMinutes: number | null
    notes: string
    localTime: string
    weatherVisitTime?: string
    weatherConsents?: Record<string, string>
    availableMinutes?: number | null
  }
  waypoints: Waypoint[]
  routeSummary: RouteSummary | null
  createdAt: string
  updatedAt: string
}
export type Status = 'TO_DO' | 'DONE'
export type StatusFilter = 'ALL' | Status
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH'
export type Tab = 'map' | 'saved' | 'ai' | 'trips'
export type Place = {
  address: string
  latitude: number
  longitude: number
  source?: 'map' | 'search'
}
export interface Experience extends Place {
  id: string
  title: string
  description: string
  cost?: ExperienceCost | null
  category: Category
  categoryId?: string
  environment?: Environment
  deletedAt?: string | null
  status: Status
  priority: Priority | null
  imagePath: string | null
  imageUrl: string | null
  createdAt: string
  updatedAt: string
}
export interface Filters {
  status: StatusFilter
  category: string
  priority: string
  query: string
  price?: PriceFilter
}
export const priorityLabels: Record<Priority, string> = {
  LOW: 'Bassa',
  MEDIUM: 'Media',
  HIGH: 'Alta',
}
export const priorityColors: Record<Priority, string> = {
  LOW: '#34D399',
  MEDIUM: '#FBBF24',
  HIGH: '#FB7185',
}

export function filterExperiences(items: Experience[], filters: Filters): Experience[] {
  const query = filters.query.trim().toLocaleLowerCase('it')
  return items.filter(
    (item) =>
      matchesPrice(item, filters.price) &&
      (filters.status === 'ALL' || item.status === filters.status) &&
      (!filters.category || item.category === filters.category) &&
      (!filters.priority || (item.status === 'TO_DO' && item.priority === filters.priority)) &&
      (!query || `${item.title} ${item.address}`.toLocaleLowerCase('it').includes(query)),
  )
}

export function validateExperience(item: Experience): string | null {
  if (
    item.cost != null &&
    (!Number.isFinite(item.cost.amount) ||
      item.cost.amount < 0 ||
      item.cost.amount > 1000000 ||
      !['person', 'total'].includes(item.cost.mode))
  )
    return 'Costo non valido: lascia vuoto oppure inserisci un importo da 0 a 1.000.000 €.'
  if (!item.title.trim() || item.title.length > 160)
    return 'Inserisci un titolo di massimo 160 caratteri.'
  if (!item.category.trim()) return 'Scegli una categoria.'
  if (item.environment && !Object.hasOwn(environmentLabels, item.environment))
    return 'Ambiente non valido.'
  if (!['TO_DO', 'DONE'].includes(item.status)) return 'Stato non valido.'
  if (item.status === 'TO_DO' && (!item.priority || !Object.hasOwn(priorityLabels, item.priority)))
    return 'Scegli la priorità.'
  if (item.status === 'DONE' && item.priority !== null)
    return 'Un’esperienza già fatta non ha una priorità.'
  if (!item.address.trim()) return 'Seleziona un luogo o assegnagli un nome.'
  if (
    !Number.isFinite(item.latitude) ||
    Math.abs(item.latitude) > 85.051129 ||
    !Number.isFinite(item.longitude) ||
    Math.abs(item.longitude) > 180
  )
    return 'Coordinate non valide per la mappa.'
  if (item.description.length > 5000)
    return 'La descrizione può contenere al massimo 5000 caratteri.'
  return null
}

export function sortExperiences(items: Experience[], order: string) {
  const priorities = { HIGH: 3, MEDIUM: 2, LOW: 1 }
  return [...items].sort((a, b) =>
    order === 'priority'
      ? (b.priority ? priorities[b.priority] : 0) - (a.priority ? priorities[a.priority] : 0)
      : b.updatedAt.localeCompare(a.updatedAt),
  )
}

export function validRating(rating: number | null) {
  return (
    rating === null ||
    (Number.isFinite(rating) && rating >= 0 && rating <= 5 && Number.isInteger(rating * 2))
  )
}

export type RoadKind = 'urban' | 'rural' | 'motorway' | 'unknown'
export interface ExperienceCost {
  amount: number
  mode: 'person' | 'total'
}
export interface TripBudget {
  carCategory?: 'city' | 'sport' | 'suv'
  participants: number
  max: number | null
  roundTrip: boolean
  selectedFares?: Record<string, string>
}
export interface TollFare {
  id: string
  name: string
  euros: number | null
  paymentMethods: string[]
  conditional: boolean
  details: string
}
export interface TollGroup {
  id: string
  name: string
  fares: TollFare[]
}
export interface TollEstimate {
  groups: TollGroup[]
  complete: boolean
  noTolls: boolean
  notes: string[]
}

export interface PriceFilter {
  mode: 'all' | 'free' | '20' | '50' | '100' | 'custom' | 'unknown'
  max: number | null
  participants: number
}
export function matchesPrice(item: Experience, filter?: PriceFilter) {
  if (!filter || filter.mode === 'all') return true
  if (filter.mode === 'unknown') return item.cost == null
  if (item.cost == null) return false
  const ceiling =
    filter.mode === 'free' ? 0 : filter.mode === 'custom' ? filter.max : Number(filter.mode)
  if (
    ceiling == null ||
    !Number.isFinite(ceiling) ||
    ceiling < 0 ||
    !Number.isInteger(filter.participants) ||
    filter.participants < 1 ||
    filter.participants > 100
  )
    return false
  return item.cost.amount * (item.cost.mode === 'person' ? filter.participants : 1) <= ceiling
}
export interface RouteReference {
  fingerprint: string
  distanceMeters: number
  legMeters: number[]
  points: number[][]
}
export interface TollQuote {
  reference: string
  comparison: 'matched' | 'alternative'
  tolls: TollEstimate
  hereDistanceMeters: number
  calculatedAt: string
}
