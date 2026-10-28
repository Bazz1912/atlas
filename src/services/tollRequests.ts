/** Coalesce identical toll requests; each subscriber can cancel independently.
 * The deadline rejects even if a transport ignores AbortSignal. No credentials or logging. */
export function createTollRequestPool(timeoutMs = 40_000) {
  interface Entry<T> {
    controller: AbortController
    promise: Promise<T>
    users: number
    settled: boolean
  }
  const active = new Map<string, Entry<unknown>>()
  return function request<T>(
    key: string,
    run: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    if (signal?.aborted)
      return Promise.reject(new DOMException('Richiesta annullata', 'AbortError'))
    let entry = active.get(key) as Entry<T> | undefined
    if (!entry || entry.controller.signal.aborted) {
      const controller = new AbortController()
      const next: Entry<T> = { controller, promise: null!, users: 0, settled: false }
      let timer: ReturnType<typeof setTimeout>
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new DOMException(
              'La stima dei pedaggi ha superato 40 secondi. Riprova tra poco.',
              'TimeoutError',
            ),
          )
          controller.abort()
        }, timeoutMs)
      })
      next.promise = Promise.race([
        Promise.resolve().then(() => run(controller.signal)),
        deadline,
      ]).finally(() => {
        clearTimeout(timer)
        next.settled = true
        if (active.get(key) === next) active.delete(key)
      })
      active.set(key, next)
      entry = next
    }
    const current = entry
    current.users++
    return new Promise<T>((resolve, reject) => {
      let done = false
      const finish = (action: () => void) => {
        if (done) return
        done = true
        signal?.removeEventListener('abort', abort)
        current.users--
        if (!current.users && !current.settled) {
          current.controller.abort()
          if (active.get(key) === current) active.delete(key)
        }
        action()
      }
      const abort = () =>
        finish(() => reject(new DOMException('Richiesta annullata', 'AbortError')))
      signal?.addEventListener('abort', abort, { once: true })
      current.promise.then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(error)),
      )
      if (signal?.aborted) abort()
    })
  }
}
