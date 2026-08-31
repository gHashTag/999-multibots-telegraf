/**
 * THE CLI MUST BE ABLE TO START, AND STARTING IT MUST NOT SEND ANYTHING.
 *
 * Written for the same reason as autopilot-startable.test.ts: a script nothing
 * ever executes can be broken in ways no type check and no unit test can see.
 * This one had two such faults at once -- it ran main() at IMPORT time and
 * called process.exit(1) on a failed send, so importing it anywhere (which is
 * exactly what wiring it up means) turned a channel refusal into a dead daemon
 * under the render server's 60-second respawn.
 *
 * The run below has no credentials and no database, which is the state of any
 * developer machine and of any deploy where the owner has not switched the
 * channel on. The required behaviour is: say what it would do, send nothing,
 * exit 0. Verdicts come from the STATUS CODE, not from the text.
 */
import { describe, it, expect } from 'vitest'
import { spawnSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HERE = __dirname
const TSX = path.join(HERE, 'node_modules/.bin/tsx')
const SCRIPT = 'scripts/telegram-autopost.ts'

function run(env: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-post-test-'))
  try {
    const r = spawnSync(TSX, [SCRIPT], {
      cwd: HERE,
      encoding: 'utf8',
      timeout: 60_000,
      env: {
        ...process.env,
        LOOP_DIR: dir,
        /**
         * A developer machine has a REAL DATABASE_URL and process.env is spread
         * in above. Blanking it keeps the run on the no-database path -- the one
         * this file is about -- instead of quietly querying production.
         */
        DATABASE_URL: '',
        // Same reasoning for the channel: an inherited token plus an inherited
        // quota would make this test capable of POSTING. It must not be.
        TELEGRAM_CHANNEL_BOT_TOKEN: '',
        TELEGRAM_CHANNEL_ID: '',
        TG_POST_BOT_TOKEN: '',
        TG_POST_CHANNEL_ID: '',
        TG_POST_MAX_PER_DAY: '',
        ...env,
      },
    })
    const journal = path.join(dir, 'LOOP_STATE.md')
    return {
      ...r,
      out: `${r.stdout || ''}${r.stderr || ''}`,
      journal: fs.existsSync(journal) ? fs.readFileSync(journal, 'utf8') : '',
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 })
  }
}

describe('the autopost CLI', () => {
  it('tsx is present in this package, not only as a dev dependency', () => {
    expect(fs.existsSync(TSX), `${TSX} is missing`).toBe(true)
  })

  it('loads, speaks for itself and exits 0 with nothing configured', () => {
    const r = run({})
    // The transform-level failures that made the sibling script unrunnable for
    // 51 hours while every check stayed green.
    expect(r.out).not.toContain('Top-level await')
    expect(r.out).not.toContain('Transform failed')
    expect(r.out).toContain('[tg-post]')
    expect(r.out).not.toContain('падение')
    expect(r.status).toBe(0)
  }, 20_000)

  it('sends nothing and says so', () => {
    const r = run({})
    expect(r.out).toContain('отправлено 0')
    expect(r.out).toContain('сухой прогон')
  }, 20_000)

  it('credentials without a database are still a dry run, not a crash', () => {
    // The gate order matters: reading a token must never be the thing that
    // decides to send.
    const r = run({
      TELEGRAM_CHANNEL_BOT_TOKEN: 'not-a-real-token', // secret-guard-ok: literal placeholder, not a token
      TELEGRAM_CHANNEL_ID: '@nowhere',
      TG_POST_MAX_PER_DAY: '4',
    })
    expect(r.status).toBe(0)
    expect(r.out).toContain('отправлено 0')
  }, 20_000)

  it('the autopilot TICK really reaches the delivery, not just imports it', async () => {
    /**
     * The runtime half of channel-seam.test.ts.
     *
     * That file reads the sources and proves the call is written down; this one
     * proves it EXECUTES -- which is the property the old script never had, and
     * the one a grep can be wrong about (a call inside a branch nothing takes
     * looks identical in the source). The daemon is spawned exactly as
     * render-server.ts spawns it, with no feed and no database, so main()
     * returns early on the quiet path -- the very path the backlog needs.
     */
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tick-delivery-'))
    const child = spawn(TSX, ['scripts/agent-autopilot.ts'], {
      cwd: HERE,
      env: {
        ...process.env,
        AGENT_KEYS: 'test-key:144022504',
        LOOP_DIR: dir,
        SELF_URL: 'http://127.0.0.1:9', // a closed port: no feed, no render
        DATABASE_URL: '', // never touch a developer's real database
        // Three independent reasons this process cannot post, because it is a
        // spawned daemon and a test that CAN post eventually will: no database,
        // no credentials under either naming, and a day quota of zero.
        TELEGRAM_CHANNEL_BOT_TOKEN: '',
        TELEGRAM_CHANNEL_ID: '',
        TG_POST_BOT_TOKEN: '',
        TG_POST_CHANNEL_ID: '',
        TG_POST_MAX_PER_DAY: '0',
        AUTOPILOT_LOOP: '1',
      },
    })
    let out = ''
    await new Promise<void>(resolve => {
      const onData = (b: Buffer) => {
        out += String(b)
        if (out.includes('канал:')) resolve()
      }
      child.stdout?.on('data', onData)
      child.stderr?.on('data', onData)
      child.on('exit', () => resolve())
      setTimeout(resolve, 25_000)
    })
    child.kill('SIGKILL')
    if (child.exitCode === null && child.signalCode === null)
      await new Promise<void>(resolve => {
        child.on('exit', () => resolve())
        setTimeout(resolve, 2_000)
      })
    try {
      // The tick spoke about the channel: the seam is live, not decorative.
      expect(out).toContain('канал:')
      // And it did so on a cycle that published nothing.
      expect(out).toContain('[autopilot]')
    } finally {
      fs.rmSync(dir, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      })
    }
  }, 40_000)

  it('writes its own line into the loop journal', () => {
    // The journal is how the owner sees the factory without opening a terminal;
    // a delivery that leaves no trace is indistinguishable from one that never
    // happened, which is precisely how the channel gap stayed invisible.
    const r = run({})
    expect(r.journal).toContain('tg-post:')
  }, 20_000)
})
