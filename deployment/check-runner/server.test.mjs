import { describe, it, expect, afterEach } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SNAPSHOT } from './server.mjs'

/* The hook's GIT_DIR must not aim these fixtures at the real repository. */
const NO_GIT_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))
)

const dirs = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

/* A tree the way tar leaves it on the runner: files, no .git. */
function unpacked() {
  const d = mkdtempSync(join(tmpdir(), 'check-runner-'))
  dirs.push(d)
  mkdirSync(join(d, 'src'))
  writeFileSync(join(d, 'src', 'a.ts'), 'export const a = 1\n')
  writeFileSync(join(d, 'src', 'Привет.ts'), 'export const b = 2\n')
  writeFileSync(join(d, '.gitignore'), 'node_modules\n')
  writeFileSync(join(d, '.check-files'), 'src/a.ts\n')
  return d
}

const lsFiles = (cwd, ...extra) =>
  spawnSync('git', ['ls-files', '-z', ...extra], {
    cwd,
    env: NO_GIT_ENV,
    encoding: 'utf8',
  })

describe('the unpacked tree is a repository before any check runs', () => {
  it('without the snapshot, a guard reading git ls-files is blind', () => {
    const r = lsFiles(unpacked())
    expect(r.status).not.toBe(0)
    expect(r.stderr).toMatch(/not a git repository/)
  })

  it('git ls-files lists exactly what arrived, minus the gate list', () => {
    const d = unpacked()
    /* Present or not, node_modules stays out: the archive's .gitignore. */
    mkdirSync(join(d, 'node_modules'))
    writeFileSync(join(d, 'node_modules', 'x.js'), '')
    execFileSync('bash', ['-lc', SNAPSHOT], { cwd: d, env: NO_GIT_ENV })
    const tracked = lsFiles(d).stdout.split('\0').filter(Boolean).sort()
    expect(tracked).toEqual(['.gitignore', 'src/a.ts', 'src/Привет.ts'].sort())
    const others = lsFiles(d, '--others', '--exclude-standard').stdout
    expect(others).toBe('')
  })
})
