/**
 * The autopilot must be able to START. Nothing checked that, and it cost days.
 *
 * PR #881 added daemon mode with a top-level `await` to a package that has no
 * "type": "module". esbuild refuses that at TRANSFORM time, so the script died
 * before executing a single line -- in BOTH modes, including the one-shot path
 * that had worked before. Typecheck passed, every other test passed, the deploy
 * was green, and the content factory produced nothing for 51 hours. The failure
 * was invisible because no test ever ran the file.
 *
 * This is the cheapest check that would have caught it: actually spawn the
 * script the way production does and assert it gets far enough to print its own
 * first line. It needs no network and no keys beyond a fake one, and it fails in
 * seconds if the module cannot be loaded.
 */
import { describe, it, expect } from 'vitest'
import { spawnSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HERE = __dirname
const TSX = path.join(HERE, 'node_modules/.bin/tsx')
const SCRIPT = 'scripts/agent-autopilot.ts'

/** Run the script with a throwaway state dir and no reachable server. */
function run(env: Record<string, string>, seed?: (dir: string) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-test-'))
  try {
    seed?.(dir)
    const r = spawnSync(TSX, [SCRIPT], {
      cwd: HERE,
      encoding: 'utf8',
      timeout: 60_000,
      env: {
        ...process.env,
        AGENT_KEYS: 'test-key:1',
        LOOP_DIR: dir,
        // Point at a closed port: the script must still LOAD and log before it
        // discovers it cannot reach anything.
        SELF_URL: 'http://127.0.0.1:9',
        // A developer machine has a REAL DATABASE_URL, and process.env is
        // spread in above. Without this the run would create autopilot_state in
        // the developer's own Postgres and would exercise the database path --
        // the exact opposite of the fallback this file exists to protect.
        DATABASE_URL: '',
        ...env,
      },
    })
    return { ...r, out: `${r.stdout || ''}${r.stderr || ''}`, dir }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

describe('the autopilot script can start', () => {
  it('tsx is present in this package, not only as a dev dependency', () => {
    // Production spawns this exact binary; if it were pruned the daemon would
    // respawn-loop forever without ever running.
    expect(fs.existsSync(TSX), `${TSX} is missing`).toBe(true)
  })

  it('loads and runs in one-shot mode (no transform error)', () => {
    const r = run({})
    // The specific failure this test exists for.
    expect(r.out).not.toContain('Top-level await')
    expect(r.out).not.toContain('Transform failed')
    expect(r.out).not.toContain('ERR_REQUIRE_ASYNC_MODULE')
    // It got far enough to speak for itself.
    expect(r.out).toContain('[autopilot]')
    // Explicit budget, because vitest's default is 5 s and this case is a COLD
    // tsx compile of the script and everything it imports. Measured warm at
    // ~0.5 s and cold at ~11 s on this machine while other suites competed for
    // the CPU; the default turned that into a red test that had nothing to say
    // about the autopilot.
  }, 20_000)

  it('loads and runs in daemon mode, and creates its log directory', async () => {
    // Daemon mode logs BEFORE the first cycle, into a directory that does not
    // exist in a fresh container -- that combination used to be an invisible
    // crash loop under a restart-always policy.
    //
    // A daemon never exits, so this waits for it to SPEAK and then kills it,
    // rather than waiting for a status code that will never come.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-daemon-'))
    fs.rmSync(dir, { recursive: true, force: true }) // deliberately absent
    const child = spawn(TSX, [SCRIPT], {
      cwd: HERE,
      env: {
        ...process.env,
        AGENT_KEYS: 'test-key:1',
        LOOP_DIR: dir,
        SELF_URL: 'http://127.0.0.1:9',
        DATABASE_URL: '', // see the note in run(): never touch a real database
        AUTOPILOT_LOOP: '1',
      },
    })
    let out = ''
    const spoke = new Promise<void>(resolve => {
      const onData = (b: Buffer) => {
        out += String(b)
        if (out.includes('[autopilot]')) resolve()
      }
      child.stdout?.on('data', onData)
      child.stderr?.on('data', onData)
      child.on('exit', () => resolve()) // died: assertions below will say why
      setTimeout(resolve, 25_000)
    })
    await spoke
    child.kill('SIGKILL')
    // SIGKILL is asynchronous: the daemon can write one more log file into `dir`
    // after kill() returns but before it is reaped, and that file racing the
    // cleanup below made fs.rmSync fail with ENOTEMPTY (force only swallows
    // ENOENT, not a directory repopulated mid-removal). Wait for the process to
    // actually exit — a dead process cannot write — before removing its dir.
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise<void>(resolve => {
        child.on('exit', () => resolve())
        setTimeout(resolve, 2_000)
      })
    }
    try {
      expect(out).not.toContain('Top-level await')
      expect(out).not.toContain('ENOENT')
      expect(out).toContain('[autopilot]')
      expect(fs.existsSync(dir), 'the log directory was not created').toBe(true)
    } finally {
      // maxRetries covers the residual window between exit and the last flush.
      fs.rmSync(dir, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      })
    }
  }, 40_000)

  it('still starts, says so, and EXITS when the database is unreachable', () => {
    // The state moved to Postgres. Two ways that could have broken one-shot
    // mode: an escaped connection error (exit 1 into the render server's
    // 60-second respawn loop), or a pool left open holding a socket and an idle
    // timer so the process never exits at all. Both are checked by the status
    // code below, which spawnSync only produces if the process ends by itself.
    const r = run({ DATABASE_URL: 'postgresql://u:p@127.0.0.1:1/nowhere' })
    expect(r.out).toContain('[autopilot]')
    expect(r.out).toContain('база недоступна')
    expect(r.status).toBe(0)
  }, 20_000)

  it('a saved cursor past the end of a re-seeded queue is a pause, not a crash', () => {
    // Now that the cursor is durable it can outlive the array it indexes:
    // loop/topics.json is git-tracked and the Dockerfile re-seeds it on every
    // deploy, so a stored 9 meets an array of 4. pickTopic returns `from`
    // unchanged when its window is empty, and the old code dereferenced
    // topics[4].title -- a TypeError on every cycle. Until the state was
    // durable, the same deploy also reset the cursor to 0 and hid it.
    const topics = ['a', 'b', 'c', 'd'].map(t => ({
      title: t,
      subtitle: '',
      lesson: '',
      tags: [],
      plates: [],
    }))
    const r = run({}, dir => {
      fs.writeFileSync(path.join(dir, 'topics.json'), JSON.stringify(topics))
      fs.writeFileSync(
        path.join(dir, 'state.json'),
        JSON.stringify({
          date: new Date().toISOString().slice(0, 10),
          postsToday: 0,
          nextTopic: 9,
        })
      )
    })
    // Not a bare "TypeError": the unreachable feed legitimately logs one of
    // its own ("TypeError: fetch failed"). This is the shape of the crash the
    // guard prevents, and the line the one-shot handler prints when it escapes.
    expect(r.out).not.toContain('Cannot read properties of undefined')
    expect(r.out).not.toContain('падение')
    expect(r.out).toContain('очередь тем исчерпана')
    expect(r.status).toBe(0)
  }, 20_000)

  it('refuses clearly when no agent key is configured', () => {
    // A missing key must be a stated refusal, not a stack trace.
    const r = run({ AGENT_KEYS: '' })
    expect(r.status).toBe(1)
    expect(r.out).toContain('AGENT_KEYS')
  })
})
