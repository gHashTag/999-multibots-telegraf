/**
 * Which bots sign the initData that per-request verification accepts.
 *
 * The Mini App sends initData on every API call. The sign-in journal notes
 * (session-routes.ts signedByBot) see only /api/auth/telegram and pair/start,
 * so a launch-bot allowlist built from them alone could lock out a bot whose
 * users only ever make per-request calls. The guard's initData branch and
 * verifiedTelegramId (auth.ts) count here instead.
 *
 * In memory, one aggregate log line at most every ten minutes, flushed by the
 * next verification after the window rather than by a timer. Keyed by numeric
 * bot id only: for a token stored without its colon the "id" is the whole
 * secret, so anything that is not a plain run of digits counts as `unknown`.
 * Nothing exports the counts; no route can read them.
 *
 * A request that passes both the guard and verifiedTelegramId is counted
 * twice. The line says which bots appear, not how many requests there were.
 */

const WINDOW_MS = 10 * 60_000

const counts = new Map<string, number>()
let windowStart = Date.now()

export function countInitDataBot(
  botId: string | undefined,
  now = Date.now()
): void {
  const key = /^\d{1,20}$/.test(botId ?? '') ? String(botId) : 'unknown'
  counts.set(key, (counts.get(key) ?? 0) + 1)
  if (now - windowStart < WINDOW_MS) return
  const bots = [...counts].map(([bot, n]) => `bot=${bot} n=${n}`).join(' ')
  const seconds = Math.round((now - windowStart) / 1000)
  console.log(`[initdata-bots] window_s=${seconds} ${bots}`)
  counts.clear()
  windowStart = now
}
