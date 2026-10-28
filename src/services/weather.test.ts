import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  createWeatherService,
  localParts,
  visitInstant,
  weatherConsentKey,
  weatherDecision,
  weatherService,
  weatherUnavailable,
} from './weather'
import { weatherLimits, weatherPolicy } from './weatherPolicy'
import { WeatherNotice } from '../components/WeatherNotice'
import { aiExplorerService, emptyCriteria, matchExperiences } from './explorer'
import { arrivalInstants } from '../hooks/useTripWeatherSchedule'
import { routeFingerprint } from './routing'
import type { Experience, Trip } from '../domain'

// Synthetic forecasts are confined to tests, never injected into the application.
const now = Date.parse('2026-10-26T09:00:00Z')
const request = { latitude: 52.52, longitude: 13.405, date: '2026-10-27', localTime: '14:30' }
function payload(timezone = 'Europe/Berlin', overrides: Record<string, unknown> = {}) {
  const time = Array.from(
    { length: 24 * 3 },
    (_, i) => Date.parse('2026-10-25T23:00:00Z') / 1000 + i * 3600,
  )
  const hourly: Record<string, unknown> = { time }
  for (const [key, value] of Object.entries({
    temperature_2m: 16,
    precipitation_probability: 10,
    rain: 0,
    precipitation: 0,
    weather_code: 2,
    wind_speed_10m: 12,
    wind_gusts_10m: 20,
    ...overrides,
  }))
    hourly[key] = Array.isArray(value) ? value : time.map(() => value)
  return { timezone, hourly }
}
function setup(data = payload()) {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(data)))
  return { fetcher, service: createWeatherService(fetcher, () => now) }
}
const item: Experience = {
  id: 'test-weather-only',
  title: 'Fixture isolata',
  category: 'Nature',
  description: '',
  environment: 'OUTDOOR',
  status: 'TO_DO',
  priority: 'HIGH',
  address: 'Solo test',
  latitude: request.latitude,
  longitude: request.longitude,
  imagePath: null,
  imageUrl: null,
  createdAt: '',
  updatedAt: '',
}
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Open-Meteo service', () => {
  it('uses the actual request coordinates, timezone auto and units, without a key', async () => {
    const { fetcher, service } = setup()
    const forecast = await service.forecast(request)
    expect(forecast).toMatchObject({
      available: true,
      date: request.date,
      localTime: '14:30',
      timezone: 'Europe/Berlin',
      period: 'hour',
      adverse: false,
      incomplete: false,
      metrics: { temperature: 16 },
    })
    const url = new URL(String(fetcher.mock.calls[0]![0]))
    expect(url.searchParams.get('latitude')).toBe('52.52')
    expect(url.searchParams.get('longitude')).toBe('13.405')
    expect(url.searchParams.get('timezone')).toBe('auto')
    expect(url.searchParams.get('forecast_days')).toBe('16')
    expect(url.searchParams.has('apikey')).toBe(false)
  })
  it('keeps null values unknown, instead of assuming sunny weather', async () => {
    const { service } = setup(
      payload('Europe/Berlin', { weather_code: null, precipitation_probability: null, rain: null }),
    )
    const result = await service.forecast(request)
    expect(result).toMatchObject({
      available: true,
      incomplete: true,
      metrics: {
        weatherCode: null,
        precipitationProbability: null,
        rain: null,
        thunderstorm: null,
      },
    })
    expect(result.available && result.summary).toContain('parziali')
  })
  it('uses centralized thresholds and distinguishes indoor, outdoor, mixed and unknown', async () => {
    const { service } = setup(
      payload('Europe/Berlin', {
        precipitation_probability: weatherPolicy.precipitationProbability,
        precipitation: 2,
        rain: 2,
        wind_speed_10m: 40,
        weather_code: 95,
      }),
    )
    const result = await service.forecast(request)
    expect(result).toMatchObject({
      available: true,
      adverse: true,
      metrics: { thunderstorm: true },
    })
    expect(weatherDecision('OUTDOOR', result).requiresConsent).toBe(true)
    expect(weatherDecision('MIXED', result).message).toContain('piano al chiuso')
    expect(weatherDecision('INDOOR', result).requiresConsent).toBe(false)
    expect(weatherDecision(undefined, result).message).toContain('Ambiente non indicato')
    expect(weatherDecision(undefined, result).requiresConsent).toBe(false)
    const outdoor = renderToStaticMarkup(
      createElement(WeatherNotice, {
        item,
        date: request.date,
        time: request.localTime,
        forecast: result,
      }),
    )
    expect(outdoor).toContain('Mantieni comunque')
    expect(outdoor).toContain('Open-Meteo')
    const indoor = renderToStaticMarkup(
      createElement(WeatherNotice, {
        item: { ...item, environment: 'INDOOR' },
        date: request.date,
        forecast: result,
      }),
    )
    expect(indoor).not.toContain('Mantieni comunque')
  })
  it('aggregates the requested local day, not the current conditions', async () => {
    const { service } = setup(payload('Europe/Berlin', { rain: 0.5, precipitation: 0.5 }))
    expect(await service.forecast({ ...request, localTime: '' })).toMatchObject({
      available: true,
      period: 'day',
      metrics: { rain: 12, precipitation: 12 },
      adverse: true,
    })
  })
  it('returns far future and past unavailable without an HTTP request', async () => {
    const { service, fetcher } = setup()
    expect(await service.forecast({ ...request, date: '2027-01-10' })).toEqual({
      available: false,
      reason: 'Previsioni non ancora disponibili',
    })
    expect(await service.forecast({ ...request, date: '2026-10-10' })).toMatchObject({
      available: false,
    })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('checks the horizon in the destination timezone', async () => {
    const { service } = setup()
    expect(await service.forecast({ ...request, date: '2026-11-11' })).toEqual({
      available: false,
      reason: 'Previsioni non ancora disponibili',
    })
  })
  it('reports network, HTTP and malformed responses without throwing or fabricating data', async () => {
    for (const response of [null, new Response('{}'), new Response('bad', { status: 429 })]) {
      const fetcher = response
        ? vi.fn().mockResolvedValue(response)
        : vi.fn().mockRejectedValue(new Error('offline'))
      const service = createWeatherService(fetcher, () => now)
      expect(await service.forecast(request)).toEqual({
        available: false,
        reason: weatherUnavailable,
      })
    }
  })
  it('deduplicates the location payload across times/days and expires its cache', async () => {
    let clock = now
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify(payload())))
    const service = createWeatherService(fetcher, () => clock)
    await Promise.all([
      service.forecast(request),
      service.forecast({ ...request, localTime: '18:00' }),
      service.forecast({ ...request, date: '2026-10-28' }),
    ])
    expect(fetcher).toHaveBeenCalledTimes(1)
    clock += weatherLimits.cacheMs + 1
    await service.forecast(request)
    expect(fetcher).toHaveBeenCalledTimes(2)
    await service.forecast({ ...request, longitude: 13.406 })
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
  it('reuses an authenticated server forecast transferred to Trips until its TTL expires', async () => {
    const fromServer = await setup().service.forecast(request)
    const { service, fetcher } = setup()
    service.seed?.(request, fromServer)
    expect(await service.forecast(request)).toBe(fromServer)
    expect(fetcher).not.toHaveBeenCalled()
    await service.forecast({ ...request, localTime: '18:00' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('does not let one aborted subscriber cancel another', async () => {
    const { service, fetcher } = setup()
    const controller = new AbortController()
    const aborted = service.forecast(request, controller.signal)
    const other = service.forecast(request)
    controller.abort()
    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' })
    expect((await other).available).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('limits uncached requests, validates coordinates and hours', async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify(payload())))
    const service = createWeatherService(fetcher, () => now)
    for (let i = 0; i < 21; i++) await service.forecast({ ...request, longitude: i })
    expect(fetcher).toHaveBeenCalledTimes(weatherLimits.requestsPerMinute)
    expect(await service.forecast({ ...request, longitude: 100 })).toEqual({
      available: false,
      reason: weatherUnavailable,
    })
    expect((await service.forecast({ ...request, latitude: NaN })).available).toBe(false)
    expect((await service.forecast({ ...request, localTime: '25:70' })).available).toBe(false)
  })
  it('resets its conservative daily request budget on the next UTC day', async () => {
    const original = weatherLimits.requestsPerDay
    weatherLimits.requestsPerDay = 1
    try {
      let clock = now
      const fetcher = vi
        .fn()
        .mockImplementation(async () => new Response(JSON.stringify(payload())))
      const service = createWeatherService(fetcher, () => clock)
      await service.forecast(request)
      clock += 61_000
      expect(await service.forecast({ ...request, longitude: 14 })).toEqual({
        available: false,
        reason: weatherUnavailable,
      })
      expect(fetcher).toHaveBeenCalledTimes(1)
      clock += 86_400_000
      expect((await service.forecast({ ...request, longitude: 14 })).available).toBe(true)
      expect(fetcher).toHaveBeenCalledTimes(2)
    } finally {
      weatherLimits.requestsPerDay = original
    }
  })
  it('converts absolute arrivals into the destination day/time, including midnight and DST', async () => {
    const { service } = setup(payload('Asia/Tokyo'))
    expect(await service.forecast({ ...request, instant: '2026-10-26T16:20:00Z' })).toMatchObject({
      available: true,
      date: '2026-10-27',
      localTime: '01:20',
      timezone: 'Asia/Tokyo',
    })
    expect(localParts(Date.parse('2026-10-25T01:30:00Z'), 'Europe/Rome').time).toBe('02:30')
    expect(visitInstant('2026-10-27', '14:30', 'Europe/Rome')).toBe('2026-10-27T13:30:00.000Z')
    expect(visitInstant('2026-10-25', '02:30', 'Europe/Rome')).toBeNull() // repeated local hour
    expect(visitInstant('2027-03-28', '02:30', 'Europe/Rome')).toBeNull() // missing local hour
  })
})

describe('Explorer and Trips weather handoff', () => {
  it('preserves every hard filter and keeps risky outdoor options visible', async () => {
    const forecast = await setup(payload('Europe/Berlin', { weather_code: 95 })).service.forecast(
      request,
    )
    vi.spyOn(weatherService, 'forecast').mockResolvedValue(forecast)
    const indoor = { ...item, id: 'indoor', environment: 'INDOOR' as const }
    const mixed = { ...item, id: 'mixed', environment: 'MIXED' as const }
    const criteria = { ...emptyCriteria, date: request.date, time: request.localTime }
    const found = await aiExplorerService.find(criteria, [item, indoor, mixed], [], 'test')
    expect(found.experiences.map((i) => i.id)).toEqual(['indoor', item.id, 'mixed'])
    expect(found.weatherById?.[item.id]).toBe(forecast)
    expect(
      matchExperiences({ ...criteria, environment: 'INDOOR' }, [item, indoor, mixed], [], 'test')
        .experiences,
    ).toEqual([indoor])
    const outdoorOnly = await aiExplorerService.find(
      { ...criteria, environment: 'OUTDOOR' },
      [item, indoor],
      [],
      'test',
    )
    expect(outdoorOnly.experiences).toEqual([item])
    expect(
      weatherDecision(item.environment, outdoorOnly.weatherById![item.id]!).requiresConsent,
    ).toBe(true)
  })
  it('shares the same cached forecast and explicit consent, invalidating on changed place/time', async () => {
    const { service, fetcher } = setup(payload('Europe/Berlin', { weather_code: 95 }))
    const fromExplorer = await service.forecast(request)
    const consents = { [item.id]: weatherConsentKey(request, fromExplorer) }
    const fromTrips = await service.forecast({ ...request })
    expect(fromTrips).toEqual(fromExplorer)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(weatherConsentKey(request, fromTrips)).toBe(consents[item.id])
    expect(weatherConsentKey({ ...request, localTime: '18:00' }, fromTrips)).not.toBe(
      consents[item.id],
    )
    expect(weatherConsentKey({ ...request, latitude: 52.6 }, fromTrips)).not.toBe(consents[item.id])
  })
  it('includes route legs and stop duration in absolute arrivals; invalid route has no fake ETA', () => {
    const second = { ...item, id: 'second', longitude: 13.5 }
    const items = [item, second]
    const trip: Trip = {
      id: 'test',
      name: 'Test',
      date: request.date,
      origin: null,
      waypoints: items.map((i) => ({ experienceId: i.id, stopMinutes: 30 })),
      routeSummary: null,
      createdAt: '',
      updatedAt: '',
    }
    trip.routeSummary = {
      provider: 'geoapify',
      mode: 'drive',
      distanceMeters: 1000,
      durationSeconds: 600,
      geometry: {
        type: 'LineString',
        coordinates: [
          [13.405, 52.52],
          [13.5, 52.52],
        ],
      },
      legs: [{ distanceMeters: 1000, durationSeconds: 600 }],
      fingerprint: routeFingerprint(trip, items),
      calculatedAt: '2026-10-26T09:00:00Z',
    }
    expect(arrivalInstants(trip, items, '2026-10-27T22:30:00Z')).toEqual({
      [item.id]: '2026-10-27T22:30:00.000Z',
      second: '2026-10-27T23:10:00.000Z',
    })
    expect(
      arrivalInstants(trip, [item, { ...second, longitude: 14 }], '2026-10-27T22:30:00Z'),
    ).toEqual({})
  })
  it('does not retrieve forecasts when no visit date is given', async () => {
    const spy = vi.spyOn(weatherService, 'forecast')
    const result = await aiExplorerService.find(emptyCriteria, [item], [], 'test')
    expect(spy).not.toHaveBeenCalled()
    expect(result.warnings.join(' ')).toContain('Scegli una data')
  })
})
