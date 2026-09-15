/**
 * ONE ANSWER PER ALBUM, NOT ONE PER PHOTO.
 *
 * Telegram delivers every element of an album as its own business_message and
 * puts the caption on at most one of them. The seller's non-text branch
 * answers with a canned line and returns ABOVE the only duplicate guard in
 * that function, so nothing suppressed anything: four photos with no caption
 * produced four identical messages in a row, signed with the owner's name, at
 * the exact moment the client had shown what they wanted. It reads as a
 * broken bot.
 *
 * A separate module so it can be tested at all: importing businessBotService
 * pulls in the whole scene graph, which is why every other test beside it
 * asserts source text rather than behaviour. Behaviour is worth more.
 */

/**
 * How long an album is remembered.
 *
 * An album arrives within seconds. Remembering for the life of the process
 * would be a slow leak in a guard that never needs more than a few minutes,
 * and old keys are swept on each call rather than by a timer -- a timer would
 * hold the process open.
 */
export const ALBUM_QUIET_MS = 5 * 60 * 1000

// owner-scope: keyed by connection and album -- swept by age, holds no facts
const answered = new Map<string, number>()

/**
 * True when this album has already had its one answer.
 *
 * A message with no album id is ALWAYS answered: it is a single file, and
 * treating it as part of a group would silence real messages. The first
 * element of a group is answered too -- this returns false for it and
 * remembers it, so only the rest are met with silence.
 */
export function answeredAlbumAlready(
  connId: string,
  groupId: string | undefined | null,
  now = Date.now()
): boolean {
  if (!groupId) return false
  for (const [k, at] of answered) {
    if (now - at > ALBUM_QUIET_MS) answered.delete(k)
  }
  const key = `${connId}:${groupId}`
  if (answered.has(key)) return true
  answered.set(key, now)
  return false
}

/** For tests, and for a connection that has gone away. */
export function forgetAlbums(): void {
  answered.clear()
}

/** For tests: how many albums are being remembered right now. */
export function albumsRemembered(): number {
  return answered.size
}
