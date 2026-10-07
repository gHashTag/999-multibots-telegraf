/**
 * browser-tab-strip.t27 v2, SOCKETS_PER_POLL: which tab is in front is asked
 * over ONE browser socket per read, not one per page. Held against a real
 * WebSocket server that counts connections and answers CDP like a pod would.
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocketServer } from 'ws'
import * as SPEC from '../spec/browser-tab-strip.gen'
import { visiblePages } from './cdp'

interface FakePod {
  endpoint: string
  sockets: () => number
  /** The upgrade path of every socket: the BROWSER's, never a page's. */
  paths: () => string[]
  close: () => Promise<void>
}

const running: FakePod[] = []

afterEach(async () => {
  while (running.length) await running.pop()!.close()
})

/**
 * A pod whose front page is `front`; `silent` pages refuse the attach, `hung`
 * pages attach and then never answer the evaluate (a renderer stuck in an
 * alert() or a busy loop).
 */
async function fakePod(
  front: string,
  silent: string[] = [],
  hung: string[] = []
): Promise<FakePod> {
  let connections = 0
  const paths: string[] = []
  const http: Server = createServer((req, res) => {
    const { port } = http.address() as AddressInfo
    res.setHeader('content-type', 'application/json')
    res.end(
      JSON.stringify({
        webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/browser/x`,
      })
    )
  })
  const wss = new WebSocketServer({ server: http })
  wss.on('connection', (ws, req) => {
    connections += 1
    paths.push(String(req.url))
    ws.on('message', raw => {
      const msg = JSON.parse(String(raw)) as {
        id: number
        method: string
        params: Record<string, unknown>
        sessionId?: string
      }
      const answer = (result: Record<string, unknown>) =>
        ws.send(JSON.stringify({ id: msg.id, result }))
      if (msg.method === 'Target.attachToTarget') {
        const target = String(msg.params.targetId)
        if (silent.includes(target))
          return ws.send(
            JSON.stringify({ id: msg.id, error: { message: 'no target' } })
          )
        return answer({ sessionId: `s-${target}` })
      }
      if (msg.method === 'Runtime.evaluate') {
        const target = String(msg.sessionId).replace(/^s-/, '')
        if (hung.includes(target)) return
        return answer({
          result: { value: target === front ? 'visible' : 'hidden' },
        })
      }
      answer({})
    })
  })
  await new Promise<void>(r => http.listen(0, '127.0.0.1', () => r()))
  const { port } = http.address() as AddressInfo
  const pod: FakePod = {
    endpoint: `127.0.0.1:${port}`,
    sockets: () => connections,
    paths: () => paths,
    close: () =>
      new Promise<void>(r => {
        for (const c of wss.clients) c.terminate()
        wss.close(() => http.close(() => r()))
      }),
  }
  running.push(pod)
  return pod
}

describe('visiblePages: one socket per poll', () => {
  it('asks twelve pages over one connection and finds the front one', async () => {
    const ids = Array.from({ length: SPEC.MAX_TABS_SHOWN }, (_, i) => `p${i}`)
    const pod = await fakePod('p7')
    const visible = await visiblePages(pod.endpoint, ids)
    expect([...visible]).toEqual(['p7'])
    expect(pod.sockets()).toBe(SPEC.SOCKETS_PER_POLL)
    /* A page socket is silent on this pod; only the browser's answers. */
    expect(pod.paths()).toEqual(['/devtools/browser/x'])
  })

  it('a page that attaches and never answers is not visible, within the probe', async () => {
    const pod = await fakePod('b', [], ['a'])
    const started = Date.now()
    const visible = await visiblePages(pod.endpoint, ['a', 'b', 'c'])
    const took = Date.now() - started
    expect([...visible]).toEqual(['b'])
    /* The probe, not the 20 s call timeout, bounds the read. */
    expect(took).toBeGreaterThanOrEqual(SPEC.VISIBILITY_PROBE_MS - 50)
    expect(took).toBeLessThan(SPEC.VISIBILITY_CACHE_MS + 1000)
    expect(pod.sockets()).toBe(SPEC.SOCKETS_PER_POLL)
  })

  it('a hung FRONT page counts as not visible once the probe runs out', async () => {
    const pod = await fakePod('a', [], ['a'])
    const visible = await visiblePages(pod.endpoint, ['a', 'b'], undefined, 100)
    expect(visible.size).toBe(0)
  })

  it('a page that does not answer is not visible, and costs no extra socket', async () => {
    const pod = await fakePod('b', ['a'])
    const visible = await visiblePages(pod.endpoint, ['a', 'b', 'c'])
    expect([...visible]).toEqual(['b'])
    expect(pod.sockets()).toBe(SPEC.SOCKETS_PER_POLL)
  })

  it('no pages, no socket', async () => {
    const pod = await fakePod('a')
    expect((await visiblePages(pod.endpoint, [])).size).toBe(0)
    expect(pod.sockets()).toBe(0)
  })
})
