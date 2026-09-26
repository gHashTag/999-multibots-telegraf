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

import { telegramApiFor } from '../telegram-api'

export interface BotHealth {
  /** Username without the @, as the farm knows it. */
  bot: string
  /** Telegram answers getMe for this token today. */
  alive: boolean
  /** Telegram's own description when it does not, or why we could not ask. */
  why: string | null
  /**
   * WHOSE SIDE THE GAP IS ON, and the reason this field exists at all.
   *
   * MEASURED 2026-09-23, on the watchman's first live run: three owners were
   * told "Причина со стороны Telegram: токена этого бота нет на сервере". Both
   * halves were produced here, and the sentence contradicts itself -- the
   * reason was OURS and the label said Telegram's. A person reading it goes to
   * look at their own settings, or blames a platform that did nothing wrong.
   *
   * `why` alone cannot be labelled by whoever prints it: only this module
   * knows which branch produced it. So it says.
   *
   * 'telegram' — Telegram answered and refused: an invalid token, a deleted
   *              bot. Their words are in `why`.
   * 'ours'     — we never asked, or could not: no token on this server, or the
   *              request itself failed. Nothing about their bot is known.
   * null       — nothing is wrong (`alive`).
   */
  side: 'telegram' | 'ours' | null
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

/**
 * `reached` separates "Telegram said no" from "we never got an answer". Both
 * arrive here as a failure, and treating them the same is how an owner is told
 * their bot is broken because OUR request timed out.
 */
async function askTelegram(
  token: string,
  method: string,
  fetchImpl: typeof fetch
): Promise<{
  ok: boolean
  reached: boolean
  result?: Record<string, unknown>
  description?: string
}> {
  try {
    /*
     * THE HOST OF THIS TOKEN, NEVER THE CLOUD BY NAME.
     *
     * A health check that writes api.telegram.org by hand calls the CLOUD for
     * every bot it checks -- including the ones moved to our own Bot API
     * server. For a moved bot that single request logs it back into the cloud
     * and its updates stop arriving where they are handled: the check would
     * break exactly the thing it exists to watch.
     *
     * Caught by the census test, which stood red on main when this was
     * written -- so the watchman was itself the hazard for two commits.
     */
    const res = await fetchImpl(`${telegramApiFor(token)}/${method}`, {
      method: 'GET',
    })
    const body = (await res.json()) as {
      ok?: boolean
      result?: Record<string, unknown>
      description?: string
    }
    return {
      ok: Boolean(body?.ok),
      reached: true,
      result: body?.result,
      description: body?.description,
    }
  } catch (e) {
    return {
      ok: false,
      reached: false,
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
        why: 'токена этого бота нет на нашем сервере — им никто не может отвечать',
        side: 'ours',
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
        why: me.reached
          ? (me.description ?? 'Telegram не признал токен')
          : `мы не смогли спросить Telegram: ${me.description ?? 'запрос не дошёл'}`,
        side: me.reached ? 'telegram' : 'ours',
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
      side: null,
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
