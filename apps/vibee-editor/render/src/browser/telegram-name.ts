/**
 * THE WINDOW KNOWS WHO IS IN IT, BY THE NAME THEY GO BY IN TELEGRAM.
 *
 * The person is already signed in: the broker hands the window's address
 * only to somebody whose Telegram initData checked out, and the pod's own
 * password never leaves this server. What was missing is the NAME. neko
 * logs in with the display name the page gives it, and the page was given
 * "you" -- so the person sat in their own browser as "you", on a disc that
 * said "YO".
 *
 * The name is put in on THIS side, where the proxy already swaps the pod's
 * password in: the page keeps saying "you", and nothing personal ever sits
 * in an address, a log line or a Referer.
 *
 * Like the face (avatar.ts), it never throws, and it never makes the window
 * wait long: no name means the page's own "you" stays, and the window works.
 */

import { botToken } from './avatar'
import { telegramApiFor } from '../telegram-api'

/** A reload is free; a renamed account shows up within the working day. */
export const NAME_TTL_MS = 6 * 60 * 60 * 1000

/**
 * The login waits for this, so it is short. Telegram answers getChat in tens
 * of milliseconds; a Telegram that does not answer in two seconds costs the
 * person their name for this connection, not their connection.
 */
export const NAME_TIMEOUT_MS = 2000

/** neko shows it in a narrow list; a paragraph is not a name. */
export const NAME_MAX = 32

interface CacheEntry {
  at: number
  value: string | null
}

const cache = new Map<string, CacheEntry>()

/** Test seam, and the way a changed name is picked up on demand. */
export function forgetName(telegramId?: string): void {
  if (telegramId) cache.delete(telegramId)
  else cache.clear()
}

/**
 * What neko may show. Control characters out -- they can break a line in a
 * log or a list -- whitespace collapsed, cut at a character boundary rather
 * than in the middle of a surrogate pair.
 */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const flat = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!flat) return null
  return Array.from(flat).slice(0, NAME_MAX).join('').trim() || null
}

interface ChatAnswer {
  ok?: boolean
  result?: { first_name?: string; last_name?: string; username?: string }
}

/** First name, as Telegram greets people; the username only if there is none. */
export function nameFromChat(answer: ChatAnswer | null | undefined) {
  const chat = answer?.ok ? answer.result : undefined
  return cleanName(chat?.first_name) || cleanName(chat?.username)
}

export async function telegramName(
  telegramId: string,
  token = botToken(),
  fetcher: typeof fetch = fetch,
  nowMs = Date.now()
): Promise<string | null> {
  const hit = cache.get(telegramId)
  if (hit && nowMs - hit.at <= NAME_TTL_MS) return hit.value

  const remember = (v: string | null) => {
    cache.set(telegramId, { at: nowMs, value: v })
    return v
  }
  if (!telegramId || !token) return remember(null)

  try {
    const res = await fetcher(
      `${telegramApiFor(token)}/getChat?chat_id=${encodeURIComponent(
        telegramId
      )}`,
      { signal: AbortSignal.timeout(NAME_TIMEOUT_MS) }
    )
    return remember(nameFromChat((await res.json()) as ChatAnswer))
  } catch {
    /*
     * A timeout is not remembered as "no name": Telegram was slow, the
     * person still has one, and the next connection should ask again.
     */
    return null
  }
}
