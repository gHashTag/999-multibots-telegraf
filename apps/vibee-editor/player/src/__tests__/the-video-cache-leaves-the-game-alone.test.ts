import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * THE PLAYER'S WORKER LEAVES THE GAME ALONE.
 *
 * `public/sw-video-cache.js` is registered at `/sw-video-cache.js`, so its
 * scope is the whole origin, and it answers any request whose path ends in a
 * video or image extension from its own cache. The Queen game is to be served
 * from `/game/` on this same origin; its images must go to the network as the
 * game asked, not through the player's cache.
 *
 * The worker file is run as it ships, with a fake `self`, and its fetch
 * listener is called directly.
 */
const source = fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'sw-video-cache.js'),
  'utf8'
)

function loadWorker(origin: string) {
  const listeners = new Map<string, (event: unknown) => void>()
  const self = {
    location: { origin },
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      listeners.set(type, fn)
    },
  }
  // Never resolves: the test asks whether the worker answers, not what with.
  const caches = { open: () => new Promise(() => {}) }
  new Function('self', 'caches', source)(self, caches)

  return (url: string) => {
    const respondWith = vi.fn()
    listeners.get('fetch')!({
      request: { url, method: 'GET', headers: new Headers() },
      respondWith,
    })
    return respondWith
  }
}

describe('the video cache worker and the game', () => {
  const fetchFor = loadWorker('https://app.t27.ai')

  it('does not answer for the game under /game/ on its own origin', () => {
    expect(fetchFor('https://app.t27.ai/game/a.png')).not.toHaveBeenCalled()
  })

  it("still answers for this origin's media", () => {
    expect(fetchFor('https://app.t27.ai/lipsync/x.mp4')).toHaveBeenCalledTimes(
      1
    )
    // The boundary is the directory, not the prefix: /gameplay.png is player media.
    expect(fetchFor('https://app.t27.ai/gameplay.png')).toHaveBeenCalledTimes(1)
  })

  /**
   * This case used to assert the opposite, and it was right about the rule it
   * was testing: the `/game/` skip is scoped to THIS origin, so a CDN path that
   * merely says `/game/` was not meant to inherit it. What it pinned as a side
   * effect was that the worker answers for other origins at all - and that was
   * the defect. Matching on the PATH ending in an image extension, whatever the
   * host, meant `https://github.com/<login>.png` was taken over by a cache
   * built for this origin's video, re-fetched by URL string (mode 'cors' where
   * an <img> sends 'no-cors'), and failed for every host that sends no
   * Access-Control-Allow-Origin. Every remote image in the app was broken.
   *
   * Measured 2026-09-23: the same avatar loaded on t27.ai, which registers no
   * worker, and failed on app.t27.ai, which registers this one.
   */
  it('leaves other origins alone, whatever their path says', () => {
    expect(
      fetchFor('https://cdn.example.com/game/a.png')
    ).not.toHaveBeenCalled()
    expect(fetchFor('https://github.com/someone.png')).not.toHaveBeenCalled()
    expect(fetchFor('https://cdn.example.com/clip.mp4')).not.toHaveBeenCalled()
  })

  it('keeps the one cross-origin case it proxies on purpose', () => {
    // Telegram user pictures: their host answers no cross-origin request, so
    // the worker routes them through the render proxy instead of dropping them.
    expect(
      fetchFor('https://t.me/i/userpic/320/abc.jpg')
    ).toHaveBeenCalledTimes(1)
  })
})
