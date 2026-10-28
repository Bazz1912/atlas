export interface MapScope {
  userId: string
  mapId: string
}
let active: Readonly<MapScope> | null = null
export function setScope(scope: MapScope | null) {
  active = scope ? Object.freeze({ ...scope }) : null
}
export function currentScope() {
  return scopeAvailable()
}
export function requireScope() {
  if (!active) throw new Error('Accedi e seleziona una mappa.')
  return active
}
export function assertScope(scope: MapScope) {
  if (active?.userId !== scope.userId || active?.mapId !== scope.mapId)
    throw new Error('La mappa o la sessione è cambiata. Riprova.')
}
let accountsOnly = false
export function enforceAccounts() {
  accountsOnly = true
}
export function scopeAvailable() {
  if (accountsOnly && !active) throw new Error('Sessione o mappa non disponibile. Accedi di nuovo.')
  return active
}
