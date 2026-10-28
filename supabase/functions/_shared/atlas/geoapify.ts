import { config } from './config.ts'
export const missingGeoapify =
  'Geoapify non configurato: aggiungi VITE_GEOAPIFY_API_KEY in .env.local e riavvia ATLAS.'
export async function geoapifyRequest(
  path: string,
  parameters: Record<string, string>,
  signal?: AbortSignal,
): Promise<unknown> {
  if (!config.geoapifyKey) throw new Error(missingGeoapify)
  const controller = new AbortController()
  let timedOut = false
  const abort = () => controller.abort()
  if (signal?.aborted) abort()
  else signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, 20000)
  try {
    const params = new URLSearchParams({ ...parameters, apiKey: config.geoapifyKey })
    const response = await fetch(`https://api.geoapify.com/v1/${path}?${params}`, {
      signal: controller.signal,
      referrerPolicy: 'strict-origin-when-cross-origin',
    })
    if (!response.ok) {
      const message =
        response.status === 401 || response.status === 403
          ? 'Geoapify: chiave non valida o dominio/referrer non autorizzato.'
          : response.status === 429
            ? 'Quota Geoapify raggiunta. Attendi prima di riprovare.'
            : response.status === 400
              ? 'Geoapify non può elaborare questi luoghi o collegarli in auto. Controlla le posizioni.'
              : 'Geoapify temporaneamente non disponibile. Riprova più tardi.'
      throw new GeoapifyError(message)
    }
    try {
      return await response.json()
    } catch {
      throw new GeoapifyError('Risposta Geoapify non valida. Riprova.')
    }
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Richiesta annullata', 'AbortError')
    if (timedOut) throw new Error('Geoapify non risponde in tempo. Riprova.')
    if (error instanceof GeoapifyError) throw error
    throw new Error(
      timedOut
        ? 'Geoapify non risponde in tempo. Riprova.'
        : 'Connessione a Geoapify non disponibile. Controlla rete e autorizzazioni del dominio.',
    )
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}
class GeoapifyError extends Error {}
export function validCoordinates(latitude: unknown, longitude: unknown): boolean {
  return (
    typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    Math.abs(latitude) <= 85.051129 &&
    typeof longitude === 'number' &&
    Number.isFinite(longitude) &&
    Math.abs(longitude) <= 180
  )
}
