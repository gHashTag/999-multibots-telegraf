/**
 * tri git-leak: the check that a test run under a hook's GIT_DIR did not write
 * into the real repository. Every repo here is a throwaway in tmp.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync, execFileSync } from 'child_process'
import { mkdtempSync, rmSync, realpathSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { hookFreeEnv } = require('./lib/hook-free-env.cjs')

const HELPER = path.resolve(__dirname, '..', 'bin', 'helpers', 'git-leak.sh')
const ENV = { ...hookFreeEnv(process.env), GIT_CONFIG_GLOBAL: '/dev/null' }

let repo: string
const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: repo, env: ENV, encoding: 'utf8' }).trim()
const leak = (args: string[] = [], extra: NodeJS.ProcessEnv = {}) => {
  const r = spawnSync('bash', [HELPER, repo, ...args], {
    env: { ...ENV, ...extra },
    encoding: 'utf8',
  })
  return { rc: r.status, out: `${r.stdout}${r.stderr}` }
}
const bare = () =>
  execFileSync(
    'git',
    ['config', '--file', path.join(repo, '.git', 'config'), 'core.bare'],
    { env: ENV, encoding: 'utf8' }
  ).trim()

beforeEach(() => {
  repo = realpathSync(mkdtempSync(path.join(tmpdir(), 'git-leak-')))
  git('init', '-q', '-b', 'main')
  git(
    '-c',
    'user.name=Owner',
    '-c',
    'user.email=owner@real.dev',
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'one'
  )
})
afterEach(() => rmSync(repo, { recursive: true, force: true }))

describe('tri git-leak', () => {
  it('is quiet on a clean repo', () => {
    const r = leak()
    expect(r.out).toMatch(/OK +core\.bare=false/)
    expect(r.out).toMatch(/OK +no ref made by a test fixture identity/)
    expect(r.rc).toBe(0)
  })

  it('fails on core.bare=true and heals it only when asked', () => {
    git('config', 'core.bare', 'true')
    const seen = leak()
    expect(seen.out).toMatch(/FAIL +core\.bare=true/)
    expect(seen.rc).toBe(1)
    expect(bare()).toBe('true')

    const healed = leak(['--heal'])
    expect(healed.out).toMatch(/HEAL +core\.bare was true/)
    expect(healed.rc).toBe(0)
    expect(bare()).toBe('false')
  })

  it('names a branch a test fixture made, and does not delete it', () => {
    git(
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@t',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'fixture'
    )
    git('branch', 'docs/x')
    git('reset', '-q', '--hard', 'HEAD~1')
    const r = leak()
    expect(r.out).toMatch(/refs made by a test fixture identity:\s+docs\/x/)
    expect(r.rc).toBe(1)
    expect(git('branch', '--list', 'docs/x')).toContain('docs/x')
  })

  it('looks at its own repo even when a hook exported another GIT_DIR', () => {
    const other = realpathSync(
      mkdtempSync(path.join(tmpdir(), 'git-leak-other-'))
    )
    try {
      execFileSync('git', ['init', '-q', other], { env: ENV })
      git('config', 'core.bare', 'true')
      const r = leak([], { GIT_DIR: path.join(other, '.git') })
      expect(r.out).toContain(`core.bare=true in ${repo}/.git/config`)
      expect(r.out).toMatch(/WARN +GIT_DIR=.* exported here/)
    } finally {
      rmSync(other, { recursive: true, force: true })
    }
  })
})
