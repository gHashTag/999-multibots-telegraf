import { describe, it, expect, afterEach } from 'vitest'
import { injectSkin, MUTE_SCRIPT, TOUCH_REPORT_SCRIPT } from './skin'

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

describe('the window reports what a tap met', () => {
  it('is valid script, carries the window s event name, and is injected', () => {
    expect(() => new Function(TOUCH_REPORT_SCRIPT)).not.toThrow()
    expect(TOUCH_REPORT_SCRIPT).toContain('"t27-browser"')
    expect(TOUCH_REPORT_SCRIPT).toContain('split(/\\s+/)')
    expect(injectSkin('<html><head></head><body></body></html>')).toContain(
      'data-t27-touch'
    )
  })
})

describe('a sound that is not in the page', () => {
  function world(search = '') {
    const g = globalThis as Record<string, unknown>
    const played: string[] = []
    class FakeMedia {
      muted = false
      defaultMuted = false
      tagName = 'AUDIO'
      src = ''
      play() {
        played.push(this.muted ? 'muted' : 'LOUD')
        return Promise.resolve()
      }
    }
    class FakeCtx {
      state = 'running'
      suspend() {
        this.state = 'suspended'
        return Promise.resolve()
      }
      resume() {
        this.state = 'running'
        return Promise.resolve()
      }
    }
    g.location = { search }
    g.document = {
      documentElement: {},
      addEventListener: () => {},
      querySelectorAll: () => [],
    }
    g.MutationObserver = class {
      observe() {}
    }
    g.window = g
    g.HTMLMediaElement = FakeMedia
    g.Audio = FakeMedia
    g.AudioContext = FakeCtx
    // eslint-disable-next-line no-eval
    ;(0, eval)(MUTE_SCRIPT)
    return { played, g }
  }

  it('a chime made with new Audio() is born muted', () => {
    const { played, g } = world()
    const made = new (g.Audio as new (src?: string) => {
      muted: boolean
      play: () => void
    })('connected.mp3')
    expect(made.muted).toBe(true)
    made.play()
    expect(played).toEqual(['muted'])
  })

  it('play() mutes even an element nobody muted', () => {
    const { played, g } = world()
    const Media = g.HTMLMediaElement as new () => { play: () => void }
    const el = new Media()
    el.play()
    expect(played).toEqual(['muted'])
  })

  it('a Web Audio beep is stopped at birth', () => {
    const { g } = world()
    const ctx = new (g.AudioContext as new () => { state: string })()
    expect(ctx.state).toBe('suspended')
  })

  it('with ?sound=1 nothing is touched', () => {
    const { played, g } = world('?sound=1')
    const made = new (g.Audio as new () => {
      muted: boolean
      play: () => void
    })()
    expect(made.muted).toBe(false)
    made.play()
    expect(played).toEqual(['LOUD'])
  })
})
