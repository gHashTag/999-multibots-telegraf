import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

/**
 * A hanging provider must not hang the health monitor.
 *
 * WHY. Each probe was a fetch with no timeout, inside Promise.allSettled. A
 * provider that accepts the connection but never answers — the exact unhealthy
 * state the monitor exists to detect — made the probe hang forever, so
 * allSettled never settled, providerStatuses was never updated, and
 * isProviderAvailable then reported every provider available (stale lastCheck
 * returns true). setInterval kept firing, so the hung fetches piled up.
 *
 * Each probe now carries AbortSignal.timeout(HEALTH_PROBE_TIMEOUT_MS). This
 * drives the timeout down to 50ms and mocks fetch to hang until its signal
 * aborts. With the deadline, checkAllProviders resolves and marks the providers
 * unreachable; without it (remove the signal) this test hangs and times out —
 * that is the other direction.
 */

const KEYS = {
  FAL_KEY: 'test',
  REPLICATE_API_TOKEN: 'test',
  GLM_API_KEY: 'test',
  ELEVENLABS_API_KEY: 'test',
  HEALTH_PROBE_TIMEOUT_MS: '50',
}
const saved: Record<string, string | undefined> = {}
const realFetch = global.fetch

beforeAll(() => {
  for (const [k, v] of Object.entries(KEYS)) {
    saved[k] = process.env[k]
    process.env[k] = v
  }
  // Hang until the request's own AbortSignal fires, then reject like a real
  // aborted fetch. No signal (the unfixed code) means this never rejects.
  global.fetch = vi.fn((_url: any, opts: any) => {
    return new Promise((_resolve, reject) => {
      const signal: AbortSignal | undefined = opts?.signal
      const abort = () =>
        reject(new DOMException('The operation was aborted', 'AbortError'))
      if (signal?.aborted) return abort()
      signal?.addEventListener('abort', abort)
    })
  }) as unknown as typeof fetch
})

afterAll(() => {
  for (const k of Object.keys(KEYS)) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
  global.fetch = realFetch
})

describe('provider health probes time out instead of hanging', () => {
  it('checkAllProviders resolves and marks hung providers unavailable', async () => {
    const { checkAllProviders } = await import(
      '@/services/provider-health-monitor'
    )
    const started = Date.now()
    const result = await checkAllProviders()
    const elapsed = Date.now() - started

    // Resolved at all (the point) and not by waiting minutes.
    expect(elapsed).toBeLessThan(5000)

    const real = Object.values(result).filter(s => s.name !== 'unknown')
    expect(real.length).toBeGreaterThan(0)
    expect(real.every(s => !s.available)).toBe(true)
  })
})
