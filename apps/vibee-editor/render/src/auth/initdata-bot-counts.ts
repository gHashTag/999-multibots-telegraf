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
 *
 * A request that passes both the guard and verifiedTelegramId is counted
 * twice. The line says which bots appear, not how many requests there were.
 *
 * PERSISTED, BECAUSE A WEEK OF EVIDENCE MUST SURVIVE DEPLOYS. Every count also
 * goes into a per-day aggregate (UTC day, bot id, path) that session-store.ts
 * takes and writes to app_initdata_bot_daily from the revocation poll. Besides
 * `request` (the per-request verification above) the path names a privileged
 * class an initData identity reached, so the decision on which bots may reach
 * those paths rests on counts: see InitDataPath. Counts only, never who. Only
 * session-store.ts takes the aggregates, and no route reads that table.
 */

/**
 * Where verified initData arrived:
 *   request          -- per-request verification (guard, verifiedTelegramId);
 *   auth_telegram    -- /api/auth/telegram, which mints a 60-day family;
 *   pair_start       -- /api/auth/pair/start, which issues a pairing code;
 *   proposal_confirm -- /api/tg/proposal/confirm;
 *   tg_tool          -- a tg_* tool call on /mcp or in the agent chat;
 *   owner_tool       -- any tool call by the platform owner;
 *   keeper_tool      -- any tool call by a hive keeper who is not the owner.
 */
export type InitDataPath =
  | 'request'
  | 'auth_telegram'
  | 'pair_start'
  | 'proposal_confirm'
  | 'tg_tool'
  | 'owner_tool'
  | 'keeper_tool'

const WINDOW_MS = 10 * 60_000

const counts = new Map<string, number>()
let windowStart = Date.now()

/** Not written yet: `${day}|${bot}|${path}` -> n. */
const unwritten = new Map<string, number>()

export function countInitDataBot(
  botId: string | undefined,
  path: InitDataPath = 'request',
  now = Date.now()
): void {
  const key = /^\d{1,20}$/.test(botId ?? '') ? String(botId) : 'unknown'
  const row = `${new Date(now).toISOString().slice(0, 10)}|${key}|${path}`
  unwritten.set(row, (unwritten.get(row) ?? 0) + 1)
  if (path !== 'request') return
  counts.set(key, (counts.get(key) ?? 0) + 1)
  if (now - windowStart < WINDOW_MS) return
  const bots = [...counts].map(([bot, n]) => `bot=${bot} n=${n}`).join(' ')
  const seconds = Math.round((now - windowStart) / 1000)
  console.log(`[initdata-bots] window_s=${seconds} ${bots}`)
  counts.clear()
  windowStart = now
}

export interface InitDataBotCount {
  /** UTC day, YYYY-MM-DD. */
  day: string
  bot: string
  path: string
  n: number
}

/** Hand the unwritten aggregates to the writer and forget them here. */
export function takeInitDataBotCounts(): InitDataBotCount[] {
  const rows = [...unwritten].map(([k, n]) => {
    const [day, bot, path] = k.split('|')
    return { day, bot, path, n }
  })
  unwritten.clear()
  return rows
}

/** Put back aggregates a failed write did not store; the next write carries them. */
export function returnInitDataBotCounts(rows: InitDataBotCount[]): void {
  for (const r of rows) {
    const k = `${r.day}|${r.bot}|${r.path}`
    unwritten.set(k, (unwritten.get(k) ?? 0) + r.n)
  }
}
