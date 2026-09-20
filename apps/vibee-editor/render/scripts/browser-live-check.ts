/**
 * The broker's driver against a REAL container runtime, which the unit tests
 * deliberately do not touch.
 *
 * It answers the questions a fake cannot: does a pod actually come up, does
 * the session's view token actually work as the person's password, and does a
 * wrong token actually get turned away. Run it by hand:
 *
 *   BROWSER_POD_IMAGE=f0-pod:v1 npx tsx scripts/browser-live-check.ts
 */
import { execFile } from 'node:child_process'
import { driverFromEnv, type Exec } from '../src/browser/pod-driver'
import { newSessionToken } from '../src/browser/wire'

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
  if (!driver) throw new Error('no driver built')

  const sessionId = newSessionToken().slice(0, 12)
  const viewToken = newSessionToken()
  const adminToken = newSessionToken()
  console.log('session   ', sessionId)

  const t0 = Date.now()
  const pod = await driver.start({ sessionId, viewToken, adminToken })
  console.log('pod       ', pod.podId, '->', pod.endpoint)

  let ready = 0
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://${pod.endpoint}/`)
      if (r.ok) {
        ready = Date.now() - t0
        break
      }
    } catch {
      /* not up yet */
    }
    await sleep(500)
  }
  console.log('viewer up ', ready, 'ms')

  const login = async (pass: string) => {
    const r = await fetch(`http://${pod.endpoint}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'user', password: pass }),
    })
    return r.status
  }
  console.log('view token accepted :', await login(viewToken))
  console.log('wrong token refused :', await login('not-the-token'))
  console.log('alive               :', await driver.alive(pod.podId))

  await driver.stop(pod.podId)
  console.log('after stop, alive   :', await driver.alive(pod.podId))
}

main().catch(e => {
  console.error('FAILED', e)
  process.exit(1)
})
