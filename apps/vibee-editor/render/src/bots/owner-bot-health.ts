/**
 * IS MY BOT ALIVE? — THE QUESTION ITS OWNER COULD NOT ASK.
 *
 * Owner, 2026-09-23, about a client (@Ryabinika_Perm): "check that she has
 * access to the bot, and if not, a dialogue with her so the client can fix her
 * problems without me".
 *
 * What happened to her, from her own messages: in June her bot was down for
 * nineteen days -- "с 1-19 июня я там висела" -- and she learned about it from
 * HER OWN CLIENTS. The cause was on our side (BOT_TOKEN_11 invalid, 404 from
 * Telegram), and the only way anybody could see it was a log line in a service
 * she has no access to. She wrote, in the same conversation, that she had
 * written to him dozens of times that year and was by now embarrassed to keep
 * writing -- "easier not to use it".
 *
 * So this answers one question for the person who owns a bot: does Telegram
 * still know it, right now. No dashboards, no logs, no asking the owner.
 *
 * WHAT IT IS NOT. It is not a claim that the bot is ANSWERING people: getMe
 * proves the token is valid and the bot exists, which is exactly the failure
 * she hit and nothing more. A bot whose service is down still passes getMe,
 * and saying otherwise would replace one blind spot with a false comfort.
 * `pendingUpdates` is reported beside it because a queue that grows is the
 * shape of "alive at Telegram, nobody collecting" -- the reader can see both.
 *
 * WHY THE TOKEN IS NEVER RETURNED. The answer travels to a browser. A bot
 * token is a credential that lets anybody speak as that bot, so this module
 * takes tokens as input and gives back facts only: a username, a yes or no,
 * and Telegram's own words when the answer is no.
 */

export interface BotHealth {
  /** Username without the @, as the farm knows it. */
  bot: string
  /** Telegram answers getMe for this token today. */
  alive: boolean
  /** Telegram's own description when it does not, or why we could not ask. */
  why: string | null
  /** Updates waiting to be collected, when Telegram will say. */
  pendingUpdates: number | null
  checkedAt: string
}

export interface HealthDeps {
  /** Bot usernames this person owns (hive-tools.botsOwnedBy). */
  botsOwnedBy: (telegramId: string) => Promise<string[]>
  /** The farm's token for a username, or null when it is not in the farm. */
  tokenForBot: (username: string) => Promise<string | null>
  /** Injected so the tests never touch the network. */
  fetchImpl?: typeof fetch
  now?: () => Date
}

const clean = (name: string): string =>
  String(name ?? '')
    .trim()
    .replace(/^@/, '')

async function askTelegram(
  token: string,
  method: string,
  fetchImpl: typeof fetch
): Promise<{
  ok: boolean
  result?: Record<string, unknown>
  description?: string
}> {
  try {
    const res = await fetchImpl(
      `https://api.telegram.org/bot${token}/${method}`,
      {
        method: 'GET',
      }
    )
    const body = (await res.json()) as {
      ok?: boolean
      result?: Record<string, unknown>
      description?: string
    }
    return {
      ok: Boolean(body?.ok),
      result: body?.result,
      description: body?.description,
    }
  } catch (e) {
    return {
      ok: false,
      description: e instanceof Error ? e.message : String(e),
    }
  }
}

/**
 * The state of every bot this person owns. Never throws: a person asking
 * "is my bot alive" must get an answer even when one of the calls fails, and
 * the failure is part of the answer.
 */
export async function healthOfOwnedBots(
  telegramId: string,
  deps: HealthDeps
): Promise<BotHealth[]> {
  const fetchImpl = deps.fetchImpl ?? fetch
  const at = (deps.now ? deps.now() : new Date()).toISOString()
  let owned: string[] = []
  try {
    owned = await deps.botsOwnedBy(String(telegramId))
  } catch {
    // The ownership source is down; that is not "you own nothing".
    return []
  }

  const out: BotHealth[] = []
  for (const raw of owned) {
    const bot = clean(raw)
    if (!bot) continue
    const token = await deps.tokenForBot(bot).catch(() => null)
    if (!token) {
      out.push({
        bot,
        alive: false,
        // Said plainly: this is OUR gap, not their bot being broken.
        why: 'токена этого бота нет на сервере — им никто не может отвечать',
        pendingUpdates: null,
        checkedAt: at,
      })
      continue
    }
    const me = await askTelegram(token, 'getMe', fetchImpl)
    if (!me.ok) {
      out.push({
        bot,
        alive: false,
        why: me.description ?? 'Telegram не признал токен',
        pendingUpdates: null,
        checkedAt: at,
      })
      continue
    }
    const hook = await askTelegram(token, 'getWebhookInfo', fetchImpl)
    const pending = Number(hook.result?.pending_update_count)
    out.push({
      bot: clean(String(me.result?.username ?? bot)),
      alive: true,
      why: null,
      pendingUpdates: Number.isFinite(pending) ? pending : null,
      checkedAt: at,
    })
  }
  return out
}

/** One line a person can read, for the bot screen and for an alert. */
export function healthLine(h: BotHealth): string {
  if (!h.alive)
    return `@${h.bot}: не отвечает — ${h.why ?? 'причина неизвестна'}`
  if (h.pendingUpdates && h.pendingUpdates > 50) {
    // Alive at Telegram and nobody collecting is the second failure shape.
    return `@${h.bot}: жив, но ${h.pendingUpdates} сообщений ждут разбора`
  }
  return `@${h.bot}: отвечает`
}
