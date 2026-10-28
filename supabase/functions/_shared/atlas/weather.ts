import type { Experience } from './domain.ts'
import type { WeatherMetrics, WeatherRequest, WeatherResult, WeatherService } from './contracts.ts'
import { assessWeather, conditionLabel, weatherLimits, weatherPolicy } from './weatherPolicy.ts'

export const weatherUnavailable = 'Meteo temporaneamente non disponibile'
const futureUnavailable = 'Previsioni non ancora disponibili'
const fields = [
  'temperature_2m',
  'precipitation_probability',
  'rain',
  'precipitation',
  'weather_code',
  'wind_speed_10m',
  'wind_gusts_10m',
] as const
interface Payload {
  timezone: string
  hourly: Record<string, unknown[]>
  fetchedAt: string
}
export function localParts(instant: number, timezone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  )
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  }
}
const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000
const abortError = () => new DOMException('Richiesta annullata', 'AbortError')
/** A subscriber can cancel without aborting a forecast shared by another component. */
function subscribe<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(abortError())
  return new Promise((resolve, reject) => {
    const abort = () => {
      cleanup()
      reject(abortError())
    }
    const cleanup = () => signal.removeEventListener('abort', abort)
    signal.addEventListener('abort', abort, { once: true })
    promise.then(
      (value) => {
        cleanup()
        resolve(value)
      },
      (error) => {
        cleanup()
        reject(error)
      },
    )
  })
}
/** Factory allows deterministic tests; production uses the single shared instance below. */
export function createWeatherService(
  fetcher: typeof fetch = (...args) => fetch(...args),
  now = () => Date.now(),
): WeatherService {
  const cache = new Map<string, { expires: number; promise: Promise<Payload | null> }>()
  const seeded = new Map<string, { expires: number; result: WeatherResult }>()
  const seedKey = (r: WeatherRequest) =>
    JSON.stringify([r.latitude, r.longitude, r.date, r.localTime || '', r.instant || ''])
  let starts: number[] = []
  let budgetDay = ''
  let dailyStarts = 0
  async function data(latitude: number, longitude: number) {
    const key = `${latitude},${longitude}`
    const hit = cache.get(key)
    if (hit && hit.expires > now()) return hit.promise
    const today = new Date(now()).toISOString().slice(0, 10)
    if (today !== budgetDay) {
      budgetDay = today
      dailyStarts = 0
    }
    if (dailyStarts >= weatherLimits.requestsPerDay) return null
    starts = starts.filter((t) => now() - t < 60_000)
    if (starts.length >= weatherLimits.requestsPerMinute) return null
    starts.push(now())
    dailyStarts++
    const entry = {
      expires: now() + weatherLimits.cacheMs,
      promise: Promise.resolve<Payload | null>(null),
    }
    entry.promise = (async () => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15_000)
      try {
        const query = new URLSearchParams({
          latitude: String(latitude),
          longitude: String(longitude),
          hourly: fields.join(','),
          timezone: 'auto',
          timeformat: 'unixtime',
          forecast_days: '16',
          temperature_unit: 'celsius',
          wind_speed_unit: 'kmh',
          precipitation_unit: 'mm',
        })
        const response = await fetcher(`https://api.open-meteo.com/v1/forecast?${query}`, {
          signal: controller.signal,
          credentials: 'omit',
        })
        if (!response.ok) throw new Error('Forecast unavailable')
        const raw = await response.json()
        if (
          typeof raw.timezone !== 'string' ||
          !Array.isArray(raw.hourly?.time) ||
          !raw.hourly.time.length
        )
          throw new Error('Invalid forecast')
        localParts(now(), raw.timezone) // Validate the IANA timezone before caching.
        return {
          timezone: raw.timezone,
          hourly: raw.hourly,
          fetchedAt: new Date(now()).toISOString(),
        }
      } catch {
        entry.expires = now() + weatherLimits.failureCacheMs
        return null
      } finally {
        clearTimeout(timeout)
      }
    })()
    if (cache.size >= weatherLimits.cacheEntries) cache.delete(cache.keys().next().value!)
    cache.set(key, entry)
    return entry.promise
  }
  return {
    configured: true,
    seed(request, result) {
      const expires = result.available
        ? Date.parse(result.fetchedAt) + weatherLimits.cacheMs
        : now() + weatherLimits.failureCacheMs
      if (
        !Number.isFinite(expires) ||
        expires <= now() ||
        expires > now() + weatherLimits.cacheMs + 60_000
      )
        return
      if (seeded.size >= weatherLimits.cacheEntries) seeded.delete(seeded.keys().next().value!)
      seeded.set(seedKey(request), { expires, result })
    },
    async forecast(request, signal) {
      if (signal?.aborted) throw abortError()
      const transferred = seeded.get(seedKey(request))
      if (transferred && transferred.expires > now()) return transferred.result
      const { latitude, longitude } = request
      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 ||
        Math.abs(longitude) > 180
      )
        return { available: false, reason: 'Coordinate del luogo non valide' }
      const absolute = request.instant ? Date.parse(request.instant) : null
      const date =
        absolute !== null && Number.isFinite(absolute)
          ? new Date(absolute).toISOString().slice(0, 10)
          : request.date
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(dayNumber(date)) ||
        new Date(dayNumber(date) * 86_400_000).toISOString().slice(0, 10) !== date ||
        (request.instant && !Number.isFinite(absolute))
      )
        return { available: false, reason: 'Scegli una data valida per vedere il meteo' }
      const utcToday = new Date(now()).toISOString().slice(0, 10)
      if (dayNumber(date) > dayNumber(utcToday) + 17)
        return { available: false, reason: futureUnavailable }
      if (dayNumber(date) < dayNumber(utcToday) - 1)
        return { available: false, reason: 'Previsioni non disponibili per date passate' }
      if (request.localTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(request.localTime))
        return { available: false, reason: 'Orario della visita non valido' }
      const payload = await subscribe(data(latitude, longitude), signal)
      if (!payload) return { available: false, reason: weatherUnavailable }
      const target =
        absolute !== null
          ? localParts(absolute, payload.timezone)
          : { date, time: request.localTime || '' }
      const today = localParts(now(), payload.timezone).date
      if (target.date < today)
        return { available: false, reason: 'Previsioni non disponibili per date passate' }
      if (dayNumber(target.date) > dayNumber(today) + 15)
        return { available: false, reason: futureUnavailable }
      if (
        absolute === null &&
        target.time &&
        !visitInstant(target.date, target.time, payload.timezone)
      )
        return {
          available: false,
          reason: 'Orario locale ambiguo o inesistente per il cambio d’ora: scegli un altro orario',
        }
      const hours = payload.hourly.time
        .map((t, i) => ({ i, t: typeof t === 'number' ? t * 1000 : NaN }))
        .filter(
          (h) => Number.isFinite(h.t) && localParts(h.t, payload.timezone).date === target.date,
        )
      let selected = hours
      const period = target.time ? 'hour' : 'day'
      if (period === 'hour') {
        const minute = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3))
        selected = [...hours]
          .filter(
            (h) =>
              absolute !== null ||
              localParts(h.t, payload.timezone).time.slice(0, 2) === target.time.slice(0, 2),
          )
          .sort((a, b) => {
            const distance = (h: typeof a) =>
              absolute !== null
                ? Math.abs(h.t - absolute)
                : Math.abs(minute(localParts(h.t, payload.timezone).time) - minute(target.time)) *
                  60_000
            return distance(a) - distance(b)
          })
          .slice(0, 1)
        // DST gaps must not silently choose a different local hour.
        if (
          selected.length &&
          absolute === null &&
          localParts(selected[0]!.t, payload.timezone).time.slice(0, 2) !== target.time.slice(0, 2)
        )
          selected = []
      }
      if (!selected.length)
        return {
          available: false,
          reason: 'Dati meteo non disponibili per il giorno/orario scelto',
        }
      const values = (field: string) =>
        selected.map(({ i }) => {
          const v = payload.hourly[field]?.[i]
          return typeof v === 'number' && Number.isFinite(v) ? v : null
        })
      const aggregate = (field: string, fn: (v: number[]) => number, requireComplete = false) => {
        const v = values(field)
        const known = v.filter((n): n is number => n !== null)
        return !known.length || (requireComplete && known.length !== v.length) ? null : fn(known)
      }
      const max = (v: number[]) => Math.max(...v),
        min = (v: number[]) => Math.min(...v)
      const codes = values('weather_code')
      const worstCode =
        codes.find((c) => c !== null && weatherPolicy.thunderstormCodes.includes(c)) ??
        codes.find((c) => c !== null && weatherPolicy.frozenPrecipitationCodes.includes(c)) ??
        aggregate('weather_code', max)
      const metrics: WeatherMetrics = {
        temperature: period === 'hour' ? aggregate('temperature_2m', max) : null,
        temperatureMin: aggregate('temperature_2m', min),
        temperatureMax: aggregate('temperature_2m', max),
        precipitationProbability: aggregate('precipitation_probability', max),
        rain: aggregate('rain', (v) => v.reduce((sum, n) => sum + n, 0), true),
        precipitation: aggregate('precipitation', (v) => v.reduce((sum, n) => sum + n, 0), true),
        wind: aggregate('wind_speed_10m', max),
        gusts: aggregate('wind_gusts_10m', max),
        weatherCode: worstCode,
        thunderstorm: codes.some((c) => c !== null && weatherPolicy.thunderstormCodes.includes(c))
          ? true
          : codes.includes(null)
            ? null
            : false,
      }
      const validCodes = [
        0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85,
        86, 95, 96, 99,
      ]
      const incomplete =
        fields.some((field) => values(field).includes(null)) ||
        codes.some((code) => code === null || !validCodes.includes(code)) ||
        (period === 'day' && hours.length < 23)
      const risks = assessWeather(metrics, period)
      return {
        available: true,
        date: target.date,
        timezone: payload.timezone,
        localTime: target.time || undefined,
        instant: period === 'hour' ? new Date(selected[0]!.t).toISOString() : undefined,
        period,
        adverse: risks.length > 0,
        incomplete,
        risks,
        metrics,
        summary: risks.length
          ? `${risks.join(' · ')}${incomplete ? ' · Dati parziali: verifica le condizioni' : ''}`
          : incomplete
            ? 'Dati meteo parziali: condizioni da verificare'
            : conditionLabel(metrics.weatherCode),
        source: 'Open-Meteo',
        fetchedAt: payload.fetchedAt,
      }
    },
  }
}
export const weatherService = createWeatherService()
export function weatherDecision(environment: Experience['environment'], forecast: WeatherResult) {
  if (!forecast.available) return { requiresConsent: false, message: forecast.reason }
  const requiresConsent = (environment === 'OUTDOOR' || environment === 'MIXED') && forecast.adverse
  const context = !environment
    ? 'Ambiente non indicato: specificalo nella scheda esperienza.'
    : environment === 'INDOOR'
      ? 'Attività al chiuso: meteo informativo.'
      : requiresConsent
        ? environment === 'MIXED'
          ? 'Potrebbe servire un piano al chiuso. Vuoi mantenerla?'
          : 'Condizioni potenzialmente sfavorevoli all’aperto. Vuoi mantenerla?'
        : ''
  return { requiresConsent, message: `${forecast.summary}${context ? ` · ${context}` : ''}` }
}
/** Consent refers to this forecast, place and visit window, never merely to an experience ID. */
export function weatherConsentKey(request: WeatherRequest, forecast: WeatherResult) {
  return JSON.stringify([
    request.latitude,
    request.longitude,
    request.date,
    request.localTime || '',
    request.instant || '',
    forecast.available ? forecast.fetchedAt : '',
    forecast.available ? forecast.risks : [],
  ])
}

/** Resolve a local wall clock in an IANA zone. DST gaps and repeated hours require clarification. */
export function visitInstant(date: string, time: string, timezone: string): string | null {
  const naive = Date.parse(`${date}T${time}:00Z`)
  if (!Number.isFinite(naive)) return null
  const matches: number[] = []
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const candidate = naive + offset * 60_000
    const parts = localParts(candidate, timezone)
    if (parts.date === date && parts.time === time) matches.push(candidate)
  }
  return matches.length === 1 ? new Date(matches[0]!).toISOString() : null
}
