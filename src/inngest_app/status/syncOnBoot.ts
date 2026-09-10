/**
 * Sync the Inngest app registration on boot.
 *
 * Fact (verified live on 2026-09-09 against the Railway deployment): the
 * self-hosted Inngest server does NOT re-read the app after a deploy. Until
 * someone issues `PUT /api/inngest`, the server keeps the previous function
 * list (stale ids, missing new functions). The SDK's serve handler performs
 * the registration when it receives a PUT, so the app can trigger it itself
 * right after it starts listening.
 *
 * The request goes to the loopback interface. The SDK registers the URL it
 * is given via `serveHost` (env `INNGEST_SERVE_HOST`); this repo historically
 * names that value `INNGEST_SERVE_ORIGIN`, so `resolveInngestServeHost()`
 * accepts both and `serve()` receives it explicitly. Without it the SDK would
 * register the loopback Host header (`http://localhost:3000/...`).
 */

/** Public origin of this app as the Inngest server must call it. */
export function resolveInngestServeHost(
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  const v = (env.INNGEST_SERVE_HOST || env.INNGEST_SERVE_ORIGIN || '').trim()
  return v === '' ? undefined : v.replace(/\/+$/, '')
}

type FetchLike = (
  input: string,
  init?: { method?: string; signal?: AbortSignal }
) => Promise<{ status: number; text(): Promise<string> }>

export interface SyncOnBootOptions {
  port: string | number
  env?: NodeJS.ProcessEnv
  fetchImpl?: FetchLike
  /** Wait before the first attempt (server + functions must be mounted). */
  delayMs?: number
  attempts?: number
  /** Back-off between attempts. */
  retryDelayMs?: number
  timeoutMs?: number
  sleep?: (ms: number) => Promise<void>
  log?: (msg: string, meta?: Record<string, unknown>) => void
}

export interface SyncOnBootResult {
  skipped: boolean
  reason?: string
  ok: boolean
  status?: number
  attempts: number
  body?: string
}

export function shouldSyncOnBoot(env: NodeJS.ProcessEnv = process.env): {
  sync: boolean
  reason?: string
} {
  if (
    env.INNGEST_SYNC_ON_BOOT === '0' ||
    env.INNGEST_SYNC_ON_BOOT === 'false'
  ) {
    return { sync: false, reason: 'INNGEST_SYNC_ON_BOOT=0' }
  }
  if (env.NODE_ENV === 'test') return { sync: false, reason: 'NODE_ENV=test' }
  if (!resolveInngestServeHost(env)) {
    return {
      sync: false,
      reason: 'INNGEST_SERVE_HOST/INNGEST_SERVE_ORIGIN not set',
    }
  }
  return { sync: true }
}

const defaultSleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms))

export async function syncInngestAppOnBoot(
  opts: SyncOnBootOptions
): Promise<SyncOnBootResult> {
  const env = opts.env ?? process.env
  const log = opts.log ?? (() => undefined)
  const gate = shouldSyncOnBoot(env)
  if (!gate.sync) {
    log('[INNGEST SYNC] skipped', { reason: gate.reason })
    return { skipped: true, reason: gate.reason, ok: false, attempts: 0 }
  }
  const fetchImpl =
    opts.fetchImpl ?? ((globalThis as any).fetch as FetchLike | undefined)
  if (typeof fetchImpl !== 'function') {
    return { skipped: true, reason: 'no fetch', ok: false, attempts: 0 }
  }
  const sleep = opts.sleep ?? defaultSleep
  const attempts = opts.attempts ?? 3
  const delayMs = opts.delayMs ?? 5000
  const retryDelayMs = opts.retryDelayMs ?? 5000
  const timeoutMs = opts.timeoutMs ?? 15000
  const url = `http://127.0.0.1:${opts.port}/api/inngest`

  if (delayMs > 0) await sleep(delayMs)

  let last: SyncOnBootResult = { skipped: false, ok: false, attempts: 0 }
  for (let i = 1; i <= attempts; i++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetchImpl(url, {
        method: 'PUT',
        signal: controller.signal,
      })
      const body = (await res.text()).slice(0, 500)
      last = {
        skipped: false,
        ok: res.status < 300,
        status: res.status,
        attempts: i,
        body,
      }
      if (last.ok) {
        log('[INNGEST SYNC] app registration synced', {
          status: res.status,
          attempt: i,
          body,
        })
        return last
      }
      log('[INNGEST SYNC] sync attempt failed', {
        status: res.status,
        attempt: i,
        body,
      })
    } catch (error) {
      last = {
        skipped: false,
        ok: false,
        attempts: i,
        body: error instanceof Error ? error.message : String(error),
      }
      log('[INNGEST SYNC] sync attempt errored', {
        attempt: i,
        error: last.body,
      })
    } finally {
      clearTimeout(timer)
    }
    if (i < attempts) await sleep(retryDelayMs * i)
  }
  return last
}
