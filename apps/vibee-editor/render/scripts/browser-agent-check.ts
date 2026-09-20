/**
 * AN AGENT DRIVING A REAL POD, END TO END.
 *
 * The unit tests pin the refusals. This answers the only question that
 * matters: given a running browser, can an agent open a page, read it, look
 * at it and type into it -- through the same tools every agent already sees
 * on `/mcp`?
 *
 *   npx tsx scripts/browser-agent-check.ts
 */
import { execFile } from 'node:child_process'
import { BROWSER_TOOLS } from '../src/browser/agent-tools'
import {
  volumeNameFor,
  PROFILE_PATH,
  CDP_BRIDGE_PORT,
  STOP_GRACE_SECONDS,
} from '../src/browser/pod-driver'
import { newSessionToken } from '../src/browser/wire'

const IMAGE = process.env.BROWSER_POD_IMAGE || 'f0-pod:v2'
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failures++
  console.log(
    `${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`
  )
}

const docker = (args: string[]): Promise<string> =>
  new Promise((resolve, reject) =>
    execFile('docker', args, { timeout: 180_000 }, (e, out) =>
      e ? reject(e) : resolve(String(out))
    )
  )

const tool = (name: string) => {
  const t = BROWSER_TOOLS.find(t => t.name === name)
  if (!t) throw new Error(`no such tool: ${name}`)
  return t
}

async function main() {
  const profileId = newSessionToken().slice(0, 12)
  const name = `agentcheck-${profileId}`
  await docker([
    'run',
    '-d',
    '--name',
    name,
    '--shm-size=1g',
    '-e',
    'NEKO_DESKTOP_SCREEN=1280x800@30',
    '-e',
    'NEKO_MEMBER_MULTIUSER_USER_PASSWORD=x',
    '-e',
    'NEKO_MEMBER_MULTIUSER_ADMIN_PASSWORD=y',
    '-v',
    `${volumeNameFor(profileId)}:${PROFILE_PATH}`,
    '-p',
    `127.0.0.1:0:${CDP_BRIDGE_PORT}`,
    IMAGE,
  ])

  try {
    let cdp = ''
    for (let i = 0; i < 200; i++) {
      const mapped = await docker([
        'port',
        name,
        String(CDP_BRIDGE_PORT),
      ]).catch(() => '')
      const port = mapped.split('\n')[0]?.trim().split(':').pop()
      if (port) {
        cdp = `127.0.0.1:${port}`
        try {
          if ((await fetch(`http://${cdp}/json/version`)).ok) break
        } catch {
          /* still coming up */
        }
      }
      await sleep(500)
    }
    check('the pod answers CDP through its bridge', Boolean(cdp), cdp)

    /* The session row an agent's call would find, held in memory. */
    const row = {
      telegram_id: 'tg-900000001',
      session_id: 's1',
      pod_id: name,
      endpoint: '127.0.0.1:0',
      cdp_endpoint: cdp,
      state: 'live',
      view_token: 'v',
      admin_token: 'a', // secret-guard-ok: one-letter fixture
    }
    const ctx = {
      telegramId: 'tg-900000001',
      pool: {
        async query(sql: string, params: unknown[] = []) {
          if (!sql.trim().toUpperCase().startsWith('SELECT'))
            return { rows: [] }
          return { rows: String(params[0]) === row.telegram_id ? [row] : [] }
        },
      },
    } as never

    const status = (await tool('browser_status').handler({}, ctx)) as {
      running: boolean
    }
    check('browser_status sees a running browser', status.running === true)

    const opened = (await tool('browser_open').handler(
      { url: 'http://127.0.0.1:8080/?agent-was-here' },
      ctx
    )) as { opened: string }
    check('browser_open opened a page', Boolean(opened.opened), opened.opened)
    await sleep(3000)

    const read = (await tool('browser_read').handler(
      { maxChars: 400 },
      ctx
    )) as {
      url: string
      title: string
    }
    check(
      'browser_read reads the page the agent opened',
      String(read.url).includes('agent-was-here'),
      String(read.url)
    )

    const shot = (await tool('browser_screenshot').handler({}, ctx)) as {
      base64: string
    }
    check(
      'browser_screenshot returns an image',
      shot.base64.length > 5000,
      `${Math.round(shot.base64.length / 1024)} KB`
    )

    const evaluated = (await tool('browser_evaluate').handler(
      { code: '1 + 1' },
      ctx
    )) as { value: unknown }
    check('browser_evaluate runs code in the page', evaluated.value === 2)

    await tool('browser_click').handler({ x: 10, y: 10 }, ctx)
    await tool('browser_type').handler({ text: 'hello' }, ctx)
    check('click and type are accepted by the live browser', true)
  } finally {
    await docker(['stop', '-t', String(STOP_GRACE_SECONDS), name]).catch(
      () => undefined
    )
    await docker(['rm', '-f', name]).catch(() => undefined)
    await docker(['volume', 'rm', '-f', volumeNameFor(profileId)]).catch(
      () => undefined
    )
  }

  console.log(failures ? `\n${failures} FAILED` : '\nall checks passed')
  process.exit(failures ? 1 : 0)
}

main().catch(e => {
  console.error('FAILED', e)
  process.exit(1)
})
