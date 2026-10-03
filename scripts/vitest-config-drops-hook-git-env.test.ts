/**
 * vitest.config.ts deletes the git hook's repository vars before any worker
 * starts. This launches the root config the way a hook does -- GIT_DIR and
 * GIT_INDEX_FILE set -- and runs vitest-env-probe.test.ts under it.
 *
 * The exported repository is a DECOY made here, never the real one: on
 * 2026-10-03 a reproduction with the real GIT_DIR created a branch and moved a
 * HEAD in the real repository. So even if the config line is gone, this test
 * only damages its own decoy.
 */
import { describe, it, expect } from 'vitest'
import { spawnSync, execFileSync } from 'child_process'
import { mkdtempSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { hookFreeEnv } = require('./lib/hook-free-env.cjs')

const ROOT = path.resolve(__dirname, '..')
const VITEST = path.join(ROOT, 'node_modules', 'vitest', 'vitest.mjs')

describe('the root vitest config and a hook-exported GIT_DIR', () => {
  it('hands every worker an env without it', () => {
    expect(existsSync(VITEST)).toBe(true)
    const decoy = mkdtempSync(path.join(tmpdir(), 'hook-decoy-'))
    try {
      execFileSync('git', ['init', '-q', decoy], {
        env: hookFreeEnv(process.env),
        stdio: 'ignore',
      })
      const env = Object.fromEntries(
        Object.entries(hookFreeEnv(process.env)).filter(
          ([k]) => !k.startsWith('VITEST')
        )
      ) as NodeJS.ProcessEnv
      env.GIT_DIR = path.join(decoy, '.git')
      env.GIT_INDEX_FILE = path.join(decoy, '.git', 'index')
      env.VITEST_MAX_WORKERS = '1'
      const run = spawnSync(
        process.execPath,
        [VITEST, 'run', 'scripts/vitest-env-probe.test.ts', '--reporter=dot'],
        { cwd: ROOT, env, encoding: 'utf8', timeout: 120_000 }
      )
      const out = `${run.stdout}\n${run.stderr}`
      expect(out).toMatch(/2 passed/)
      expect(run.status, out).toBe(0)
    } finally {
      rmSync(decoy, { recursive: true, force: true })
    }
  }, 150_000)
})
