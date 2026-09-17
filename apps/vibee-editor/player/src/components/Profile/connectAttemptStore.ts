/**
 * THE LOGIN IN PROGRESS SURVIVES A TRIP TO THE "TELEGRAM" CHAT.
 *
 * The code does not come to this screen. It comes to the chat named
 * "Telegram", in the same app, one tap away -- and to read it the person has
 * to LEAVE this screen. On a client that closes the Mini App when they do, the
 * attempt lived only in React state: they came back to an empty phone form,
 * asked for a code again, and the code they had just read was dead. The way
 * to never log in was to go and look at the code.
 *
 * So the attempt is remembered for as long as the server keeps its half: ten
 * minutes (the attempt lifetime in render/src/agent/tg-connect.ts), counted
 * from the last code Telegram sent.
 *
 * What is stored, and why that is safe to store: the handle, the number the
 * person typed into this very screen, and what Telegram said about delivery.
 * The handle is not a pass -- the server ties the attempt to the verified
 * Telegram id and refuses anybody else -- and the code itself is never here.
 *
 * The storage is injected, so this is checked without a browser.
 */

import type { SentCode } from './connectDelivery'

const KEY = 'vibee:tg-connect-attempt'

/** Must not outlive the server's half of the attempt. */
export const ATTEMPT_TTL_MS = 10 * 60 * 1000

export interface SavedAttempt {
  handle: string
  phone: string
  sent: SentCode
  /** When Telegram last sent a code for this attempt, ms since epoch. */
  savedAt: number
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** `localStorage`, or nothing: private mode and some webviews throw on access. */
export function browserStore(): Store | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function saveAttempt(
  store: Store | null,
  attempt: Omit<SavedAttempt, 'savedAt'>,
  now: number
): void {
  if (!store || !attempt.handle) return
  try {
    store.setItem(KEY, JSON.stringify({ ...attempt, savedAt: now }))
  } catch {
    // A full or forbidden storage costs the convenience, never the login.
  }
}

export function clearAttempt(store: Store | null): void {
  try {
    store?.removeItem(KEY)
  } catch {
    // Nothing to do: the entry expires by itself.
  }
}

/**
 * The attempt to resume, or null.
 *
 * Anything that is not plainly a live attempt is dropped AND removed: a
 * malformed entry would otherwise be re-read, and re-refused, on every launch.
 * A `savedAt` in the future is treated as expired rather than as fresh -- a
 * clock that jumped must not keep an attempt alive for hours.
 */
export function loadAttempt(
  store: Store | null,
  now: number
): SavedAttempt | null {
  if (!store) return null
  let raw: string | null = null
  try {
    raw = store.getItem(KEY)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const a = JSON.parse(raw) as Partial<SavedAttempt> | null
    const age = now - Number(a?.savedAt)
    const live =
      !!a &&
      typeof a.handle === 'string' &&
      a.handle !== '' &&
      typeof a.phone === 'string' &&
      a.phone !== '' &&
      !!a.sent &&
      typeof a.sent.delivery === 'string' &&
      Number.isFinite(age) &&
      age >= 0 &&
      age < ATTEMPT_TTL_MS
    if (live) return a as SavedAttempt
  } catch {
    // Falls through to the removal below.
  }
  clearAttempt(store)
  return null
}

/**
 * The wait still owed before a resend, after time spent away.
 *
 * Coming back must not restart Telegram's countdown from the top: the person
 * already waited, in another chat.
 */
export function remainingWait(attempt: SavedAttempt, now: number): number {
  const waited = Math.floor((now - attempt.savedAt) / 1000)
  return Math.max(0, attempt.sent.resendAfter - Math.max(0, waited))
}
