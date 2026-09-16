/**
 * Stop every bot on a signal -- without dying on the ones that never started.
 *
 * MEASURED IN PRODUCTION (2026-09-16, the owner's alert):
 *
 *   Unhandled promise rejection: Bot is not running!
 *     at Telegraf.stop (/app/node_modules/telegraf/lib/telegraf.js:218:19)
 *     at gracefulShutdown (/app/dist/index.js:109865:15)
 *
 * telegraf.stop() throws SYNCHRONOUSLY when an instance has neither polling nor
 * a webhookServer (telegraf/lib/telegraf.js:217) -- that is, when a bot was
 * constructed but never came up: an invalid token, a 409 conflict, a crash
 * during launch. At shutdown that is a normal state, not a fault.
 *
 * The old shape cost three things at once, none of them visible in the message:
 *   1. the loop broke at the first such bot, so the REMAINING ones were never
 *      stopped and their polling connections hung until the container was
 *      killed;
 *   2. `process.exit(0)` after the loop never ran, so the exit was not clean;
 *   3. the rejection escaped unhandled, which pushes a routine restart to the
 *      owner's phone. A log level is a routing decision, not an adjective.
 *
 * The bot's name in the log is fixed here too: an unknown botInfo used to fall
 * back to `neuro_blogger_bot` -- a specific, real, OTHER bot. A diagnostic that
 * names an innocent party is worse than silence.
 */

/** The minimum this needs from Telegraf, so a test need not start a real bot. */
export interface StoppableBot {
  botInfo?: { username?: string }
  stop(reason?: string): void | Promise<void>
}

export interface StopOutcome {
  /** The name from botInfo, or an honest "unknown" -- never another bot's. */
  name: string
  /** `stopped`; `not-running` when it never came up; `failed` for anything else. */
  result: 'stopped' | 'not-running' | 'failed'
  error?: unknown
}

function isNotRunning(error: unknown): boolean {
  return error instanceof Error && /Bot is not running/i.test(error.message)
}

/**
 * Stop each bot INDEPENDENTLY and return a report.
 *
 * Throws nothing: shutdown is the last thing the process does, and failing here
 * means leaving the rest of the bots unstopped.
 */
export async function stopBotsQuietly(
  bots: Iterable<StoppableBot>
): Promise<StopOutcome[]> {
  const outcomes: StopOutcome[] = []
  for (const bot of bots) {
    const name = bot.botInfo?.username || '<name unknown: bot never came up>'
    try {
      await bot.stop()
      outcomes.push({ name, result: 'stopped' })
    } catch (error) {
      outcomes.push({
        name,
        result: isNotRunning(error) ? 'not-running' : 'failed',
        error,
      })
    }
  }
  return outcomes
}
