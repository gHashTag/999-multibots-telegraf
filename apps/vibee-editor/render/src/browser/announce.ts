/**
 * "SOMETHING STARTED YOUR BROWSER."
 *
 * THE HOLE THIS FILLS. The mini app notices an agent starting work only while
 * it is open: the watcher polls from a mounted page. With the app closed --
 * which is most of the time, on a phone -- an agent could work for ten
 * minutes inside somebody's signed-in accounts and they would never learn of
 * it. Everything else built here is invisible to a person not already
 * looking at it.
 *
 * WHEN IT FIRES, AND WHEN IT MUST NOT. Only when the browser was started by
 * something OTHER than the person. Telling somebody "your browser started"
 * one second after they pressed "open my browser" is noise, and noise is how
 * a notification channel gets muted -- along with the one message that
 * mattered.
 *
 * The distinction is real, not guessed: the broker knows which door the
 * caller came through (`identityWithSource` in agent/routes.ts). An agent key
 * is an agent. A Mini App signature or an app session is the person.
 */

export type Actor = 'person' | 'agent'

/** Where the person lands. The tab watches, and switches, from there. */
export const BROWSER_TAB_URL = 'https://app.t27.ai/browser'

/*
 * A `web_app` BUTTON, NEVER A `url` ONE.
 *
 * Owner, 2026-09-22: "the links open in another browser, I am not signed in
 * there, so I cannot see what the agent does". A `url` button leaves
 * Telegram for the phone's default browser, which has no session of ours.
 * A `web_app` button opens the same page INSIDE Telegram as the mini app,
 * carrying the person's signed initData -- which the render verifies against
 * every farm bot's token (auth.ts botTokens), so whichever bot sent this,
 * the person arrives signed in. Only valid in a private chat, which is the
 * only place these messages go.
 */
export function openBrowserButton(
  text: string,
  url = BROWSER_TAB_URL
): { text: string; web_app: { url: string } } {
  return { text, web_app: { url } }
}

export interface Announcement {
  text: string
  replyMarkup: unknown
}

/* cyrillic-ok: who started the browser, in the person's words */
const DESK_NAMES: Record<string, string> = {
  reddit: 'стол Reddit читает входящие', // cyrillic-ok
  engage: 'стол комментариев', // cyrillic-ok
  'blog-share': 'публикация блога', // cyrillic-ok
  rounds: 'обход сетей', // cyrillic-ok
  scenarios: 'сценарий', // cyrillic-ok
  heal: 'починка зависшего браузера', // cyrillic-ok
}

export function deskName(by: unknown): string {
  return (typeof by === 'string' && DESK_NAMES[by]) || 'агент' // cyrillic-ok
}

/*
 * ONE MESSAGE PER QUIET WINDOW FOR THE DESKS.
 *
 * Measured 2026-10-03: the Reddit desk ticks hourly, the reaper drops an idle
 * visit after ten minutes, so every tick opened a fresh visit and every
 * opening sent "the agent opened your browser" -- one Telegram message an
 * hour, all night, to the owner. That is the noise this file exists to avoid:
 * a channel that pings hourly gets muted, and with it the start that
 * mattered. A desk's start is announced once, then the desks are quiet for
 * this long; the journal (`browser_start` with `by`) still names each one.
 * A start by a tool -- a chat turn -- is announced every time, as before.
 */
export const DESK_QUIET_MS = 12 * 60 * 60 * 1000

/** `lastMs` = the last desk start that was announced, null if none or unreadable. */
export function deskStartMayAnnounce(
  lastMs: number | null,
  nowMs: number
): boolean {
  return lastMs === null || nowMs - lastMs >= DESK_QUIET_MS
}

export function browserStartedMessage(
  url = BROWSER_TAB_URL,
  by?: string
): Announcement {
  const head = by
    ? `Агент открыл ваш браузер: ${deskName(by)}.\n\n` // cyrillic-ok: user-facing
    : 'Агент открыл ваш браузер и начал работать.\n\n' // cyrillic-ok: user-facing
  const tail = by
    ? '\n\nСледующие 12 ч фоновые задачи открывают его без этого сообщения — ' + // cyrillic-ok: user-facing
      'каждый их шаг виден в журнале на вкладке «Браузер».' // cyrillic-ok: user-facing
    : ''
  return {
    text:
      head +
      'Откройте, чтобы смотреть за ним — и в любой момент взять управление.' + // cyrillic-ok: user-facing
      tail,
    replyMarkup: {
      inline_keyboard: [
        [openBrowserButton('👁 Смотреть за агентом', url)], // cyrillic-ok: button label
      ],
    },
  }
}

export interface Announcer {
  send: (
    telegramId: string,
    text: string,
    replyMarkup?: unknown
  ) => Promise<void>
}

/**
 * A failure here never fails the browser. The person asked for a browser, not
 * for a notification; a Telegram outage, or somebody who blocked the bot,
 * must not turn a working pod into an error on their screen.
 */
export async function announceBrowserStarted(
  announcer: Announcer,
  telegramId: string,
  actor: Actor,
  /** The desk that started it; a tool's start leaves it out. */
  by?: string
): Promise<boolean> {
  if (actor !== 'agent') return false
  const { text, replyMarkup } = browserStartedMessage(BROWSER_TAB_URL, by)
  try {
    await announcer.send(telegramId, text, replyMarkup)
    return true
  } catch {
    return false
  }
}
