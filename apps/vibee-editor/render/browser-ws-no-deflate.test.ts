import { describe, it, expect } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { pipeUpgrade } from './src/browser/live-pipe'

/**
 * NO COMPRESSION ON THE VIEWER'S SOCKET, NEGOTIATED BY ANYBODY.
 *
 * Measured in production with a real WebSocket client:
 *   "Invalid WebSocket frame: RSV1 must be clear" after the FIRST message,
 *   and no Sec-WebSocket-Extensions in the 101 -- even when the client never
 *   offered compression. A hop in between made its own offer, we passed it
 *   to the pod, the pod compressed, and the browser was never told. The
 *   picture never started.
 *
 * Locally there is no such hop, so a test that only checks messages flow
 * would pass with or without the fix. This checks the thing that matters:
 * the pod is never OFFERED compression, so it cannot agree to it.
 */

async function listen(server: http.Server): Promise<number> {
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()))
  return (server.address() as AddressInfo).port
}

describe('the viewer socket is never compressed', () => {
  it('DOES NOT OFFER THE POD COMPRESSION, whatever the client asked', async () => {
    const { WebSocketServer, WebSocket } = await import('ws')

    /* The pod: willing to compress, and it records what it was offered. */
    let offered: string | undefined = 'not-seen'
    const pod = http.createServer()
    const podWss = new WebSocketServer({
      noServer: true,
      perMessageDeflate: true,
    })
    pod.on('upgrade', (req, socket, head) => {
      offered = req.headers['sec-websocket-extensions'] as string | undefined
      podWss.handleUpgrade(req, socket, head, ws => {
        for (let i = 0; i < 5; i++) ws.send('x'.repeat(2000) + i)
      })
    })
    const podPort = await listen(pod)

    /* Our proxy, piping the upgrade to the pod exactly as production does. */
    const proxy = http.createServer()
    proxy.on('upgrade', (req, socket, head) =>
      pipeUpgrade(
        {
          endpoint: `127.0.0.1:${podPort}`,
          upstreamPath: '/ws',
          sessionId: 's',
          viewToken: 'v',
        },
        req,
        socket,
        head
      )
    )
    const proxyPort = await listen(proxy)

    /* A client that DOES offer compression, as every browser does. */
    const got = await new Promise<{ n: number; ext: string }>((res, rej) => {
      const ws = new WebSocket(`ws://127.0.0.1:${proxyPort}/ws`, {
        perMessageDeflate: true,
      })
      let n = 0
      let ext = ''
      ws.on('upgrade', r => {
        ext = String(r.headers['sec-websocket-extensions'] || '')
      })
      ws.on('message', () => {
        if (++n === 5) {
          ws.close()
          res({ n, ext })
        }
      })
      ws.on('error', rej)
      setTimeout(() => rej(new Error('timeout, got ' + n)), 5000)
    })

    pod.close()
    proxy.close()

    expect(offered, 'the pod was offered compression').toBeUndefined()
    expect(got.ext, 'the 101 advertised compression').toBe('')
    expect(got.n).toBe(5)
  })
})
