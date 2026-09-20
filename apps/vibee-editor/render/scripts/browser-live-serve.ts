/**
 * Stands the proxy up in front of a real pod and STAYS UP, so a human (or an
 * agent driving a browser) can look at the result. It is the same code path
 * as browser-live-e2e.ts; what it adds is a URL you can open.
 *
 *   npx tsx scripts/browser-live-serve.ts
 */
import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
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
  for (let i = 0; i < 180; i++) {
    try {
      if ((await fetch(`http://${pod.endpoint}/`)).ok) break
    } catch {
      /* coming up */
    }
    await sleep(500)
  }

  const row = {
    telegram_id: 'tg-900000001',
    session_id: sessionId,
    pod_id: pod.podId,
    endpoint: pod.endpoint,
    state: 'live',
    view_token: viewToken,
    admin_token: 'kept-on-the-server', // secret-guard-ok: fixture, the point is that it stays here
  }
  const pool: Queryable = {
    async query(sql, params = []) {
      if (!sql.trim().toUpperCase().startsWith('SELECT')) return { rows: [] }
      return { rows: String(params[0]) === sessionId ? [row] : [] }
    },
  }

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
  console.log(`OPEN http://127.0.0.1:${port}/live/${sessionId}?t=${viewToken}`)
  console.log(`POD  ${pod.podId}`)

  const bye = async () => {
    await driver.stop(pod.podId).catch(() => undefined)
    process.exit(0)
  }
  process.on('SIGINT', bye)
  process.on('SIGTERM', bye)
}

main().catch(e => {
  console.error('FAILED', e)
  process.exit(1)
})
