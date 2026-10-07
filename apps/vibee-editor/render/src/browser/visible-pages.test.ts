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
  close: () => Promise<void>
}

const running: FakePod[] = []

afterEach(async () => {
  while (running.length) await running.pop()!.close()
})

/** A pod whose front page is `front`; `silent` pages never answer. */
async function fakePod(front: string, silent: string[] = []): Promise<FakePod> {
  let connections = 0
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
  wss.on('connection', ws => {
    connections += 1
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
