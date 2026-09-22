/**
 * WHEN OUR OWN BOT API SERVER STOPS ANSWERING, SOMEBODY HEARS ABOUT IT.
 *
 * Nothing else would say so. For a bot on our server (BOT_API_LOCAL_BOTS),
 * Telegraf's long polling treats a network error, a 5xx and a 429 as
 * retryable, reports them only through its `debug` channel and tries again
 * every 5 seconds -- so when the server goes away the bot simply falls silent,
 * with not one line in the bot's log. Other bots are untouched (the host is
 * chosen per token), which makes it easier still to miss.
 *
 * So while any bot is listed, this probes both halves of the server once a
 * minute -- the API port (through its proxy: `/` answers when the server is
 * up, 502 when it is not) and the file endpoint (`/healthz`) -- logs every
 * failed probe, and tells the admin once when a half goes down and once when
 * it comes back. The alert goes through BOT_TOKEN_1, which the startup check
 * keeps on the cloud (assertBotsStayOnCloud in src/index.ts): an alert about
 * this server must not depend on this server.
 */

import { logger } from '@/utils/logger'
import { resolveAdminChatId } from '@/helpers/adminChatId'
import { readBotApiConfig, telegramApiFor } from '@/services/telegramApi'

type Env = Record<string, string | undefined>
type Fetch = typeof fetch

export const PROBE_INTERVAL_MS = 60_000
const PROBE_TIMEOUT_MS = 5_000

export interface ProbeResult {
  /** null when fine, otherwise what was seen. */
  api: string | null
  files: string | null
}

async function probeOne(
  fetchImpl: Fetch,
  url: string,
  healthy: (status: number, body: string) => boolean
): Promise<string | null> {
  try {
    const res = await fetchImpl(url, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    const body = await res.text().catch(() => '')
    return healthy(res.status, body) ? null : `HTTP ${res.status}`
  } catch (e) {
    return (e as Error)?.name || 'network error'
  }
}

/** One look at both halves. No token is ever part of these URLs. */
export async function probeBotApiServer(
  env: Env = process.env,
  fetchImpl: Fetch = fetch
): Promise<ProbeResult> {
  const config = readBotApiConfig(env)
  const [api, files] = await Promise.all([
    config.localRoot
      ? probeOne(fetchImpl, `${config.localRoot}/`, status => status < 500)
      : Promise.resolve('not configured'),
    config.filesRoot
      ? probeOne(
          fetchImpl,
          `${config.filesRoot}/healthz`,
          (status, body) => status === 200 && body.trim() === 'ok'
        )
      : Promise.resolve('not configured'),
  ])
  return { api, files }
}

const HALVES: Record<keyof ProbeResult, string> = {
  api: 'the Bot API port (8081)',
  files: 'the file endpoint (8082)',
}

/**
 * The state machine, apart from the timer so it can be tested: feed it
 * probe results, it answers what to log and what to tell the admin.
 */
export function createBotApiWatch(listedIds: string[]) {
  const down: Record<keyof ProbeResult, boolean> = { api: false, files: false }
  return (result: ProbeResult): { logs: string[]; alerts: string[] } => {
    const logs: string[] = []
    const alerts: string[] = []
    for (const half of ['api', 'files'] as const) {
      const failure = result[half]
      if (failure) {
        logs.push(`${HALVES[half]} does not answer: ${failure}`)
        if (!down[half]) {
          down[half] = true
          alerts.push(
            `🔴 Our Bot API server: ${HALVES[half]} does not answer (${failure}). ` +
              `Bots on it (${listedIds.join(', ')}) are silent or cannot read files. ` +
              'railway logs --service telegram-bot-api'
          )
        }
      } else if (down[half]) {
        down[half] = false
        alerts.push(`🟢 Our Bot API server: ${HALVES[half]} answers again.`)
      }
    }
    return { logs, alerts }
  }
}

async function tellAdmin(
  text: string,
  env: Env,
  fetchImpl: Fetch
): Promise<void> {
  const chatId = resolveAdminChatId(env as NodeJS.ProcessEnv)
  const token = env.BOT_TOKEN_1
  if (!chatId || !token) {
    logger.error('[bot-api] no admin chat or BOT_TOKEN_1 to alert through', {
      text,
    })
    return
  }
  try {
    const res = await fetchImpl(`${telegramApiFor(token, env)}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    if (!res.ok) {
      logger.error('[bot-api] the alert was refused by Telegram', {
        status: res.status,
      })
    }
  } catch (e) {
    logger.error('[bot-api] the alert could not be sent', {
      error: (e as Error)?.name,
    })
  }
}

/**
 * Starts the minute probe when any bot is listed; does nothing otherwise.
 * Returns a stop function, or null when there is nothing to watch.
 */
export function startBotApiServerMonitor({
  env = process.env,
  fetchImpl = fetch,
  intervalMs = PROBE_INTERVAL_MS,
}: { env?: Env; fetchImpl?: Fetch; intervalMs?: number } = {}):
  | (() => void)
  | null {
  const listed = [...readBotApiConfig(env).local.keys()]
  if (listed.length === 0) return null

  const watch = createBotApiWatch(listed)
  const tick = async () => {
    const { logs, alerts } = watch(await probeBotApiServer(env, fetchImpl))
    for (const line of logs) logger.error(`[bot-api] ${line}`)
    for (const text of alerts) await tellAdmin(text, env, fetchImpl)
  }
  const timer = setInterval(() => void tick().catch(() => {}), intervalMs)
  timer.unref?.()
  void tick().catch(() => {})
  logger.info(
    `[bot-api] watching our Bot API server every ${Math.round(intervalMs / 1000)} s ` +
      `for ${listed.length} listed bot(s)`
  )
  return () => clearInterval(timer)
}
