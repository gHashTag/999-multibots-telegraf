/**
 * THE AGENT SEES THE WHOLE SCREEN, NOT ONLY THE PAGE.
 *
 * 2026-09-22: the person saw a grey window for an evening while every CDP
 * shot showed a healthy page. The fault was found only with neko's own shot
 * of the X screen beside the viewer's. browser_screenshot({desktop:true})
 * hands the agent that picture: it logs in to the pod as admin, server-side,
 * and fetches /api/room/screen/shot.jpg.
 *
 * Driven against a real HTTP server standing in for the pod, so the login,
 * the bearer and the bytes are what actually crossed the wire.
 */
import { describe, it, expect } from 'vitest'
import http from 'node:http'
import { desktopShot } from './src/browser/screen'
import { BROWSER_TOOLS } from './src/browser/agent-tools'

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9])

async function fakePod(opts: { refuseShot?: boolean } = {}) {
  const seen: Array<{
    method: string
    url: string
    auth?: string
    body: string
  }> = []
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', c => (body += c))
    req.on('end', () => {
      seen.push({
        method: req.method || '',
        url: req.url || '',
        auth: req.headers.authorization,
        body,
      })
      if (req.url === '/api/login') {
        const ok = JSON.parse(body).password === 'admin-secret'
        res.writeHead(ok ? 200 : 401, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify(ok ? { token: 'neko-bearer' } : { message: 'no' })
        )
        return
      }
      if (req.url === '/api/room/screen/shot.jpg') {
        if (
          opts.refuseShot ||
          req.headers.authorization !== 'Bearer neko-bearer'
        ) {
          res.writeHead(403, { 'content-type': 'application/json' })
          res.end('{"message":"Forbidden"}')
          return
        }
        res.writeHead(200, { 'content-type': 'image/jpeg' })
        res.end(JPEG)
        return
      }
      res.writeHead(404)
      res.end()
    })
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  const endpoint = `127.0.0.1:${(server.address() as { port: number }).port}`
  return { endpoint, seen, close: () => server.close() }
}

describe('desktopShot', () => {
  it('logs in as admin and returns the screen JPEG', async () => {
    const pod = await fakePod()
    try {
      const b64 = await desktopShot(pod.endpoint, 'admin-secret')
      expect(Buffer.from(b64, 'base64')).toEqual(JPEG)
      /*
       * The logout is part of the errand as of 2026-09-26: without it the pod
       * kept an admin session per picture, and had 35 of them
       * (a-browser-that-tidies-up.test.ts).
       */
      expect(pod.seen.map(s => `${s.method} ${s.url}`)).toEqual([
        'POST /api/login',
        'GET /api/room/screen/shot.jpg',
        'POST /api/logout',
      ])
      expect(pod.seen[1].auth).toBe('Bearer neko-bearer')
    } finally {
      pod.close()
    }
  })

  it('a refused shot is an error, not an empty picture', async () => {
    const pod = await fakePod({ refuseShot: true })
    try {
      await expect(desktopShot(pod.endpoint, 'admin-secret')).rejects.toThrow(
        /refused.*403/
      )
    } finally {
      pod.close()
    }
  })
})

describe('browser_screenshot({ desktop: true })', () => {
  const tool = BROWSER_TOOLS.find(t => t.name === 'browser_screenshot')!
  const ctxWith = (rows: Array<Record<string, unknown>>) => ({
    telegramId: 'tg-900000001',
    pool: {
      async query(sql: string, params: unknown[] = []) {
        if (!sql.trim().toUpperCase().startsWith('SELECT')) return { rows: [] }
        return { rows: rows.filter(r => r.telegram_id === String(params[0])) }
      },
    },
  })

  it('offers the option in its schema', () => {
    const props = (
      tool.parameters as { properties: Record<string, { type: string }> }
    ).properties
    expect(props.desktop.type).toBe('boolean')
  })

  it("goes to the pod, with this person's session", async () => {
    const pod = await fakePod()
    try {
      const out = (await tool.handler(
        { desktop: true },
        ctxWith([
          {
            telegram_id: 'tg-900000001',
            session_id: 's1',
            state: 'live',
            endpoint: pod.endpoint,
            cdp_endpoint: null,
            view_token: 'v',
            admin_token: 'admin-secret',
          },
        ]) as never
      )) as { format: string; base64: string }
      expect(out.format).toBe('jpeg')
      expect(Buffer.from(out.base64, 'base64')).toEqual(JPEG)
    } finally {
      pod.close()
    }
  })

  it('with no browser, says where one comes from', async () => {
    await expect(
      tool.handler({ desktop: true }, ctxWith([]) as never)
    ).rejects.toThrow(/no browser is running/)
  })
})
