import type { Server } from 'node:http'

/**
 * A redeploy must not cut a conversation in half.
 *
 * 08.09.2026: the render container got SIGTERM at 17:25:27Z with agent
 * streams in flight (a customer's request had a tool running for 31 s); the
 * process died at once and the person saw "Network unavailable: TypeError:
 * Load failed". Node does nothing special on SIGTERM: it exits. This installs
 * the usual contract instead -- stop accepting new connections, let the
 * requests already in flight finish (bounded), then exit -- so that a deploy
 * during a stream ends the stream on its own terms, not the deploy's.
 */
export interface ShutdownOptions {
  drainMs?: number
  log?: (line: string) => void
  exit?: (code: number) => void
  now?: () => number
}

export function installGracefulShutdown(
  server: Server,
  options: ShutdownOptions = {}
): { inFlight: () => number; shutdown: (signal: string) => void } {
  const drainMs = options.drainMs ?? 25_000
  const log = options.log ?? ((line: string) => console.log(line))
  const exit = options.exit ?? ((code: number) => process.exit(code))
  const now = options.now ?? (() => Date.now())

  let inFlight = 0
  let shuttingDown = false
  server.on('request', (_req, res) => {
    inFlight += 1
    res.once('close', () => {
      inFlight -= 1
    })
  })

  const shutdown = (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    const startedAt = now()
    log(
      `[shutdown] ${signal}: ${inFlight} request(s) in flight, draining up to ${Math.round(drainMs / 1000)}s`
    )
    // No new connections; idle keep-alive sockets go now, busy ones finish.
    server.close(() => log('[shutdown] listener closed'))
    ;(
      server as Server & { closeIdleConnections?: () => void }
    ).closeIdleConnections?.()
    const tick = setInterval(() => {
      const waited = now() - startedAt
      if (inFlight <= 0 || waited >= drainMs) {
        clearInterval(tick)
        log(
          inFlight <= 0
            ? `[shutdown] drained in ${waited}ms, exiting`
            : `[shutdown] ${inFlight} request(s) still open after ${waited}ms, exiting anyway`
        )
        exit(0)
      }
    }, 250)
  }

  process.once('SIGTERM', () => shutdown('SIGTERM'))
  process.once('SIGINT', () => shutdown('SIGINT'))
  return { inFlight: () => inFlight, shutdown }
}
