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

export interface Announcement {
  text: string
  replyMarkup: unknown
}

export function browserStartedMessage(url = BROWSER_TAB_URL): Announcement {
  return {
    text:
      'Агент открыл ваш браузер и начал работать.\n\n' + // cyrillic-ok: user-facing
      'Откройте, чтобы смотреть за ним — и в любой момент взять управление.', // cyrillic-ok: user-facing
    replyMarkup: {
      inline_keyboard: [
        [{ text: '👁 Смотреть за агентом', url }], // cyrillic-ok: button label
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
  actor: Actor
): Promise<boolean> {
  if (actor !== 'agent') return false
  const { text, replyMarkup } = browserStartedMessage()
  try {
    await announcer.send(telegramId, text, replyMarkup)
    return true
  } catch {
    return false
  }
}
