/**
 * ONE WINDOW SHAPES THE SCREEN: THE ONE BEING LOOKED AT.
 *
 * Measured on the pod 2026-09-21 22:04: the video pipeline torn down and
 * rebuilt more than ten times in a minute, while the owner had the app's
 * Browser tab kept (hidden, 0 x 0) and the Queen's BROWSER tab open, and saw
 * a black window. Every size request restarts the video, even a refused one,
 * and a hidden frame's 0 was read as "the smallest screen there is".
 *
 * The window's script is RUN here, in a sandbox with a fake window, document
 * and fetch -- not read for reassuring lines.
 */
import { describe, it, expect } from 'vitest'
import vm from 'node:vm'
import { FIT_SCRIPT } from './src/browser/skin'
import { isVisibleBox } from './src/browser/screen'
import { FIT_PATH } from './src/browser/live-pipe'

function sandbox(start: { w: number; h: number; visible: boolean }) {
  const sent: string[] = []
  const on: Record<string, Array<() => void>> = {}
  const docOn: Record<string, Array<() => void>> = {}
  let pending: (() => void) | null = null
  const window = {
    innerWidth: start.w,
    innerHeight: start.h,
    addEventListener: (name: string, fn: () => void) => {
      ;(on[name] ||= []).push(fn)
    },
  }
  const document = {
    visibilityState: start.visible ? 'visible' : 'hidden',
    addEventListener: (name: string, fn: () => void) => {
      ;(docOn[name] ||= []).push(fn)
    },
  }
  const context = {
    window,
    document,
    location: { pathname: '/live/sessAbc' },
    fetch: (url: string) => {
      sent.push(url)
      return Promise.resolve()
    },
    /* The debounce, run by hand: `settle()` fires what is waiting. */
    setTimeout: (fn: () => void) => {
      pending = fn
      return 1
    },
    clearTimeout: () => {
      pending = null
    },
  }
  vm.runInNewContext(FIT_SCRIPT, context)
  const settle = () => {
    const fn = pending
    pending = null
    fn?.()
  }
  return {
    sent,
    resize(w: number, h: number) {
      window.innerWidth = w
      window.innerHeight = h
      on.resize?.forEach(fn => fn())
      settle()
    },
    setVisible(visible: boolean) {
      document.visibilityState = visible ? 'visible' : 'hidden'
      docOn.visibilitychange?.forEach(fn => fn())
      settle()
    },
  }
}

describe('a box nobody is looking at is not a request', () => {
  it.each([
    [0, 0],
    [0, 800],
    [1000, 1],
    [NaN, 800],
    [Number(null), Number(null)],
  ])('%s x %s is ignored', (width, height) => {
    expect(isVisibleBox({ width, height })).toBe(false)
  })

  it('a real box is a request', () => {
    expect(isVisibleBox({ width: 360, height: 640 })).toBe(true)
  })
})

describe("the window's own script", () => {
  it('a visible window asks once for its shape', () => {
    const s = sandbox({ w: 1000, h: 800, visible: true })
    expect(s.sent).toEqual([`/live/sessAbc${FIT_PATH}?w=1000&h=800`])
  })

  it('A HIDDEN FRAME (0 x 0) ASKS FOR NOTHING', () => {
    const s = sandbox({ w: 1000, h: 800, visible: true })
    s.resize(0, 0)
    expect(s.sent).toHaveLength(1)
  })

  it('shown again at the same size, it takes the screen back once', () => {
    const s = sandbox({ w: 1000, h: 800, visible: true })
    s.resize(0, 0)
    s.resize(1000, 800)
    expect(s.sent).toHaveLength(2)
    expect(s.sent[1]).toContain('w=1000&h=800')
    s.resize(1000, 800)
    expect(s.sent).toHaveLength(2)
  })

  it('a background tab asks for nothing, and asks once when it comes back', () => {
    const s = sandbox({ w: 1200, h: 700, visible: false })
    expect(s.sent).toHaveLength(0)
    s.resize(1300, 700)
    expect(s.sent).toHaveLength(0)
    s.setVisible(true)
    expect(s.sent).toEqual([`/live/sessAbc${FIT_PATH}?w=1300&h=700`])
  })
})

describe('through the real proxy', () => {
  it('a hidden box never reaches the pod', async () => {
    const http = await import('node:http')
    const { pipeHttp } = await import('./src/browser/live-pipe')
    let podHits = 0
    const pod = http.createServer((_req, res) => {
      podHits++
      res.end('{}')
    })
    await new Promise<void>(r => pod.listen(0, '127.0.0.1', r))
    const podPort = (pod.address() as { port: number }).port
    const proxy = http.createServer((req, res) =>
      pipeHttp(
        {
          endpoint: `127.0.0.1:${podPort}`,
          upstreamPath: req.url || '/',
          sessionId: 'sessAbc',
          viewToken: 'x',
          adminToken: 'admin',
        },
        req,
        res
      )
    )
    await new Promise<void>(r => proxy.listen(0, '127.0.0.1', r))
    const base = `http://127.0.0.1:${(proxy.address() as { port: number }).port}`
    try {
      const r = await fetch(`${base}${FIT_PATH}?w=0&h=0`, { method: 'POST' })
      expect(await r.json()).toEqual({ ok: true, ignored: 'hidden' })
      expect(podHits).toBe(0)
    } finally {
      proxy.close()
      pod.close()
    }
  })
})
