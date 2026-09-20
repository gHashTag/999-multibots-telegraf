/**
 * THE WHOLE CHAIN, END TO END, AGAINST A REAL POD.
 *
 * The unit tests pin the decision; this proves the bytes move. It starts a
 * real pod, stands the proxy up in front of it with an in-memory session row
 * (so no database is needed), and then behaves like the person's browser:
 * follows the redirect, loads the page and an asset, and opens the WebSocket
 * that carries the keyboard.
 *
 *   BROWSER_POD_IMAGE=f0-pod:v1 npx tsx scripts/browser-live-e2e.ts
 */
import { createServer, request as httpRequest } from 'node:http'
import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { driverFromEnv, type Exec } from '../src/browser/pod-driver'
import { newSessionToken } from '../src/browser/wire'
import { parseLive, authorizeLive } from '../src/browser/live-proxy'
import { pipeHttp, pipeUpgrade, refuseUpgrade } from '../src/browser/live-pipe'
import type { Queryable } from '../src/browser/sessions'

const run: Exec = (file, args) =>
  new Promise((resolve, reject) =>
    execFile(file, args, { timeout: 120_000 }, (e, out) =>
      e ? reject(e) : resolve({ stdout: String(out) })
    )
  )

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
let failures = 0

function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures++
  console.log(
    `${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`
  )
}

/** One row, held in memory: this script is about the pipe, not storage. */
function poolWith(row: Record<string, unknown>): Queryable {
  return {
    async query(sql, params = []) {
      if (!sql.trim().toUpperCase().startsWith('SELECT')) return { rows: [] }
      return { rows: String(params[0]) === row.session_id ? [row] : [] }
    },
  }
}

async function get(
  port: number,
  path: string,
  cookie?: string
): Promise<{ status: number; headers: Record<string, unknown>; body: string }> {
  return new Promise((resolve, reject) => {
    const r = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path,
        headers: cookie ? { cookie } : {},
      },
      res => {
        let body = ''
        res.on('data', c => (body += c))
        res.on('end', () =>
          resolve({
            status: res.statusCode || 0,
            headers: res.headers as Record<string, unknown>,
            body,
          })
        )
      }
    )
    r.on('error', reject)
    r.end()
  })
}

/** A WebSocket handshake by hand: no dependency, and it is the raw truth. */
function upgrade(port: number, path: string, cookie: string): Promise<number> {
  return new Promise(resolve => {
    const r = httpRequest({
      host: '127.0.0.1',
      port,
      path,
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
        cookie,
      },
    })
    r.on('upgrade', (res, socket) => {
      socket.destroy()
      resolve(res.statusCode || 101)
    })
    r.on('response', res => resolve(res.statusCode || 0))
    r.on('error', () => resolve(0))
    r.end()
  })
}

async function main() {
  const driver = driverFromEnv(
    {
      BROWSER_POD_DRIVER: 'docker',
      BROWSER_POD_IMAGE: process.env.BROWSER_POD_IMAGE || 'f0-pod:v1',
    },
    run
  )
  if (!driver) throw new Error('no driver')

  const sessionId = newSessionToken()
  const viewToken = newSessionToken()
  const pod = await driver.start({
    sessionId,
    viewToken,
    adminToken: newSessionToken(),
  })
  console.log('pod', pod.podId, '->', pod.endpoint)

  try {
    for (let i = 0; i < 180; i++) {
      try {
        if ((await fetch(`http://${pod.endpoint}/`)).ok) break
      } catch {
        /* still coming up */
      }
      await sleep(500)
    }

    const pool = poolWith({
      telegram_id: 'tg-900000001',
      session_id: sessionId,
      pod_id: pod.podId,
      endpoint: pod.endpoint,
      state: 'live',
      view_token: viewToken,
      admin_token: 'kept-on-the-server', // secret-guard-ok: fixture, the point is that it stays here
    })

    const server = createServer(async (req, res) => {
      const parsed = parseLive(req.url || '', req.headers.cookie)
      if (!parsed) return res.writeHead(404).end('no')
      const d = await authorizeLive(pool, parsed, { secure: false })
      if (d.kind === 'refuse') return res.writeHead(d.status).end(d.message)
      if (d.kind === 'redirect') {
        return res
          .writeHead(302, { Location: d.location, 'Set-Cookie': d.setCookie })
          .end()
      }
      pipeHttp({ ...d, sessionId: parsed.sessionId }, req, res)
    })
    server.on('upgrade', async (req, socket, head) => {
      const parsed = parseLive(req.url || '', req.headers.cookie)
      if (!parsed) return refuseUpgrade(socket, 404)
      const d = await authorizeLive(pool, parsed, { secure: false })
      if (d.kind !== 'proxy') {
        return refuseUpgrade(socket, d.kind === 'refuse' ? d.status : 400)
      }
      pipeUpgrade({ ...d, sessionId: parsed.sessionId }, req, socket, head)
    })
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()))
    const port = (server.address() as AddressInfo).port
    console.log('proxy on 127.0.0.1:' + port, '\n')

    const first = await get(port, `/live/${sessionId}?t=${viewToken}`)
    check(
      'token in the query is answered with a redirect',
      first.status === 302
    )
    const setCookie = String(
      (first.headers['set-cookie'] as string[] | undefined)?.[0] || ''
    )
    check(
      'the redirect sets an HttpOnly cookie',
      setCookie.includes('HttpOnly')
    )
    check(
      'the redirect location carries no token',
      !String(first.headers.location || '').includes(viewToken),
      String(first.headers.location)
    )

    const cookie = setCookie.split(';')[0]
    const page = await get(port, `/live/${sessionId}/`, cookie)
    check('the page comes through the proxy', page.status === 200)
    check("it is neko's page", page.body.includes('<div id="neko">'))

    const asset = (page.body.match(/src="(js\/app\.[^"]+)"/) || [])[1]
    const js = asset
      ? await get(port, `/live/${sessionId}/${asset}`, cookie)
      : { status: 0, body: '' }
    check(
      'a relative asset resolves through the proxy',
      js.status === 200,
      asset
    )

    const ws = await upgrade(port, `/live/${sessionId}/ws`, cookie)
    check('the websocket upgrades', ws === 101, 'status ' + ws)

    const noToken = await get(port, `/live/${sessionId}/`)
    check('no cookie, no entry', noToken.status === 401)

    const wrong = await get(port, `/live/${sessionId}/?t=wrong-token-here`)
    check('a wrong token is refused', wrong.status === 404)

    const wsNoCookie = await upgrade(port, `/live/${sessionId}/ws`, 'x=1')
    check('the websocket is refused without the cookie', wsNoCookie !== 101)

    server.close()
  } finally {
    await driver.stop(pod.podId).catch(() => undefined)
    console.log('\npod stopped')
  }

  console.log(failures ? `\n${failures} FAILED` : '\nall checks passed')
  process.exit(failures ? 1 : 0)
}

main().catch(e => {
  console.error('FAILED', e)
  process.exit(1)
})
