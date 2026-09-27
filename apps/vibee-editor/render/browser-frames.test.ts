import { describe, it, expect } from 'vitest'
import {
  FRAMES_MAX_BUFFERED,
  frameSize,
  serveFrames,
  startScreencast,
  type CdpSocket,
  type FrameViewer,
} from './src/browser/frames'
import { BOOT_SCRIPT, FRAMES_PATH, WATCH_SAID_EN } from './src/browser/skin'

/**
 * LIVE FRAMES WHILE THE VIDEO CONNECTS -- pictures one way, and nothing
 * else on that socket.
 */

function chromium() {
  const sent: Array<{
    method: string
    params: Record<string, unknown>
    sessionId?: string
  }> = []
  let onMessage: (t: string) => void = () => {}
  let closed = false
  const sock: CdpSocket = {
    send: t => void sent.push(JSON.parse(t)),
    close: () => void (closed = true),
    onMessage: fn => void (onMessage = fn),
    onClose: () => {},
  }
  return {
    sent,
    closed: () => closed,
    io: { front: async () => ({ id: 'tab-1' }), connect: async () => sock },
    attached: () =>
      onMessage(JSON.stringify({ id: 1, result: { sessionId: 'S' } })),
    frame: (n: number) =>
      onMessage(
        JSON.stringify({
          method: 'Page.screencastFrame',
          sessionId: 'S',
          params: {
            data: Buffer.from(`jpeg${n}`).toString('base64'),
            sessionId: n,
          },
        })
      ),
  }
}

describe('the screencast, as Chromium speaks it', () => {
  it('ATTACHES, STARTS AT THE SIZE ASKED, AND ACKS EVERY FRAME', async () => {
    const c = chromium()
    const got: string[] = []
    const stop = await startScreencast(
      'pod:9223',
      { width: 400, height: 800 },
      j => got.push(j.toString()),
      c.io
    )
    expect(c.sent[0]).toMatchObject({
      method: 'Target.attachToTarget',
      params: { targetId: 'tab-1', flatten: true },
    })
    c.attached()
    expect(c.sent[1]).toMatchObject({
      method: 'Page.startScreencast',
      sessionId: 'S',
      params: { format: 'jpeg', maxWidth: 400, maxHeight: 800 },
    })
    c.frame(7)
    expect(got).toEqual(['jpeg7'])
    /* Without the ack Chromium sends nothing more. */
    expect(c.sent[2]).toMatchObject({
      method: 'Page.screencastFrameAck',
      params: { sessionId: 7 },
    })
    stop()
    expect(c.sent.at(-1)?.method).toBe('Page.stopScreencast')
    expect(c.closed()).toBe(true)
  })
})

function viewer(buffered = 0) {
  const got: string[] = []
  let onClose: () => void = () => {}
  let closedWith: number | undefined
  const v: FrameViewer = {
    send: d => void got.push(d.toString()),
    get bufferedAmount() {
      return buffered
    },
    close: code => void (closedWith = code),
    onClose: fn => void (onClose = fn),
  }
  return { v, got, closedWith: () => closedWith, hangUp: () => onClose() }
}

describe('frames to the window', () => {
  it('FORWARDS EVERY FRAME to the person window', async () => {
    const c = chromium()
    const w = viewer()
    await serveFrames(w.v, 'pod:9223', { width: 400, height: 800 }, c.io)
    c.attached()
    c.frame(1)
    c.frame(2)
    expect(w.got).toEqual(['jpeg1', 'jpeg2'])
  })

  it('DROPS FRAMES FOR A WINDOW THAT CANNOT KEEP UP, instead of queueing', async () => {
    const c = chromium()
    const w = viewer(FRAMES_MAX_BUFFERED + 1)
    await serveFrames(w.v, 'pod:9223', { width: 400, height: 800 }, c.io)
    c.attached()
    c.frame(1)
    expect(w.got).toEqual([])
    /* Still acked: Chromium keeps sending, the newest frame wins. */
    expect(c.sent.at(-1)?.method).toBe('Page.screencastFrameAck')
  })

  it('STOPS THE SCREENCAST THE MOMENT THE WINDOW HANGS UP', async () => {
    const c = chromium()
    const w = viewer()
    await serveFrames(w.v, 'pod:9223', { width: 400, height: 800 }, c.io)
    c.attached()
    w.hangUp()
    expect(c.sent.at(-1)?.method).toBe('Page.stopScreencast')
    expect(c.closed()).toBe(true)
  })

  it('IS A BRIDGE, NOT A SECOND STREAM: it ends by itself', async () => {
    const c = chromium()
    const w = viewer()
    await serveFrames(w.v, 'pod:9223', { width: 400, height: 800 }, c.io, 20)
    c.attached()
    await new Promise(r => setTimeout(r, 60))
    expect(c.closed()).toBe(true)
    expect(w.closedWith()).toBe(1000)
  })

  it('closes quietly when there is no browser to watch', async () => {
    const w = viewer()
    await serveFrames(w.v, null, { width: 400, height: 800 })
    expect(w.closedWith()).toBe(1011)
  })

  it('never throws when Chromium will not answer', async () => {
    const w = viewer()
    await serveFrames(
      w.v,
      'pod:9223',
      { width: 400, height: 800 },
      {
        front: async () => {
          throw new Error('the browser has no page open')
        },
        connect: async () => {
          throw new Error('unreachable')
        },
      }
    )
    expect(w.closedWith()).toBe(1000)
  })
})

describe('the size asked for', () => {
  it('is kept to what a screen could want', () => {
    expect(frameSize(390 * 3, 700 * 3)).toEqual({ width: 1170, height: 1600 })
    expect(frameSize('x', -1)).toEqual({ width: 800, height: 1200 })
    expect(frameSize(10, 10)).toEqual({ width: 200, height: 200 })
  })
})

describe('the loader asks for them, and lets go', () => {
  function run() {
    const sockets: Array<{
      url: string
      closed: boolean
      onmessage?: (e: unknown) => void
      onclose?: () => void
    }> = []
    class WebSocket {
      url: string
      closed = false
      binaryType = ''
      onmessage?: (e: unknown) => void
      onclose?: () => void
      constructor(url: string) {
        this.url = url
        sockets.push(this)
      }
      close() {
        this.closed = true
      }
    }
    const poster = {
      style: { visibility: '' },
      src: '',
      onload: null as unknown,
    }
    const said = { textContent: '' }
    const hint = { textContent: '' }
    const attrs: Record<string, string> = {}
    const boot = {
      querySelector: (s: string) =>
        s === 'img.poster' ? poster : s === '.said' ? said : hint,
      setAttribute(k: string, v: string) {
        attrs[k] = v
      },
      parentNode: null,
    }
    const timers: Array<() => void> = []
    const document = {
      getElementById: () => boot,
      querySelector: () => null,
      documentElement: {},
    }
    class MutationObserver {
      observe() {}
    }
    const window: Record<string, unknown> = {
      devicePixelRatio: 2,
      WebSocket,
      URL: { createObjectURL: () => 'blob:1' },
    }
    new Function(
      'document',
      'navigator',
      'setTimeout',
      'MutationObserver',
      'location',
      'window',
      'WebSocket',
      'URL',
      'innerWidth',
      'innerHeight',
      BOOT_SCRIPT
    )(
      document,
      { language: 'en' },
      (fn: () => void) => timers.push(fn),
      MutationObserver,
      {
        pathname: '/live/sessAbCd1234/',
        protocol: 'https:',
        host: 'app.t27.ai',
      },
      window,
      WebSocket,
      { createObjectURL: () => 'blob:1', revokeObjectURL() {} },
      390,
      700
    )
    return {
      sockets,
      poster,
      said,
      hint,
      attrs,
      timers,
      window,
      frame: () => sockets[sockets.length - 1]?.onmessage?.({ data: {} }),
      giveUp: () => timers[0]?.(),
    }
  }

  it('OPENS THE FRAMES SOCKET AT THE WINDOW SIZE', () => {
    const r = run()
    expect(r.sockets[0].url).toBe(
      `wss://app.t27.ai/live/sessAbCd1234${FRAMES_PATH}?w=780&h=1400`
    )
  })

  it('paints each frame into the picture under the loader', () => {
    const r = run()
    r.sockets[0].onmessage?.({ data: {} })
    expect(r.poster.src).toBe('blob:1')
    expect(r.poster.style.visibility).toBe('visible')
  })

  it('CLOSES THE SOCKET WHEN THE LOADER LEAVES', () => {
    const r = run()
    r.giveUp()
    expect(r.sockets[0].closed).toBe(true)
  })

  /*
   * The bug the owner saw on 2026-09-27: the page was on screen, dimmed, under
   * a ring -- and forty-five seconds later there was nothing at all, because
   * the picture lives inside the loader and the loader removed itself.
   */
  it('DOES NOT TAKE THE PICTURE AWAY WHEN THE PICTURE IS ALL THERE IS', () => {
    const r = run()
    r.frame()
    r.giveUp()
    expect(r.attrs['data-watch']).toBe('1')
    expect(r.attrs['data-done']).toBeUndefined()
    expect(r.sockets[0].closed).toBe(false)
  })

  it('says plainly what watch mode is, and that control is gone', () => {
    const r = run()
    r.frame()
    r.giveUp()
    expect(r.said.textContent).toBe(WATCH_SAID_EN)
    expect(r.hint.textContent).toContain('Control is unavailable')
  })

  it('still leaves when there was never a picture, so the error underneath shows', () => {
    const r = run()
    r.giveUp()
    expect(r.attrs['data-done']).toBe('1')
    expect(r.attrs['data-watch']).toBeUndefined()
  })

  it('ASKS FOR FRAMES AGAIN when the server caps the screencast mid-watch', () => {
    const r = run()
    r.frame()
    r.giveUp()
    r.sockets[0].onclose?.()
    /* The reconnect is a timer, like every other wait in this script. */
    r.timers[r.timers.length - 1]?.()
    expect(r.sockets.length).toBe(2)
  })

  it('does not reopen a socket after the loader is gone', () => {
    /* No frames ever -> the loader left. A closed socket is then just closed. */
    const r = run()
    r.giveUp()
    r.sockets[0].onclose?.()
    r.timers.forEach(t => t())
    expect(r.sockets.length).toBe(1)
  })

  it('lets the reconnect script use the same rule instead of its own', () => {
    const r = run()
    expect(typeof r.window.__t27GiveUp).toBe('function')
  })
})

describe('the wiring, read as text', () => {
  it('ANSWERS THE FRAMES SOCKET ITSELF, before anything is piped to the pod', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(join(__dirname, 'render-server.ts'), 'utf8')
    const auth = src.indexOf('const decision = await authorizeLive(upgradePool')
    const frames = src.indexOf('=== FRAMES_PATH', auth)
    const pipe = src.indexOf('pipeUpgrade(', auth)
    expect(auth).toBeGreaterThan(-1)
    /* After the same door as the video, before the pipe to the pod. */
    expect(frames).toBeGreaterThan(auth)
    expect(frames).toBeLessThan(pipe)
  })
})
