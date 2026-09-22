/**
 * THREE LISTS DECIDE WHERE A BOT LIVES, AND EVERY MISMATCH HAS A NAME.
 *
 * `tri botapi` reads BOT_API_LOCAL_BOTS on the bot and on the render, and
 * BOT_API_ALLOWED_IDS on our Bot API server. These pin how two out of three
 * reads: a split (the services disagree) is red, a silent bot and a half
 * rollback are yellow with their next step. Ids are invented (9000000xx).
 */
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { botApiFindings } = require('./botapi-state.cjs')

const M = (...ids: string[]) =>
  new Map<string, string | null>(ids.map(id => [id, `bot_${id.slice(-2)}`]))
const none = new Map<string, string | null>()

describe('botApiFindings', () => {
  it('nothing listed anywhere: every bot on the cloud, all fine', () => {
    const r = botApiFindings({ bot: none, render: none, admitted: none })
    expect(r).toEqual({ rows: [], worst: 'ok' })
  })

  it('all three agree: on our server', () => {
    const r = botApiFindings({
      bot: M('900000011'),
      render: M('900000011'),
      admitted: M('900000011'),
    })
    expect(r.worst).toBe('ok')
    expect(r.rows[0]).toMatchObject({ id: '900000011', state: 'on our server' })
  })

  it('the render without the reference is a split -- red, and it names the fix', () => {
    const r = botApiFindings({
      bot: M('900000011'),
      render: none,
      admitted: M('900000011'),
    })
    expect(r.worst).toBe('red')
    expect(r.rows[0].state).toContain(
      'vibee-render still sends it to the cloud'
    )
    expect(r.rows[0].state).toContain(
      '${{999-multibots-telegraf.BOT_API_LOCAL_BOTS}}'
    )
  })

  it('pointed but not let in: silent, yellow, next step is 2 or 3', () => {
    const r = botApiFindings({
      bot: M('900000011'),
      render: M('900000011'),
      admitted: none,
    })
    expect(r.worst).toBe('yellow')
    expect(r.rows[0].state).toContain('silent')
    expect(r.rows[0].state).toContain('--cloud-logout --pointed')
  })

  it('let in but not pointed: a half rollback, yellow', () => {
    const r = botApiFindings({
      bot: none,
      render: none,
      admitted: M('900000012'),
    })
    expect(r.worst).toBe('yellow')
    expect(r.rows[0].state).toContain('take it out of BOT_API_ALLOWED_IDS')
  })

  it('the worst row decides: one split among fine bots is red', () => {
    const r = botApiFindings({
      bot: M('900000011', '900000012'),
      render: M('900000011'),
      admitted: M('900000011', '900000012'),
    })
    expect(r.rows.map((x: { level: string }) => x.level)).toEqual(['ok', 'red'])
    expect(r.worst).toBe('red')
  })
})

/**
 * The guard in front of every tri command that holds bot tokens: a checkout
 * BEHIND main in the files that choose the Telegram host is refused (exit 3);
 * a current one, or one ahead of main, passes.
 */
describe('fresh-for-tokens.sh', () => {
  const GUARD = resolve(__dirname, '../bin/helpers/fresh-for-tokens.sh')
  /*
   * NO GIT_* FROM THE CALLER. Git hooks export GIT_DIR (and friends), and this
   * file runs under the pre-push hook: the first version of these tests,
   * run there, wrote `user.name=t` into the REAL repository's config while
   * "initialising" a throwaway one. Every git call below gets an environment
   * without GIT_*, the identity as `-c` (nothing written to any config), and
   * `repos()` refuses to go on unless the new repository really lives in the
   * temporary directory.
   */
  const CLEAN = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))
  )
  const git = (cwd: string, ...args: string[]) =>
    execFileSync(
      'git',
      ['-c', 'user.email=t@example.com', '-c', 'user.name=t', ...args],
      { cwd, encoding: 'utf8', stdio: 'pipe', env: CLEAN }
    )

  function repos() {
    const base = mkdtempSync(join(tmpdir(), 'fresh-tokens-'))
    const origin = join(base, 'origin.git')
    const work = join(base, 'work')
    git(base, 'init', '-q', '--bare', '-b', 'main', origin)
    git(base, 'clone', '-q', origin, work)
    const gitDir = git(work, 'rev-parse', '--absolute-git-dir').trim()
    if (!realpathSync(gitDir).startsWith(realpathSync(base))) {
      throw new Error(`refusing: the test repository is not in ${base}`)
    }
    git(work, 'checkout', '-q', '-b', 'main')
    mkdirSync(join(work, 'scripts/lib'), { recursive: true })
    writeFileSync(join(work, 'scripts/lib/telegram-api.cjs'), 'v1\n')
    writeFileSync(join(work, 'README'), 'a\n')
    git(work, 'add', '.')
    git(work, 'commit', '-q', '-m', 'one')
    git(work, 'push', '-q', 'origin', 'main')
    return { base, work }
  }
  const run = (work: string) => {
    try {
      execFileSync('bash', [GUARD, work], { stdio: 'pipe', env: CLEAN })
      return 0
    } catch (e) {
      return (e as { status: number }).status
    }
  }
  const advanceOrigin = (work: string, file: string) => {
    git(work, 'checkout', '-q', '-b', 'other')
    writeFileSync(join(work, file), 'v2\n')
    git(work, 'commit', '-q', '-am', 'two')
    git(work, 'push', '-q', 'origin', 'other:main')
    git(work, 'checkout', '-q', 'main')
  }

  it('refuses a checkout behind main in a host file, passes once fast-forwarded', () => {
    const { base, work } = repos()
    try {
      advanceOrigin(work, 'scripts/lib/telegram-api.cjs')
      expect(run(work)).toBe(3)
      git(work, 'merge', '-q', '--ff-only', 'origin/main')
      expect(run(work)).toBe(0)
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })

  it('behind main only in unrelated files: passes', () => {
    const { base, work } = repos()
    try {
      advanceOrigin(work, 'README')
      expect(run(work)).toBe(0)
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })

  it('a branch ahead of main with its own host changes: passes', () => {
    const { base, work } = repos()
    try {
      writeFileSync(join(work, 'scripts/lib/telegram-api.cjs'), 'mine\n')
      git(work, 'commit', '-q', '-am', 'mine')
      expect(run(work)).toBe(0)
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })
})
