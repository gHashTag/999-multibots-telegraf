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

  it('still answers for player media, and for /game/ on another origin', () => {
    expect(fetchFor('https://app.t27.ai/lipsync/x.mp4')).toHaveBeenCalledTimes(
      1
    )
    expect(
      fetchFor('https://cdn.example.com/game/a.png')
    ).toHaveBeenCalledTimes(1)
    // The boundary is the directory, not the prefix: /gameplay.png is player media.
    expect(fetchFor('https://app.t27.ai/gameplay.png')).toHaveBeenCalledTimes(1)
  })
})
