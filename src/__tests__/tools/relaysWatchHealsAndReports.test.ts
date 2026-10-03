/**
 * `tri relays-watch run`: A BROKEN ROAD IS FIXED WHERE THAT IS SAFE, THEN SAID.
 *
 * Owner, 2026-10-03: "if any error happens the agent must react itself, fix
 * the bug, report it and finish the task". The script is run for real, with
 * the probe, the redeploy, the sender and sleep replaced by stubs.
 */
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SCRIPT = resolve(__dirname, '../../../bin/helpers/relays-watch.sh')

const OK =
  'relays: bot -> render\n  ok    key parity\nrelays: every road answers'
const DOWN =
  '  ok    key parity\n  FAIL  approve (Allow/Deny button): 502, words: none\n  FAIL  meeting card button: 000, words: none'
/* A 5xx alone, the meeting road fine: a render that answers but errors. */
const ERRORS =
  '  ok    key parity\n  FAIL  approve (Allow/Deny button): 503, words: none\n  ok    meeting card button: 200'
const KEY =
  "  FAIL  key parity: the bot's key differs from the render's -- every relay is 401\n  FAIL  approve (Allow/Deny button): 401, words: none"

type Probe = { out: string; rc: number }

function world(probes: Probe[], dir = mkdtempSync(join(tmpdir(), 'rw-'))) {
  probes.forEach((p, i) => {
    writeFileSync(join(dir, `out${i}`), p.out)
    writeFileSync(join(dir, `rc${i}`), String(p.rc))
  })
  writeFileSync(join(dir, 'n'), '0')
  return dir
}

function run(dir: string, extra: Record<string, string> = {}) {
  let rc = 0
  try {
    execFileSync('bash', [SCRIPT, 'run'], {
      env: {
        PATH: process.env.PATH ?? '',
        HOME: dir,
        STATE_DIR: join(dir, 'state'),
        RELAYS_CMD: `n=$(cat ${dir}/n); echo $((n+1)) > ${dir}/n; cat ${dir}/out$n; exit $(cat ${dir}/rc$n)`,
        REDEPLOY_CMD: `echo x >> ${dir}/redeploys`,
        SEND_CMD: `cat >> ${dir}/sent; echo '<<END>>' >> ${dir}/sent`,
        SLEEP_CMD: 'true',
        ...extra,
      },
      stdio: 'pipe',
    })
  } catch (e) {
    rc = (e as { status: number }).status
  }
  const read = (f: string) =>
    existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : ''
  return {
    rc,
    sent: read('sent').split('<<END>>\n').filter(Boolean),
    redeploys: read('redeploys').split('\n').filter(Boolean).length,
    probes: Number(read('n')),
  }
}

describe('tri relays-watch run', () => {
  it('stays silent when every road answers', () => {
    const r = run(world([{ out: OK, rc: 0 }]))
    expect(r).toMatchObject({ rc: 0, sent: [], redeploys: 0, probes: 1 })
  })

  it('waits out a deploy swap without redeploying or saying anything', () => {
    const r = run(
      world([
        { out: DOWN, rc: 1 },
        { out: OK, rc: 0 },
      ])
    )
    expect(r).toMatchObject({ rc: 0, sent: [], redeploys: 0, probes: 2 })
  })

  it('redeploys a render that stays down, and reports the fix', () => {
    const r = run(
      world([
        { out: DOWN, rc: 1 },
        { out: DOWN, rc: 1 },
        { out: OK, rc: 0 },
      ])
    )
    expect(r.rc).toBe(0)
    expect(r.redeploys).toBe(1)
    expect(r.sent).toHaveLength(1)
    expect(r.sent[0]).toContain('Починил сам')
  })

  it('treats a 5xx as a dead render too, not only no answer at all', () => {
    const r = run(
      world([
        { out: ERRORS, rc: 1 },
        { out: ERRORS, rc: 1 },
        { out: OK, rc: 0 },
      ])
    )
    expect(r.redeploys).toBe(1)
  })

  it('reports a heal that did not help, with what is broken', () => {
    const r = run(
      world([
        { out: DOWN, rc: 1 },
        { out: DOWN, rc: 1 },
        { out: DOWN, rc: 1 },
      ])
    )
    expect(r.rc).toBe(1)
    expect(r.redeploys).toBe(1)
    expect(r.sent[0]).toContain('не помогло')
    expect(r.sent[0]).toContain('approve (Allow/Deny button): 502')
  })

  it('never redeploys twice inside the heal window', () => {
    const dir = world([
      { out: DOWN, rc: 1 },
      { out: DOWN, rc: 1 },
      { out: DOWN, rc: 1 },
      { out: DOWN, rc: 1 },
      { out: DOWN, rc: 1 },
    ])
    run(dir)
    const second = run(dir)
    expect(second.redeploys).toBe(1)
    expect(second.sent.at(-1)).toContain('меньше 6 ч')
  })

  it('does not touch a key: reports it with the next step', () => {
    const r = run(world([{ out: KEY, rc: 1 }]))
    expect(r.redeploys).toBe(0)
    expect(r.probes).toBe(1)
    expect(r.sent[0]).toContain('key parity')
    expect(r.sent[0]).toContain('tri relays')
  })

  it('says a lasting break once, not every hour, and says the recovery', () => {
    const dir = world([
      { out: KEY, rc: 1 },
      { out: KEY, rc: 1 },
      { out: OK, rc: 0 },
    ])
    run(dir)
    run(dir)
    const third = run(dir)
    expect(third.sent).toHaveLength(2)
    expect(third.sent[1]).toContain('снова работают')
  })

  it('reports an unmeasured road only on the third run in a row', () => {
    const dir = world(Array.from({ length: 6 }, () => ({ out: '', rc: 2 })))
    expect(run(dir).sent).toHaveLength(0)
    expect(run(dir).sent).toHaveLength(0)
    const third = run(dir)
    expect(third.rc).toBe(2)
    expect(third.sent).toHaveLength(1)
    expect(third.probes).toBe(6)
  })
})

/*
 * The real sender, with `railway` and `curl` stubbed: the host comes from the
 * token and vibee-render's routing variables, never from a literal.
 */
function sendWorld(vars: string) {
  const dir = world([{ out: KEY, rc: 1 }])
  const bin = join(dir, 'stub-bin')
  mkdirSync(bin)
  mkdirSync(join(dir, '.fcc'))
  writeFileSync(join(dir, '.fcc/.env'), 'TELEGRAM_BOT_TOKEN="12345:fixture"\n')
  writeFileSync(join(dir, 'vars'), vars)
  writeFileSync(join(bin, 'railway'), `#!/bin/sh\ncat ${dir}/vars\n`)
  writeFileSync(
    join(bin, 'curl'),
    `#!/bin/sh\nfor a in "$@"; do echo "$a"; done > ${dir}/curl\necho '{"ok":true}'\n`
  )
  chmodSync(join(bin, 'railway'), 0o755)
  chmodSync(join(bin, 'curl'), 0o755)
  const r = run(dir, {
    SEND_CMD: '',
    RVARS_PAUSE: '0',
    PATH: `${bin}:${process.env.PATH ?? ''}`,
  })
  const curl = existsSync(join(dir, 'curl'))
    ? readFileSync(join(dir, 'curl'), 'utf8')
    : ''
  return { ...r, curl }
}

describe("tri relays-watch tells the owner on the bot's own Bot API host", () => {
  it('a bot moved to our server is called there, not on the cloud', () => {
    const r = sendWorld(
      [
        'TELEGRAM_API_ROOT=http://bot-api.test:8081',
        'TELEGRAM_API_FILES_ROOT=http://bot-api.test:8082',
        'BOT_API_LOCAL_BOTS=12345',
      ].join('\n')
    )
    expect(r.curl).toContain(
      'http://bot-api.test:8081/bot12345:fixture/sendMessage'
    )
  })

  it('a bot on the cloud is called on the cloud', () => {
    const r = sendWorld('BOT_API_LOCAL_BOTS=\nOTHER=1')
    expect(r.curl).toContain(
      'https://api.telegram.org/bot12345:fixture/sendMessage'
    )
  })

  it('sends nothing when the routing variables cannot be read', () => {
    const r = sendWorld('')
    expect(r.curl).toBe('')
  })
})

/* A fake `railway` in its own directory, logged in or not. */
function cli(loggedIn: boolean) {
  const home = mkdtempSync(join(tmpdir(), 'rwi-'))
  const bin = join(home, 'cli-bin')
  mkdirSync(bin)
  writeFileSync(
    join(bin, 'railway'),
    loggedIn
      ? '#!/bin/sh\necho "Logged in as test"\n'
      : '#!/bin/sh\necho "Unauthorized. Please login" >&2\nexit 1\n'
  )
  chmodSync(join(bin, 'railway'), 0o755)
  return { home, bin }
}

function install(home: string, bin: string) {
  let rc = 0
  try {
    execFileSync('bash', [SCRIPT, 'install'], {
      env: { PATH: `${bin}:/usr/bin:/bin`, HOME: home, LAUNCHCTL: 'true' },
      stdio: 'pipe',
    })
  } catch (e) {
    rc = (e as { status: number }).status
  }
  const plist = join(home, 'Library/LaunchAgents/ai.t27.relays-watch.plist')
  return { rc, plist: existsSync(plist) ? readFileSync(plist, 'utf8') : '' }
}

describe('tri relays-watch install', () => {
  it('puts the logged-in railway first on the job PATH', () => {
    const { home, bin } = cli(true)
    const r = install(home, bin)
    expect(r.rc).toBe(0)
    expect(r.plist).toContain(`<string>${bin}:/opt/homebrew/bin:`)
    // The installed copy resolves the Bot API host with this file, beside it.
    expect(
      existsSync(join(home, '.local/lib/t27-relays-watch/telegram-api.cjs'))
    ).toBe(true)
  })

  it('refuses a watch whose railway is not logged in', () => {
    const { home, bin } = cli(false)
    const r = install(home, bin)
    expect(r.rc).toBe(1)
    expect(r.plist).toBe('')
  })
})
