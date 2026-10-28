import type { RouteReference, RouteSummary, TollQuote } from './domain.ts'
// Geometry checks only: fuel/distance always use the Geoapify road distance.
export function metersBetween(a: number[], b: number[]) {
  const rad = Math.PI / 180,
    lat = ((a[1]! + b[1]!) * rad) / 2
  return Math.hypot((a[0]! - b[0]!) * rad * Math.cos(lat), (a[1]! - b[1]!) * rad) * 6371000
}
export function routeReference(route: RouteSummary): RouteReference {
  const vertices =
    route.geometry.type === 'LineString'
      ? route.geometry.coordinates
      : route.geometry.coordinates.flat()
  const cumulative = [0]
  for (let i = 1; i < vertices.length; i++)
    cumulative.push(cumulative[i - 1]! + metersBetween(vertices[i - 1]!, vertices[i]!))
  const length = cumulative.at(-1) || 0,
    count = 128,
    points: number[][] = []
  let index = 1
  for (let n = 0; n < count; n++) {
    const position = (length * n) / (count - 1)
    while (index < vertices.length - 1 && cumulative[index]! < position) index++
    const a = vertices[Math.max(0, index - 1)]!,
      b = vertices[Math.min(index, vertices.length - 1)]!
    if (!a || !b) throw new Error('Geometria del percorso non disponibile.')
    const f =
      (position - cumulative[Math.max(0, index - 1)]!) /
      (cumulative[index]! - cumulative[Math.max(0, index - 1)]! || 1)
    points.push([
      Number((a[0]! + (b[0]! - a[0]!) * f).toFixed(6)),
      Number((a[1]! + (b[1]! - a[1]!) * f).toFixed(6)),
    ])
  }
  return {
    fingerprint: route.fingerprint,
    distanceMeters: route.distanceMeters,
    legMeters: route.legs.map((l) => l.distanceMeters),
    points,
  }
}
export function routeReferenceKey(route: RouteSummary) {
  return JSON.stringify(routeReference(route))
}
export function compareRoutes(geo: RouteReference, here: RouteSummary): 'matched' | 'alternative' {
  if (
    geo.distanceMeters <= 0 ||
    geo.points.length !== 128 ||
    !geo.legMeters.length ||
    geo.legMeters.length !== here.legs.length
  )
    return 'alternative'
  const relative = (a: number, b: number) => Math.abs(a - b) / Math.max(a, b, 1)
  if (
    relative(geo.distanceMeters, here.distanceMeters) > 0.03 ||
    geo.legMeters.some((d, i) => relative(d, here.legs[i]!.distanceMeters) > 0.05)
  )
    return 'alternative'
  const other = routeReference(here).points,
    deviations = geo.points.map((p, i) => metersBetween(p, other[i]!))
  // Both distance and ordered shape must agree. Similar total length alone is insufficient.
  return Math.max(...deviations) <= 300 &&
    deviations.reduce((a, b) => a + b, 0) / deviations.length <= 100
    ? 'matched'
    : 'alternative'
}
export function makeTollQuote(geo: RouteReference, here: RouteSummary): TollQuote {
  return {
    reference: JSON.stringify(geo),
    comparison: compareRoutes(geo, here),
    tolls: here.tolls || { groups: [], complete: false, noTolls: false, notes: [] },
    hereDistanceMeters: here.distanceMeters,
    calculatedAt: here.calculatedAt,
  }
}
