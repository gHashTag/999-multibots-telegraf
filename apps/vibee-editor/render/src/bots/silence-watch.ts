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
 *    THIS ONE WAS GOT WRONG IN THE FIRST LIVE RUN, 2026-09-23. The label was
 *    the constant "Причина со стороны Telegram", and three owners were sent it
 *    above a reason that was ours -- no token on this server. A rule written
 *    into a comment and then not read from the data is not a rule. The label
 *    now comes from `health.side`, and a test fails if the two disagree.
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

/**
 * Whose gap it is, in the words the person needs. For our own gap the next
 * step is "write to us" -- without it a person reads "on our side" and still
 * goes to check their own settings, which is the failure this replaces.
 */
function blame(health: BotHealth): string {
  const why = health.why ?? 'неизвестна'
  if (health.side === 'ours')
    return `Причина на нашей стороне: ${why}.\nЭто не твои настройки — напиши нам.`
  if (health.side === 'telegram') return `Причина со стороны Telegram: ${why}.`
  // Neither known: say the reason without naming a culprit we cannot name.
  return `Причина: ${why}.`
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
        `${blame(health)}\n` +
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
  /**
   * Sends one alarm and says whether it ARRIVED -- not whether it was
   * attempted. Without the answer this tick writes "told" for a message that
   * bounced (the owner never started a chat with the platform bot, or blocked
   * it), and the owner is then never told again: the state says they know.
   *
   * Optional: with no deliver, nothing is sent and nothing is marked as told.
   */
  deliver?: (alarm: Alarm) => Promise<boolean>
  fetchImpl?: typeof fetch
  now?: () => Date
}

export interface WatchRound {
  alarms: Alarm[]
  /** Bots asked about this tick. */
  checked: number
  /** Of those, how many did not answer. */
  silent: number
  /** Alarms that arrived, and alarms that did not. */
  delivered: number
  undelivered: number
}

const EMPTY_ROUND: WatchRound = {
  alarms: [],
  checked: 0,
  silent: 0,
  delivered: 0,
  undelivered: 0,
}

/**
 * One tick over everybody.
 *
 * WHY IT RETURNS COUNTS AND NOT ONLY ALARMS. The first live run was invisible:
 * a tick that finds nothing says nothing, so "everything answers" and "the
 * watchman is not running at all" looked identical for twenty minutes, and the
 * only way to tell them apart was to open the database by hand. A watchman that
 * cannot be seen watching is the very thing this file exists to prevent, so
 * every round reports what it did and the caller logs one line.
 */
export async function watchOnce(deps: WatchDeps): Promise<WatchRound> {
  const now = deps.now ? deps.now() : new Date()
  const alarms: Alarm[] = []
  let checked = 0
  let silent = 0
  let delivered = 0
  let undelivered = 0
  let owners: Array<{ ownerId: string; bots: string[] }> = []
  try {
    owners = await deps.owners()
  } catch {
    // The list of owners is unavailable: say nothing rather than announce
    // that everybody's bots are fine or broken.
    return { ...EMPTY_ROUND }
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
      checked++
      if (!h.alive) silent++

      /*
       * DELIVER BEFORE RECORDING "TOLD". The order is the whole point: an
       * alarm that bounced must leave `alarmed` false, so the next tick tries
       * again instead of trusting a state that says the owner knows.
       */
      let toWrite = state
      if (alarm) {
        alarms.push(alarm)
        if (deps.deliver) {
          const arrived = await deps.deliver(alarm).catch(() => false)
          if (arrived) delivered++
          else {
            undelivered++
            if (alarm.kind === 'silent') toWrite = { ...state, alarmed: false }
          }
        }
      }
      await deps.writeState(ownerId, h.bot, toWrite).catch(() => {})
    }
  }
  return { alarms, checked, silent, delivered, undelivered }
}
