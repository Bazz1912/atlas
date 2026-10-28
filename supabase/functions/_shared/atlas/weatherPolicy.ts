import type { WeatherMetrics } from './contracts.ts'

/** Product thresholds, not a safety guarantee. Units match the Open-Meteo request. */
export const weatherPolicy = {
  precipitationProbability: 60, // % (hourly or daily maximum)
  hourlyPrecipitationMm: 1,
  dailyPrecipitationMm: 5,
  windKmh: 35,
  gustsKmh: 50,
  thunderstormCodes: [95, 96, 99],
  frozenPrecipitationCodes: [56, 57, 66, 67, 71, 73, 75, 77, 85, 86],
}
export const weatherLimits = {
  cacheMs: 15 * 60_000,
  failureCacheMs: 30_000,
  requestsPerMinute: 20,
  requestsPerDay: 1000, // best-effort budget for this app instance

  cacheEntries: 64,
  explorerCandidates: 20,
}
export function assessWeather(m: WeatherMetrics, period: 'hour' | 'day') {
  const risks: string[] = []
  if (
    m.precipitationProbability !== null &&
    m.precipitationProbability >= weatherPolicy.precipitationProbability
  )
    risks.push(`Probabilità di precipitazioni ${m.precipitationProbability}%`)
  const threshold =
    period === 'hour' ? weatherPolicy.hourlyPrecipitationMm : weatherPolicy.dailyPrecipitationMm
  if (m.precipitation !== null && m.precipitation >= threshold)
    risks.push(
      `Precipitazioni previste ${m.precipitation.toLocaleString('it')} mm/${period === 'hour' ? 'ora' : 'giorno'}`,
    )
  if (m.wind !== null && m.wind >= weatherPolicy.windKmh)
    risks.push(`Vento previsto ${m.wind} km/h`)
  if (m.gusts !== null && m.gusts >= weatherPolicy.gustsKmh)
    risks.push(`Raffiche previste ${m.gusts} km/h`)
  if (m.thunderstorm) risks.push('Possibili temporali')
  if (m.weatherCode !== null && weatherPolicy.frozenPrecipitationCodes.includes(m.weatherCode))
    risks.push('Possibile neve o precipitazione gelata')
  return risks
}
export function conditionLabel(code: number | null): string {
  if (code === 0) return 'Sereno previsto'
  if (code === 1 || code === 2) return 'Parzialmente nuvoloso'
  if (code === 3) return 'Coperto'
  if (code === 45 || code === 48) return 'Possibile nebbia'
  if (code !== null && weatherPolicy.thunderstormCodes.includes(code)) return 'Possibili temporali'
  if (code !== null && weatherPolicy.frozenPrecipitationCodes.includes(code))
    return 'Possibile neve o ghiaccio'
  if (code !== null && [51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code))
    return 'Possibili piogge'
  return 'Condizioni non disponibili'
}
