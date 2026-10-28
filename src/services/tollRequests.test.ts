import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTollRequestPool } from './tollRequests'
import { recentTollQuote, tollFeedback } from './tollFeedback'
import { tripEstimate, defaultBudget } from '../../supabase/functions/_shared/atlas/costs'
import { routeReferenceKey } from '../../supabase/functions/_shared/atlas/tollComparison'
import type { RouteSummary, TollQuote } from '../domain'
afterEach(() => vi.useRealTimers())
const route: RouteSummary = {
  provider: 'geoapify',
  mode: 'drive',
  distanceMeters: 100000,
  durationSeconds: 3600,
  geometry: {
    type: 'LineString',
    coordinates: [
      [9, 45],
      [9.1, 45.1],
    ],
  },
  legs: [{ distanceMeters: 100000, durationSeconds: 3600 }],
  fingerprint: 'test-only',
  calculatedAt: new Date().toISOString(),
}
const quote = (comparison: 'matched' | 'alternative' = 'matched'): TollQuote => ({
  reference: routeReferenceKey(route),
  comparison,
  hereDistanceMeters: 101000,
  calculatedAt: new Date().toISOString(),
  tolls: {
    complete: true,
    noTolls: false,
    notes: [],
    groups: [
      {
        id: 'ticket',
        name: 'Fixture only',
        fares: [
          {
            id: 'cash',
            name: 'Cash',
            euros: 7.2,
            paymentMethods: ['cash'],
            conditional: false,
            details: '',
          },
          {
            id: 'card',
            name: 'Card',
            euros: 7,
            paymentMethods: ['bankCard'],
            conditional: false,
            details: '',
          },
        ],
      },
    ],
  },
})
describe('bounded and deduplicated toll requests', () => {
  it('coalesces concurrent requests and releases the key on success', async () => {
    const pool = createTollRequestPool(),
      run = vi.fn().mockResolvedValue(quote())
    const [a, b] = await Promise.all([pool('same', run), pool('same', run)])
    expect(a).toEqual(b)
    expect(run).toHaveBeenCalledTimes(1)
    await pool('same', run)
    expect(run).toHaveBeenCalledTimes(2)
  })
  it('does not coalesce different users/maps/routes', async () => {
    const pool = createTollRequestPool(),
      run = vi.fn().mockResolvedValue(quote())
    await Promise.all([
      pool('user1:map:route', run),
      pool('user2:map:route', run),
      pool('user1:othermap:route', run),
    ])
    expect(run).toHaveBeenCalledTimes(3)
  })
  it('rejects an unresponsive transport at 40s, aborts it and allows a retry', async () => {
    vi.useFakeTimers()
    const pool = createTollRequestPool(),
      run = vi.fn((_signal: AbortSignal) => new Promise<never>(() => {}))
    const pending = pool('route', run)
    const check = expect(pending).rejects.toMatchObject({
      name: 'TimeoutError',
      message: expect.stringContaining('40 secondi'),
    })
    await vi.advanceTimersByTimeAsync(40000)
    await check
    expect(run.mock.calls[0]![0].aborted).toBe(true)
    const next = vi.fn().mockResolvedValue(quote())
    await pool('route', next)
    expect(next).toHaveBeenCalledTimes(1)
  })
  it('releases an errored request and returns a useful retry result', async () => {
    const pool = createTollRequestPool(),
      run = vi
        .fn()
        .mockRejectedValueOnce(new Error('HERE non disponibile'))
        .mockResolvedValueOnce(quote())
    await expect(pool('route', run)).rejects.toThrow('HERE non disponibile')
    await expect(pool('route', run)).resolves.toMatchObject({ comparison: 'matched' })
  })
  it('cancels one subscriber without cancelling another', async () => {
    const pool = createTollRequestPool(),
      controller = new AbortController()
    let finish: (q: TollQuote) => void = () => {}
    const run = vi.fn(
      (_signal: AbortSignal) =>
        new Promise<TollQuote>((resolve) => {
          finish = resolve
        }),
    )
    const one = pool('route', run, controller.signal),
      two = pool('route', run)
    const check = expect(one).rejects.toMatchObject({ name: 'AbortError' })
    await Promise.resolve()
    controller.abort()
    await check
    expect(run.mock.calls[0]![0].aborted).toBe(false)
    finish(quote())
    await expect(two).resolves.toMatchObject({ comparison: 'matched' })
  })
  it('does not start a request for an already cancelled subscriber', async () => {
    const pool = createTollRequestPool(),
      controller = new AbortController(),
      run = vi.fn()
    controller.abort()
    await expect(pool('route', run, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(run).not.toHaveBeenCalled()
  })
  it('aborts when its last subscriber leaves and tolerates a late response', async () => {
    const pool = createTollRequestPool(),
      controller = new AbortController()
    let finish: (value: string) => void = () => {}
    const run = vi.fn(
      (_signal: AbortSignal) =>
        new Promise<string>((resolve) => {
          finish = resolve
        }),
    )
    const pending = pool('route', run, controller.signal),
      check = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await Promise.resolve()
    controller.abort()
    await check
    expect(run.mock.calls[0]![0].aborted).toBe(true)
    finish('late result')
    await Promise.resolve()
    await expect(pool('route', async () => 'new request')).resolves.toBe('new request')
  })
})
describe('explicit result feedback without altering Geoapify totals', () => {
  it('shows alternative fares separately and leaves them out of the trip total', () => {
    const q = quote('alternative'),
      before = tripEstimate([], route, defaultBudget(), null),
      after = tripEstimate([], route, defaultBudget(), q),
      feedback = tollFeedback(q)!
    expect(feedback.label).toBe('Pedaggio indicativo su percorso alternativo')
    expect(feedback.amount).toContain('7,20')
    expect(feedback.amount).not.toContain('14,20')
    expect(feedback.message).toContain('Non è inclusa')
    expect(after.known).toBe(before.known)
    expect(after.tolls.euros).toBeNull()
    expect(after.total).toBeNull()
  })
  it('reports standard results, zero fares and unavailable amounts distinctly', () => {
    expect(tollFeedback(quote())!.kind).toBe('available')
    const free = quote()
    free.tolls = { complete: true, noTolls: true, groups: [], notes: [] }
    expect(tollFeedback(free)!.amount).toContain('0,00')
    const missing = quote()
    missing.tolls = { complete: false, noTolls: false, groups: [], notes: [] }
    expect(tollFeedback(missing)!.amount).toBeNull()
    expect(tollFeedback(missing)!.kind).toBe('unavailable')
    expect(tollFeedback({ ...missing, comparison: 'alternative' })!.message).toContain(
      'nessun importo',
    )
  })
  it('labels partial alternative costs as partial and never substitutes missing amounts with zero', () => {
    const q = quote('alternative')
    q.tolls.complete = false
    expect(tollFeedback(q)!.amount).toContain('parziale')
    q.tolls.groups[0]!.fares.forEach((f) => {
      f.euros = null
    })
    expect(tollFeedback(q)!.amount).toBeNull()
  })
  it('shows real conditional prices as separate options, without inventing an eligible total', () => {
    const q = quote('alternative')
    q.tolls.groups[0]!.fares.forEach((f) => {
      f.conditional = true
      f.details = 'Pass richiesto'
    })
    const view = tollFeedback(q)!
    expect(view.amount).toBeNull()
    expect(view.tariffs).toHaveLength(2)
    expect(view.tariffs[0]!.amount).toContain('7,20')
    expect(view.tariffs[0]!.conditions).toBe('Pass richiesto')
    expect(tripEstimate([], route, defaultBudget(), q).tolls.known).toBe(0)
  })
  it('makes a single transponder fare visible with its condition, always outside the total', () => {
    const q = quote('alternative')
    q.tolls.groups[0]!.fares = [
      {
        id: 'transponder',
        name: 'Fixture',
        euros: 11.4,
        paymentMethods: ['transponder'],
        conditional: true,
        details: 'Transponder richiesto',
      },
    ]
    const view = tollFeedback(q)!
    expect(view.conditionalTariff?.amount).toContain('11,40')
    expect(view.conditionalTariff?.conditions).toBe('Transponder richiesto')
    expect(view.amount).toBeNull()
    expect(tripEstimate([], route, defaultBudget(), q).tolls.euros).toBeNull()
  })
  it('reuses only valid quotes less than ten minutes old', () => {
    const q = quote(),
      now = Date.parse(q.calculatedAt)
    expect(recentTollQuote(q, now)).toBe(true)
    expect(recentTollQuote(q, now + 600000)).toBe(false)
    expect(recentTollQuote({ ...q, calculatedAt: 'invalid' }, now)).toBe(false)
    expect(recentTollQuote(q, now - 1000)).toBe(false)
  })
})
