import { useEffect, useState } from 'react'
import {
  Cloud,
  CloudOff,
  CloudSun,
  CloudLightning,
  CloudRain,
  Snowflake,
  Sun,
  Wind,
} from 'lucide-react'
import type { Experience } from '../domain'
import type { WeatherRequest, WeatherResult } from '../services/contracts'
import {
  weatherConsentKey,
  weatherDecision,
  weatherService,
  weatherUnavailable,
} from '../services/weather'
import { weatherLimits, weatherPolicy } from '../services/weatherPolicy'

export function WeatherNotice({
  item,
  date,
  time,
  instant,
  forecast: provided,
  acceptedKey,
  onAccept,
  onAlternative,
}: {
  item: Experience
  date: string
  time?: string
  instant?: string
  forecast?: WeatherResult
  acceptedKey?: string
  onAccept?: (key: string) => void
  onAlternative?: () => void
}) {
  const request: WeatherRequest = {
    latitude: item.latitude,
    longitude: item.longitude,
    date,
    localTime: time,
    instant,
  }
  const requestKey = JSON.stringify(request)
  const [state, setState] = useState<{ key: string; result: WeatherResult } | null>(null)
  const [accepted, setAccepted] = useState('')
  useEffect(() => {
    if (provided || !date) return
    const abort = new AbortController()
    const load = () => {
      void weatherService
        .forecast(request, abort.signal)
        .then((result) => {
          if (!abort.signal.aborted) setState({ key: requestKey, result })
        })
        .catch(() => {
          if (!abort.signal.aborted)
            setState({ key: requestKey, result: { available: false, reason: weatherUnavailable } })
        })
    }
    load()
    const refresh = setInterval(load, weatherLimits.cacheMs)
    return () => {
      abort.abort()
      clearInterval(refresh)
    }
  }, [requestKey, provided, date])
  const forecast = provided || (state?.key === requestKey ? state.result : null)
  if (!date) return <p className="field-help">Scegli una data per vedere il meteo.</p>
  if (!forecast)
    return (
      <p className="field-help" role="status">
        Verifica meteo…
      </p>
    )
  const decision = weatherDecision(item.environment, forecast)
  const consent = weatherConsentKey(request, forecast)
  const isAccepted = accepted === consent || acceptedKey === consent
  const m = forecast.available ? forecast.metrics : null
  const Icon =
    !m || m.weatherCode === null
      ? CloudOff
      : m.thunderstorm
        ? CloudLightning
        : m?.weatherCode != null && weatherPolicy.frozenPrecipitationCodes.includes(m.weatherCode)
          ? Snowflake
          : (m?.precipitationProbability ?? 0) >= 50
            ? CloudRain
            : (m?.wind ?? 0) >= weatherPolicy.windKmh
              ? Wind
              : m?.weatherCode === 0
                ? Sun
                : m?.weatherCode === 1 || m?.weatherCode === 2
                  ? CloudSun
                  : Cloud
  const number = (value: number | null | undefined, unit: string) =>
    value == null ? 'Non disponibile' : `${Number(value.toFixed(1)).toLocaleString('it')}${unit}`
  return (
    <div className={`weather-note ${decision.requiresConsent ? 'weather-caution' : ''}`}>
      <Icon size={17} aria-hidden="true" />
      <div>
        {forecast.available && m && (
          <strong className="weather-heading">
            {forecast.period === 'hour'
              ? number(m.temperature, '°C')
              : `${number(m.temperatureMin, '°')} / ${number(m.temperatureMax, '°C')}`}
            <span>
              {forecast.period === 'hour'
                ? `${forecast.date} · ${instant ? 'arrivo stimato' : 'visita'} ${forecast.localTime}`
                : `${forecast.date} · giornata`}{' '}
              · {forecast.timezone}
            </span>
          </strong>
        )}
        <span>{decision.message}</span>
        {decision.requiresConsent && !isAccepted && (
          <div className="weather-actions">
            <button
              className="text-button"
              onClick={() => {
                setAccepted(consent)
                onAccept?.(consent)
              }}
            >
              Mantieni comunque
            </button>
            {onAlternative && (
              <button className="text-button" onClick={onAlternative}>
                Cerca al chiuso
              </button>
            )}
          </div>
        )}
        {isAccepted && decision.requiresConsent && <small>Tappa mantenuta per tua scelta.</small>}
        {forecast.available && m && (
          <details className="weather-details">
            <summary>Dettagli meteo</summary>
            <dl>
              <div>
                <dt>Probabilità precipitazioni{forecast.period === 'day' ? ' · massima' : ''}</dt>
                <dd>{number(m.precipitationProbability, '%')}</dd>
              </div>
              <div>
                <dt>Pioggia prevista{forecast.period === 'day' ? ' · totale' : ' · ora'}</dt>
                <dd>{number(m.rain, ' mm')}</dd>
              </div>
              <div>
                <dt>Precipitazioni totali (anche neve)</dt>
                <dd>{number(m.precipitation, ' mm')}</dd>
              </div>
              <div>
                <dt>Vento{forecast.period === 'day' ? ' · massimo' : ''} / raffiche</dt>
                <dd>
                  {number(m.wind, ' km/h')} / {number(m.gusts, ' km/h')}
                </dd>
              </div>
              <div>
                <dt>Codice WMO / temporali</dt>
                <dd>
                  {m.weatherCode ?? 'ND'} /{' '}
                  {m.thunderstorm === null ? 'ND' : m.thunderstorm ? 'possibili' : 'non indicati'}
                </dd>
              </div>
            </dl>
            {forecast.instant && (
              <small>
                Ora del modello:{' '}
                {new Date(forecast.instant).toLocaleTimeString('it', {
                  timeZone: forecast.timezone,
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                , {forecast.timezone}. Risoluzione oraria.
              </small>
            )}
            <small>
              Previsione probabilistica, non una garanzia. Aggiornata{' '}
              {new Date(forecast.fetchedAt).toLocaleString('it')}.
            </small>
            <small>
              Soglie avviso: probabilità ≥ {weatherPolicy.precipitationProbability}%, precipitazioni
              ≥{' '}
              {forecast.period === 'day'
                ? weatherPolicy.dailyPrecipitationMm
                : weatherPolicy.hourlyPrecipitationMm}{' '}
              mm/{forecast.period === 'day' ? 'giorno' : 'ora'}, vento ≥ {weatherPolicy.windKmh}{' '}
              km/h, raffiche ≥ {weatherPolicy.gustsKmh} km/h; temporali o neve/ghiaccio.
            </small>
          </details>
        )}
        {forecast.available && (
          <a
            className="weather-attribution"
            href="https://open-meteo.com/"
            target="_blank"
            rel="noreferrer"
          >
            Open-Meteo · CC BY 4.0
          </a>
        )}
      </div>
    </div>
  )
}
