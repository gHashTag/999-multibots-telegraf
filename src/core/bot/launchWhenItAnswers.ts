/**
 * A BOT THAT DID NOT ANSWER AT BOOT IS RETRIED, NOT DROPPED.
 *
 * The bot service used to ask each bot `getMe` once, in the startup loop, and
 * skip any bot that failed for the life of the process -- with no retry and a
 * log line telling the operator to check BotFather. Two failures that pass by
 * themselves end exactly that way since bots can live on our own Bot API
 * server (services/telegramApi.ts):
 *
 *   - A bot moved back to the cloud is refused by the cloud for 10 minutes
 *     after its logOut. A redeploy inside that window skipped it until the
 *     NEXT redeploy.
 *   - A bot on our own server, when the bot service boots while that server is
 *     restarting (or refusing it, before the move script lists it), was
 *     skipped until the next redeploy even after the server came back.
 *
 * So a bot that does not answer is asked again, in the background, on the
 * schedule below; the moment it answers, it is set up and launched like the
 * others. A bot listed for our server is asked forever (that server coming
 * back is the normal case), a cloud bot for long enough to cover the 10
 * minutes after a logOut -- a token that is really dead stops being asked
 * after that, with one line saying so.
 *
 * Listed bots are never checked inline in the startup loop either: a request
 * to a server that hangs rather than refuses would hold every bot after it
 * for Telegraf's 500-second call timeout.
 */

/** Delays before each retry, in ms. The last one repeats when `forever`. */
export function retryDelaysFor(listed: boolean): {
  delays: number[]
  forever: boolean
} {
  return listed
    ? // Quick pickup after bot-api-move.cjs --apply lists the bot.
      { delays: [15_000, 30_000, 60_000], forever: true }
    : // 30 s + 1 + 2 + 4 + 5 + 5 min: past the 10 minutes after a logOut.
      {
        delays: [30_000, 60_000, 120_000, 240_000, 300_000, 300_000],
        forever: false,
      }
}

/** How long one check of a bot may take before it counts as "no answer". */
export const CHECK_TIMEOUT_MS = 15_000

const sleepUnref = (ms: number) =>
  new Promise<void>(resolve => {
    const t = setTimeout(resolve, ms)
    // A retry must never keep a stopping process alive.
    t.unref?.()
  })

/**
 * Calls `attempt` until it answers true. With `immediately`, the first call
 * is made at once; otherwise the first delay comes first. Returns whether it
 * ever answered.
 */
export async function retryUntilAnswered({
  attempt,
  delays,
  forever,
  immediately = false,
  sleep = sleepUnref,
}: {
  attempt: () => Promise<boolean>
  delays: number[]
  forever: boolean
  immediately?: boolean
  sleep?: (ms: number) => Promise<void>
}): Promise<boolean> {
  if (immediately && (await attempt())) return true
  for (let i = 0; forever || i < delays.length; i++) {
    await sleep(delays[Math.min(i, delays.length - 1)])
    if (await attempt()) return true
  }
  return false
}

/** Rejects after `ms` -- for a check that must not wait on a hung server. */
export function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`no answer within ${Math.round(ms / 1000)} s`)),
      ms
    )
    timer.unref?.()
  })
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer))
}
