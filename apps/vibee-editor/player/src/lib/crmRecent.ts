/**
 * THE LAST PEOPLE OPENED, NEWEST FIRST -- ONE TAP BACK TO THEM.
 *
 * On a phone the owner goes back and forth between a few chats; each return
 * was: contacts, type a name, wait, tap. HubSpot and Pipedrive both put the
 * recently viewed records under an empty search for this reason.
 *
 * Only ids are kept, on this device. The screen shows an id only if it is in
 * the contact list the server just returned, so a stale or someone else's id
 * (a shared browser) draws nothing.
 */

const KEY = 'vibee.crm.recent'
export const RECENT_MAX = 6

export function recentContactIds(): string[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) || '[]')
    return Array.isArray(raw)
      ? raw.filter((v): v is string => typeof v === 'string')
      : []
  } catch {
    // Storage off (private mode) or a broken value: nothing remembered.
    return []
  }
}

export function rememberContact(id: string): void {
  if (!id) return
  try {
    const next = [id, ...recentContactIds().filter(v => v !== id)].slice(
      0,
      RECENT_MAX
    )
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Storage off: the row simply stays empty.
  }
}
