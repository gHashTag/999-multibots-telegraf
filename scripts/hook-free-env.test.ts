import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { hookFreeEnv, localGitVars } = require('./lib/hook-free-env.cjs')

describe('hookFreeEnv', () => {
  it("drops what binds git to the hook's repository, keeps the rest", () => {
    const env = hookFreeEnv(
      {
        PATH: '/bin',
        GIT_DIR: '/real/.git',
        GIT_INDEX_FILE: '/real/.git/index',
        GIT_WORK_TREE: '/real',
        GIT_AUTHOR_NAME: 'someone',
        GIT_SSH_COMMAND: 'ssh -i key',
      },
      localGitVars()
    )
    expect(env).toEqual({
      PATH: '/bin',
      GIT_AUTHOR_NAME: 'someone',
      GIT_SSH_COMMAND: 'ssh -i key',
    })
  })

  it('takes the list from git itself', () => {
    const names = localGitVars()
    expect(names).toContain('GIT_DIR')
    expect(names).toContain('GIT_INDEX_FILE')
    expect(names).toContain('GIT_COMMON_DIR')
    expect(names).not.toContain('GIT_AUTHOR_NAME')
  })

  it('a throwaway repository sees itself, not the repository the hook exported', () => {
    // The 2026-10-03 failure: a hook's GIT_DIR sent a temp repo's git calls to
    // the real one, so `git log` there read the branch's own commits.
    const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'hfe-outer-'))
    const inner = fs.mkdtempSync(path.join(os.tmpdir(), 'hfe-inner-'))
    try {
      const plain = hookFreeEnv(process.env)
      const git = (cwd: string, env: NodeJS.ProcessEnv, ...args: string[]) =>
        execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim()
      git(outer, plain, 'init', '-q')
      git(inner, plain, 'init', '-q')
      const leaked = { ...plain, GIT_DIR: path.join(outer, '.git') }
      expect(git(inner, leaked, 'rev-parse', '--absolute-git-dir')).toBe(
        fs.realpathSync(path.join(outer, '.git'))
      )
      expect(
        git(inner, hookFreeEnv(leaked), 'rev-parse', '--absolute-git-dir')
      ).toBe(fs.realpathSync(path.join(inner, '.git')))
    } finally {
      fs.rmSync(outer, { recursive: true, force: true })
      fs.rmSync(inner, { recursive: true, force: true })
    }
  })
})
