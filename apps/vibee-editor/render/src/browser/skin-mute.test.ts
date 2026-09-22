import { describe, it, expect, afterEach } from 'vitest'
import { injectSkin, MUTE_SCRIPT } from './skin'

/*
 * A page with one video, written by hand: the script only needs the
 * document's listeners, a query for media and the element's own fields.
 */
function runIn(search: string) {
  const listeners: Record<string, (e: { target: unknown }) => void> = {}
  const video = { tagName: 'VIDEO', muted: false, defaultMuted: false }
  const g = globalThis as Record<string, unknown>
  g.location = { search }
  g.document = {
    documentElement: {},
    addEventListener: (k: string, f: (e: { target: unknown }) => void) => {
      listeners[k] = f
    },
    querySelectorAll: () => [video],
  }
  g.MutationObserver = class {
    observe() {}
  }
  // eslint-disable-next-line no-eval
  ;(0, eval)(MUTE_SCRIPT)
  return { video, listeners }
}

afterEach(() => {
  const g = globalThis as Record<string, unknown>
  delete g.location
  delete g.document
  delete g.MutationObserver
})

describe('the browser window is silent by default', () => {
  it('mutes the stream before anything plays', () => {
    const { video } = runIn('')
    expect(video.muted).toBe(true)
    expect(video.defaultMuted).toBe(true)
  })

  it('mutes it again when the viewer unmutes it by itself', () => {
    const { video, listeners } = runIn('?t=x')
    video.muted = false
    listeners.volumechange({ target: video })
    expect(video.muted).toBe(true)
  })

  it('plays sound only when asked for on the address', () => {
    const { video } = runIn('?t=x&sound=1')
    expect(video.muted).toBe(false)
  })

  it('is in every dressed window', () => {
    const html = injectSkin(
      '<html><head><script src="app.js"></script></head><body></body></html>'
    )
    expect(html).toContain('data-t27-mute')
  })
})
