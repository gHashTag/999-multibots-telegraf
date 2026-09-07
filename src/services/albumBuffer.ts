/**
 * AN ALBUM IS ONE MESSAGE TO A PERSON AND TEN TO TELEGRAM.
 *
 * When somebody selects several photos and sends them together, Telegram
 * delivers them as SEPARATE updates that share a `media_group_id`. Only one of
 * them carries the caption.
 *
 * Without this, the agent chat treated each part as its own turn: five photos
 * became five questions, five trips to the model and five answers, four of them
 * about a picture with no question attached. The caption reached whichever part
 * happened to carry it, so "which of these is sharper?" arrived alone with one
 * photo while the other four arrived mute.
 *
 * WHY A PROMISE AND NOT A CALLBACK
 *
 * The alternative was a callback that fires when the group is complete -- which
 * would mean lifting the entire "ask the agent, answer the person" block out of
 * the middleware so the callback could call it. Awaiting instead keeps that
 * flow linear: the FIRST part waits for its group and then continues exactly as
 * a single file does, and later parts return `null` and stop. One code path,
 * not two.
 *
 * WHY A TIMER AND NOT A COUNT
 *
 * Nothing in an album update says how many parts are coming -- there is no
 * "3 of 5". The only signal that a group is complete is that no further part
 * has arrived for a moment. So the buffer waits a short window after the LAST
 * part, not the first.
 *
 * WHY THE WINDOW RESTARTS
 *
 * Parts arrive within a few hundred milliseconds of each other, but not evenly.
 * A fixed window from the first part would cut a slow album in half and answer
 * about the wrong set. Restarting on each part follows the burst; the ceiling
 * below is what stops a trickle from holding a turn open forever.
 *
 * WHY THE STATE IS IN MEMORY, AND WHAT THAT COSTS
 *
 * A restart mid-album loses the buffered parts. That is the right trade: the
 * alternative is a database write per photo to protect a case measured in
 * seconds, and a lost album is VISIBLE -- the person gets no answer and sends
 * again -- whereas a half-flushed album stored durably would answer about the
 * wrong set and look correct.
 */

/** What Telegram sends us, narrowed to what this file needs. */
export interface AlbumPart {
  media_group_id?: string
  caption?: string
  text?: string
}

export interface AlbumBufferOptions {
  /**
   * How long to wait after the last part before deciding the album is done.
   *
   * 1200 ms: parts land within a few hundred milliseconds of each other, so
   * this sits comfortably above the gap. It is also the delay a person waits
   * before an album is answered -- a single file never enters the buffer, so
   * nothing else pays for it.
   */
  windowMs?: number
  /**
   * Hard ceiling on parts. Telegram allows ten in an album; more than that
   * means something is wrong, and a buffer that grows without a limit is a
   * memory leak with a friendly name.
   */
  maxParts?: number
  /** Injected so tests do not wait in real time. */
  setTimer?: (fn: () => void, ms: number) => any
  clearTimer?: (handle: any) => void
}

export interface AlbumBuffer {
  /**
   * Offer a message to the buffer.
   *
   * Resolves with every part of the album for the FIRST part of a group, and
   * with the message alone when it is not part of one. Resolves with `null`
   * for every later part -- that part has been absorbed, and its caller must
   * stop, or the album would be answered once per photo.
   */
  collect(key: string, message: AlbumPart): Promise<AlbumPart[] | null>
  /** Groups currently waiting. For tests and for a health line. */
  pending(): number
}

export function createAlbumBuffer(
  options: AlbumBufferOptions = {}
): AlbumBuffer {
  const windowMs = options.windowMs ?? 1200
  const maxParts = options.maxParts ?? 10
  const setTimer = options.setTimer ?? setTimeout
  const clearTimer = options.clearTimer ?? clearTimeout

  interface Group {
    parts: AlbumPart[]
    timer: any
    done: (parts: AlbumPart[]) => void
  }
  const groups = new Map<string, Group>()

  function flush(groupKey: string) {
    const group = groups.get(groupKey)
    if (!group) return
    // Removed BEFORE the resolve: a part arriving during the handler must
    // start a new group rather than join one that has already been answered.
    groups.delete(groupKey)
    clearTimer(group.timer)
    group.done(group.parts)
  }

  return {
    collect(key, message) {
      const id = message?.media_group_id
      if (!id) return Promise.resolve([message])

      const groupKey = `${key}:${id}`
      const existing = groups.get(groupKey)

      if (existing) {
        existing.parts.push(message)
        /*
         * At the ceiling, flush NOW rather than waiting out the window.
         * Waiting would add a second of silence to the largest album, which is
         * the one a person is most likely to be watching.
         */
        if (existing.parts.length >= maxParts) flush(groupKey)
        else {
          // The window follows the burst: restart it on every part.
          clearTimer(existing.timer)
          existing.timer = setTimer(() => flush(groupKey), windowMs)
        }
        // Absorbed. The first part's promise carries this one too.
        return Promise.resolve(null)
      }

      return new Promise<AlbumPart[]>(resolve => {
        groups.set(groupKey, {
          parts: [message],
          timer: setTimer(() => flush(groupKey), windowMs),
          done: resolve,
        })
      })
    },

    pending() {
      return groups.size
    },
  }
}

/**
 * The one caption an album carries.
 *
 * Telegram puts it on a single part -- usually the first, but that is not
 * promised anywhere, so every part is checked. Joining several would be wrong
 * in the other direction: a person writes one caption, and stitching together
 * whatever happens to be present produces stray text nobody typed.
 */
export function albumCaption(parts: AlbumPart[]): string {
  for (const part of parts) {
    const text = (part?.caption ?? part?.text ?? '').trim()
    if (text) return text
  }
  return ''
}
