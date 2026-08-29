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
function run(env: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-test-'))
  try {
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
  })

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
    try {
      expect(out).not.toContain('Top-level await')
      expect(out).not.toContain('ENOENT')
      expect(out).toContain('[autopilot]')
      expect(fs.existsSync(dir), 'the log directory was not created').toBe(true)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 40_000)

  it('refuses clearly when no agent key is configured', () => {
    // A missing key must be a stated refusal, not a stack trace.
    const r = run({ AGENT_KEYS: '' })
    expect(r.status).toBe(1)
    expect(r.out).toContain('AGENT_KEYS')
  })
})
