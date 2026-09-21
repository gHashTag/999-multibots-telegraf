import { describe, it, expect } from 'vitest'
import { listenForTouchInside, type FrameWindowLike } from './frameTouch'

/**
 * A tap on the picture has to hand the wheel to the person, although events
 * inside a frame never bubble out of it.
 */

function target() {
  const handlers = new Map<string, Set<() => void>>()
  const win: FrameWindowLike & { fire(type: string): void; count(): number } = {
    addEventListener(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set())
      handlers.get(type)!.add(fn)
    },
    removeEventListener(type, fn) {
      handlers.get(type)?.delete(fn)
    },
    fire(type) {
      for (const fn of handlers.get(type) ?? []) fn()
    },
    count() {
      let n = 0
      for (const set of handlers.values()) n += set.size
      return n
    },
  }
  return win
}

function scene(opts: { reachable?: boolean } = {}) {
  const inner = target()
  const frame = {
    get contentWindow() {
      if (opts.reachable === false) throw new Error('cross-origin')
      return inner
    },
  }
  const hostEvents = target()
  const host = Object.assign(hostEvents, {
    document: { activeElement: null as unknown },
  })
  let touches = 0
  const stop = listenForTouchInside(frame, host, () => touches++)
  return { inner, frame, host, stop, touches: () => touches }
}

describe('a touch inside the picture', () => {
  it('HANDS THE WHEEL OVER on a press inside the frame', () => {
    const s = scene()
    s.inner.fire('pointerdown')
    expect(s.touches()).toBe(1)
  })

  it('and on a key pressed inside it', () => {
    const s = scene()
    s.inner.fire('keydown')
    expect(s.touches()).toBe(1)
  })

  it('still notices through focus when the frame cannot be reached', () => {
    const s = scene({ reachable: false })
    s.host.document.activeElement = s.frame
    s.host.fire('blur')
    expect(s.touches()).toBe(1)
  })

  it('does not take a blur elsewhere for a touch', () => {
    const s = scene()
    s.host.document.activeElement = null
    s.host.fire('blur')
    expect(s.touches()).toBe(0)
  })

  it('lets go of everything it listened to', () => {
    const s = scene()
    s.stop()
    expect(s.inner.count()).toBe(0)
    expect(s.host.count()).toBe(0)
    s.inner.fire('pointerdown')
    expect(s.touches()).toBe(0)
  })
})
