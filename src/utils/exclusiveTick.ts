import { logger } from '@/utils/logger'

/**
 * Wrap a timer callback so a tick is SKIPPED while the previous one is still
 * running.
 *
 * setInterval does not wait. A callback that takes longer than the interval is
 * simply started again alongside itself, and for anything that reads a batch,
 * acts on it, and only then marks it done, the second run selects rows the
 * first is still working on.
 *
 * The notification queue is exactly that shape: it selects up to 50 unsent
 * messages, sends them one at a time with a pause between, and marks each as
 * sent AFTER the send returns. Fifty sends plus the pauses do not fit in the
 * sixty-second interval whenever Telegram is slow or rate-limiting, and the
 * overlapping run re-sends whatever is not yet marked -- the user gets the
 * message twice.
 *
 * Skipping is the safe direction: a skipped tick sends nothing extra and the
 * work is picked up by the next one. The alternative -- queuing the skipped
 * ticks -- would preserve the overlap it is meant to remove.
 *
 * Also contains the rejection. An async timer callback that throws produces an
 * unhandled rejection; the process survives it (setupGlobalErrorHandlers logs
 * rather than exits), but without the finally the in-flight flag would stay
 * true and the timer would never run again -- a guard that turns one failure
 * into permanent silence.
 */
export function exclusiveTick(
  name: string,
  run: () => Promise<void>
): () => Promise<void> {
  let inFlight = false
  return async () => {
    if (inFlight) {
      logger.warn(`[${name}] предыдущий проход ещё идёт — тик пропущен`)
      return
    }
    inFlight = true
    try {
      await run()
    } catch (error) {
      logger.error(`[${name}] проход завершился ошибкой`, {
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      inFlight = false
    }
  }
}
