import { STORAGE_KEYS } from '@vibee/atoms'

/**
 * Read once, when the module loads -- before any redirect can write the flag,
 * like RouteMemory's REMEMBERED -- and updated in memory by markWelcomed(),
 * or the header logo (a link to "/") would send a person back to the
 * greeting for the rest of their first session.
 */
let welcomed = readWelcomed()

/**
 * Storage that cannot be read, or cannot be written, counts as "already
 * greeted": the flag could never stick, so a screen that could never be
 * dismissed for good would open on every launch. A full quota is the likely
 * case -- chats and drafts live in the same storage.
 */
function readWelcomed(): boolean {
  if (typeof window === 'undefined') return true
  try {
    if (window.localStorage.getItem(STORAGE_KEYS.welcomeSeen) !== null)
      return true
    window.localStorage.setItem(STORAGE_KEYS.welcomeSeen + ':probe', '1')
    window.localStorage.removeItem(STORAGE_KEYS.welcomeSeen + ':probe')
    return false
  } catch {
    return true
  }
}

/** The welcome screen was shown: remember it for this session and the next. */
export function markWelcomed(): void {
  welcomed = true
  try {
    window.localStorage.setItem(STORAGE_KEYS.welcomeSeen, '1')
  } catch {
    // This session already knows; the next launch reads storage that cannot
    // be written as "greeted" too, so the screen cannot loop.
  }
}

/** True once this person has been greeted, in this session or an earlier one. */
export function isWelcomed(): boolean {
  return welcomed
}
