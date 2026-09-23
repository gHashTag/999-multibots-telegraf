import { healthOfOwnedBots, type BotHealth } from './owner-bot-health'

/**
 * THE OWNER LEARNS THEIR BOT IS DOWN BEFORE THEIR CLIENTS DO.
 *
 * Owner, 2026-09-23, choosing this over everything else on the list: "today's
 * finding only happened because I went and looked by hand. Make the owner
 * find out by themselves -- that is what closes the June story."
 *
 * THE JUNE STORY. A client's bot was down for nineteen days. The cause was an
 * invalid token; the only trace was a log line in a service she cannot open;
 * and she found out from HER OWN CLIENTS, one by one, while writing to us
 * again and again. Nothing in the product was watching, because nothing in the
 * product had ever been asked to.
 *
 * WHAT THIS IS. A tick that asks Telegram about every bot somebody owns and
 * speaks ONLY when the answer changes: it went quiet, or it came back. The
 * state lives in a table so a restart does not re-announce yesterday's
 * silence, and so the message can say how long it lasted.
 *
 * ── THE THREE WAYS AN ALARM BECOMES NOISE, AND WHAT IS DONE ABOUT THEM ─────
 *
 * 1. REPEATING ITSELF. A bot down for a week must not produce a message every
 *    ten minutes. One message when it falls, one when it returns.
 * 2. FLAPPING. A single failed request is not an outage: Telegram blinks, the
 *    network blinks, and an alarm that fires on one miss teaches people to
 *    ignore it. A bot must be unreachable on `FAILURES_BEFORE_ALARM`
 *    consecutive ticks before anybody is told.
 * 3. BLAMING THE WRONG PARTY. "Your bot is broken" when the token is missing
 *    on OUR side is a lie that sends a person looking at their own settings.
 *    The text says whose side it is, because owner-bot-health.ts knows.
 *
 * WHAT IT DOES NOT DO: send anything to that bot's clients, or touch the bot.
 * It tells the owner, and the owner decides.
 */

/** How many consecutive unreachable ticks before the owner is told. */
export const FAILURES_BEFORE_ALARM = 3

export interface WatchState {
  /** Unreachable ticks in a row, reset by any success. */
  misses: number
  /** Whether the owner has already been told about this outage. */
  alarmed: boolean
  /** When the current outage started, ISO. */
  since: string | null
}

export interface Alarm {
  ownerId: string
  bot: string
  kind: 'silent' | 'back'
  text: string
}

export interface Decision {
  state: WatchState
  alarm: Alarm | null
}

export const FRESH: WatchState = { misses: 0, alarmed: false, since: null }

const hoursBetween = (fromIso: string | null, now: Date): number | null => {
  if (!fromIso) return null
  const from = Date.parse(fromIso)
  if (!Number.isFinite(from)) return null
  return Math.max(0, Math.round((now.getTime() - from) / 36e5))
}

function howLong(since: string | null, now: Date): string {
  const hours = hoursBetween(since, now)
  if (hours === null) return ''
  if (hours < 1) return ' (меньше часа)'
  if (hours < 24) return ` (${hours} ч)`
  const days = Math.round(hours / 24)
  return ` (${days} дн.)`
}

/**
 * What one bot's reading means, given what was known about it before. Pure:
 * the tick that calls it can be read, and the tests below are the whole
 * behaviour.
 */
export function decide(
  previous: WatchState,
  health: BotHealth,
  ownerId: string,
  now: Date
): Decision {
  if (health.alive) {
    const wasAlarmed = previous.alarmed
    const since = previous.since
    if (!wasAlarmed) return { state: FRESH, alarm: null }
    return {
      state: FRESH,
      alarm: {
        ownerId,
        bot: health.bot,
        kind: 'back',
        text: `@${health.bot} снова отвечает${howLong(since, now)}.`,
      },
    }
  }

  const misses = previous.misses + 1
  const since = previous.since ?? now.toISOString()
  // Not yet: one blink is not an outage, and an alarm nobody believes is worse
  // than none.
  if (misses < FAILURES_BEFORE_ALARM || previous.alarmed) {
    return { state: { misses, alarmed: previous.alarmed, since }, alarm: null }
  }
  return {
    state: { misses, alarmed: true, since },
    alarm: {
      ownerId,
      bot: health.bot,
      kind: 'silent',
      text:
        `@${health.bot} не отвечает${howLong(since, now)}.\n` +
        `Причина со стороны Telegram: ${health.why ?? 'неизвестна'}.\n` +
        `Люди, которые ему пишут, ответа не получают.`,
    },
  }
}

export interface WatchDeps {
  /** Everybody who owns at least one bot, and their bots. */
  owners: () => Promise<Array<{ ownerId: string; bots: string[] }>>
  tokenForBot: (username: string) => Promise<string | null>
  /** Persisted per (owner, bot). */
  readState: (ownerId: string, bot: string) => Promise<WatchState | null>
  writeState: (ownerId: string, bot: string, s: WatchState) => Promise<void>
  fetchImpl?: typeof fetch
  now?: () => Date
}

/**
 * One tick over everybody. Returns the alarms to deliver; sending is the
 * caller's job, so this stays testable and cannot message anybody by accident.
 */
export async function watchOnce(deps: WatchDeps): Promise<Alarm[]> {
  const now = deps.now ? deps.now() : new Date()
  const alarms: Alarm[] = []
  let owners: Array<{ ownerId: string; bots: string[] }> = []
  try {
    owners = await deps.owners()
  } catch {
    // The list of owners is unavailable: say nothing rather than announce
    // that everybody's bots are fine or broken.
    return []
  }

  for (const { ownerId, bots } of owners) {
    if (!ownerId || !bots?.length) continue
    const health = await healthOfOwnedBots(ownerId, {
      botsOwnedBy: async () => bots,
      tokenForBot: deps.tokenForBot,
      fetchImpl: deps.fetchImpl,
      now: () => now,
    })
    for (const h of health) {
      const previous = (await deps
        .readState(ownerId, h.bot)
        .catch(() => null)) ?? { ...FRESH }
      const { state, alarm } = decide(previous, h, ownerId, now)
      await deps.writeState(ownerId, h.bot, state).catch(() => {})
      if (alarm) alarms.push(alarm)
    }
  }
  return alarms
}
