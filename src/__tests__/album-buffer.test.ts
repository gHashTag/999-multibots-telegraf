import { describe, it, expect, vi } from 'vitest'
import { createAlbumBuffer, albumCaption } from '@/services/albumBuffer'

/**
 * SEVERAL PHOTOS SENT TOGETHER ARE ONE MESSAGE.
 *
 * Telegram delivers an album as separate updates sharing a `media_group_id`,
 * and only one carries the caption. Three failures matter here and they cost
 * differently:
 *
 *   every part answered separately -- five trips to the model and five answers,
 *   four of them about a picture with no question attached;
 *   a part answered TWICE, because the buffer resolved for more than one
 *   caller;
 *   an album that never completes, holding the person's turn open forever.
 */

/** A timer the test drives by hand, so nothing waits in real time. */
function fakeClock() {
  let now = 0
  const jobs: Array<{
    at: number
    fn: () => void
    id: number
    dead?: boolean
  }> = []
  let nextId = 1
  return {
    setTimer: (fn: () => void, ms: number) => {
      const id = nextId++
      jobs.push({ at: now + ms, fn, id })
      return id
    },
    clearTimer: (id: number) => {
      const job = jobs.find(j => j.id === id)
      if (job) job.dead = true
    },
    async advance(ms: number) {
      now += ms
      for (const job of [...jobs]) {
        if (!job.dead && job.at <= now) {
          job.dead = true
          job.fn()
        }
      }
      // Let the promises the timers resolved actually settle.
      await Promise.resolve()
      await Promise.resolve()
    },
  }
}

const photo = (group?: string, caption?: string) => ({
  media_group_id: group,
  caption,
  photo: [{ file_id: 'f', file_unique_id: 'u' }],
})

describe('a message that is not part of an album', () => {
  it('passes straight through, alone and immediately', async () => {
    const clock = fakeClock()
    const buffer = createAlbumBuffer(clock)
    const one = photo(undefined, 'просто фото')

    // No clock advance at all: a single file must not wait for the window.
    await expect(buffer.collect('chat', one)).resolves.toEqual([one])
    expect(buffer.pending()).toBe(0)
  })
})

describe('gathering an album', () => {
  it('the first part waits and returns every part', async () => {
    const clock = fakeClock()
    const buffer = createAlbumBuffer({ ...clock, windowMs: 1000 })

    const first = buffer.collect('chat', photo('g', 'какая резче?'))
    let settled = false
    void first.then(() => (settled = true))

    expect(await buffer.collect('chat', photo('g'))).toBeNull()
    expect(await buffer.collect('chat', photo('g'))).toBeNull()
    expect(settled).toBe(false)

    await clock.advance(1000)
    const parts = await first
    expect(parts).toHaveLength(3)
    expect(buffer.pending()).toBe(0)
  })

  /*
   * THE DOUBLE-ANSWER ONE. Only the first part may resolve with the group;
   * if a later part resolved too, the album would be answered once per photo,
   * which is the bug this exists to fix wearing a different hat.
   */
  it('later parts resolve null, so the album is answered once', async () => {
    const clock = fakeClock()
    const buffer = createAlbumBuffer({ ...clock, windowMs: 500 })

    const first = buffer.collect('chat', photo('g'))
    const second = await buffer.collect('chat', photo('g'))
    const third = await buffer.collect('chat', photo('g'))

    expect(second).toBeNull()
    expect(third).toBeNull()
    await clock.advance(500)
    expect(await first).toHaveLength(3)
  })

  /*
   * Parts do not arrive evenly. A fixed window from the FIRST part would cut a
   * slow album in half and answer about the wrong set.
   */
  it('the window restarts on every part, so a slow album stays whole', async () => {
    const clock = fakeClock()
    const buffer = createAlbumBuffer({ ...clock, windowMs: 1000 })

    const first = buffer.collect('chat', photo('g'))
    await clock.advance(800)
    await buffer.collect('chat', photo('g'))
    await clock.advance(800)
    await buffer.collect('chat', photo('g'))
    await clock.advance(1000)

    expect(await first).toHaveLength(3)
  })

  /*
   * ...but a restart on every part must not let a trickle hold the turn open
   * forever, so the ceiling flushes immediately rather than waiting again.
   */
  it('at the ceiling it flushes at once instead of waiting again', async () => {
    const clock = fakeClock()
    const buffer = createAlbumBuffer({
      ...clock,
      windowMs: 10_000,
      maxParts: 3,
    })

    const first = buffer.collect('chat', photo('g'))
    await buffer.collect('chat', photo('g'))
    await buffer.collect('chat', photo('g'))

    // No advance: reaching the cap is itself the signal.
    expect(await first).toHaveLength(3)
    expect(buffer.pending()).toBe(0)
  })

  it('two chats sending albums at once do not mix', async () => {
    const clock = fakeClock()
    const buffer = createAlbumBuffer({ ...clock, windowMs: 500 })

    const a = buffer.collect('chat-a', photo('g', 'из A'))
    const b = buffer.collect('chat-b', photo('g', 'из B'))
    await buffer.collect('chat-a', photo('g'))

    await clock.advance(500)
    expect(await a).toHaveLength(2)
    expect(await b).toHaveLength(1)
  })

  it('two albums in one chat do not mix', async () => {
    const clock = fakeClock()
    const buffer = createAlbumBuffer({ ...clock, windowMs: 500 })

    const first = buffer.collect('chat', photo('g1'))
    const second = buffer.collect('chat', photo('g2'))
    await buffer.collect('chat', photo('g1'))

    await clock.advance(500)
    expect(await first).toHaveLength(2)
    expect(await second).toHaveLength(1)
  })

  /*
   * A part arriving after its group was answered must start a NEW group rather
   * than join one that has already been flushed -- otherwise it would be
   * silently dropped and the person would never hear about that photo.
   */
  it('a late straggler starts a new group instead of vanishing', async () => {
    const clock = fakeClock()
    const buffer = createAlbumBuffer({ ...clock, windowMs: 500 })

    const first = buffer.collect('chat', photo('g'))
    await clock.advance(500)
    expect(await first).toHaveLength(1)

    const late = buffer.collect('chat', photo('g'))
    await clock.advance(500)
    expect(await late).toHaveLength(1)
  })

  it('nothing is left pending once the window passes', async () => {
    const clock = fakeClock()
    const buffer = createAlbumBuffer({ ...clock, windowMs: 100 })
    const first = buffer.collect('chat', photo('g'))
    expect(buffer.pending()).toBe(1)
    await clock.advance(100)
    await first
    expect(buffer.pending()).toBe(0)
  })
})

describe('the caption an album carries', () => {
  /*
   * Telegram puts the caption on ONE part -- usually the first, but that is not
   * promised anywhere.
   */
  it('is found wherever it sits', () => {
    expect(
      albumCaption([photo('g'), photo('g', 'какая резче?'), photo('g')])
    ).toBe('какая резче?')
    expect(albumCaption([photo('g', 'первая'), photo('g')])).toBe('первая')
  })

  it('an album with no caption yields an empty string, not undefined', () => {
    expect(albumCaption([photo('g'), photo('g')])).toBe('')
  })

  /*
   * The first NON-EMPTY one, not merely the first present: a part can carry an
   * empty caption, and returning it would lose the real question.
   */
  it('an empty caption does not shadow a real one', () => {
    expect(albumCaption([photo('g', '   '), photo('g', 'настоящая')])).toBe(
      'настоящая'
    )
  })

  it('a plain text message is its own caption', () => {
    expect(albumCaption([{ text: 'написано текстом' }])).toBe(
      'написано текстом'
    )
  })
})
