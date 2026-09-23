import { describe, it, expect } from 'vitest'
import { listenForTouchInside, type FrameWindowLike } from './frameTouch'

/**
 * A tap on the picture has to hand the wheel to the person, although events
 * inside a frame never bubble out of it.
 */

function target() {
  const handlers = new Map<string, Set<(event: unknown) => void>>()
  const win: FrameWindowLike & {
    fire(type: string, event?: unknown): void
    count(): number
  } = {
    addEventListener(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set())
      handlers.get(type)!.add(fn)
    },
    removeEventListener(type, fn) {
      handlers.get(type)?.delete(fn)
    },
    fire(type, event?: unknown) {
      for (const fn of handlers.get(type) ?? []) fn(event ?? { type })
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
  it('HANDS THE WHEEL OVER on a click inside the frame', () => {
    const s = scene()
    s.inner.fire('pointerdown', {
      type: 'pointerdown',
      clientX: 40,
      clientY: 40,
    })
    s.inner.fire('pointerup', { type: 'pointerup', clientX: 41, clientY: 40 })
    expect(s.touches()).toBe(1)
  })

  /* Owner, 2026-09-23: watching the agent must not interrupt it. */
  it('takes nothing from a press alone, or from a drag across the picture', () => {
    const s = scene()
    s.inner.fire('pointerdown', {
      type: 'pointerdown',
      clientX: 40,
      clientY: 40,
    })
    expect(s.touches()).toBe(0)
    s.inner.fire('pointerup', { type: 'pointerup', clientX: 400, clientY: 300 })
    expect(s.touches()).toBe(0)
  })

  it('and on a key pressed inside it', () => {
    const s = scene()
    s.inner.fire('keydown', { type: 'keydown' })
    expect(s.touches()).toBe(1)
  })

  /*
   * The focus path is gone on purpose (owner, 2026-09-23): a pointer
   * entering the picture moves focus into the frame, and that was taking
   * the wheel from the agent while the person was only watching.
   */
  it('a pointer merely entering the picture takes nothing', () => {
    const s = scene()
    s.host.document.activeElement = s.frame
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
