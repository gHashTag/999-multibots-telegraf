/*
 * Runs under both runners, as deployment/check-runner/server.test.mjs does:
 * vitest collects it with the repository's suite, and
 * `node --test deployment/ci-bridge/bridge.test.mjs` runs it alone with
 * nothing installed. GitHub and the runner are fakes; tar is the real one.
 */
const { describe, it } = process.env.VITEST
  ? await import('vitest')
  : await import('node:test')
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createVerify, generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  CONTEXT,
  SUITES,
  needsRun,
  ownHead,
  recent,
  redact,
  resultOf,
  appJwt,
  sh,
  tokenOf,
  tailOf,
  tick,
  verdict,
} from './bridge.mjs'

const REPO = 'gHashTag/999-multibots-telegraf'
const TOKEN = 'fake-github-token-value-123' // secret-guard-ok: test fake, not a credential
const RUNNER_KEY = 'runner-fake-key-456' // secret-guard-ok: test fake, not a credential
const cfg = {
  token: TOKEN,
  runnerKey: RUNNER_KEY,
  runnerUrl: 'http://check-runner.internal:8080',
  repo: REPO,
  pollMs: 1000,
  staleMs: 60 * 60_000,
  work: mkdtempSync(join(tmpdir(), 'ci-bridge-')),
  since: Date.parse('2026-10-09T10:00:00Z'),
}

/* A commit tarball the way GitHub sends it: one top directory. */
function tarball() {
  const d = mkdtempSync(join(tmpdir(), 'ci-bridge-src-'))
  const top = join(d, 'gHashTag-999-multibots-telegraf-abc1234')
  mkdirSync(join(top, 'src'), { recursive: true })
  mkdirSync(join(top, 'avatar_brain'), { recursive: true })
  mkdirSync(join(top, 'data', 'backups'), { recursive: true })
  writeFileSync(join(top, 'src', 'a.ts'), 'export const a = 1\n')
  writeFileSync(join(top, 'src', 'clip.mp4'), 'video')
  writeFileSync(join(top, 'avatar_brain', 'face.jpg'), 'photo')
  writeFileSync(join(top, 'data', 'backups', 'rows.json'), '[]')
  return execFileSync('tar', [
    '-czf',
    '-',
    '-C',
    d,
    'gHashTag-999-multibots-telegraf-abc1234',
  ])
}

const pr = (
  number,
  sha,
  fullName = REPO,
  updated = '2026-10-09T11:00:00Z'
) => ({
  number,
  updated_at: updated,
  head: { sha, repo: { full_name: fullName } },
})

const ok = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })

/* A fake GitHub + runner; records every call. */
function world({ prs, statuses = {}, runnerSays }) {
  const calls = []
  const fetch = async (url, init = {}) => {
    const u = new URL(url)
    calls.push({
      url: u.pathname + u.search,
      method: init.method || 'GET',
      init,
    })
    if (u.pathname.endsWith('/pulls')) return ok(prs)
    const st = u.pathname.match(/\/commits\/([a-z0-9]+)\/status$/)
    if (st) return ok({ statuses: statuses[st[1]] || [] })
    if (/\/pulls\/\d+\/files$/.test(u.pathname))
      return ok([
        { filename: 'src/a.ts', status: 'modified' },
        { filename: 'src/gone.ts', status: 'removed' },
      ])
    if (u.pathname.includes('/tarball/')) return new Response(tarball())
    if (u.pathname.includes('/statuses/')) return ok({}, 201)
    if (u.pathname.endsWith('/comments')) return ok({}, 201)
    if (u.pathname === '/run') return new Response(runnerSays)
    throw new Error(`unexpected ${url}`)
  }
  return {
    calls,
    deps: {
      fetch,
      sh,
      now: () => Date.parse('2026-10-09T12:00:00Z'),
      log: () => {},
    },
  }
}

describe('which pull requests run', () => {
  it('a fork head never runs here', () => {
    assert.equal(ownHead(pr(1, 'a'), REPO), true)
    assert.equal(
      ownHead(pr(1, 'a', 'stranger/999-multibots-telegraf'), REPO),
      false
    )
    assert.equal(ownHead({ head: { repo: null } }, REPO), false)
  })

  it('a commit with our verdict is done; a lost pending runs again only when stale', () => {
    const now = Date.parse('2026-10-09T12:00:00Z')
    const hour = 60 * 60_000
    assert.equal(needsRun(null, now, hour), true)
    assert.equal(
      needsRun(
        { state: 'success', updated_at: '2026-01-01T00:00:00Z' },
        now,
        hour
      ),
      false
    )
    assert.equal(
      needsRun(
        { state: 'failure', updated_at: '2026-01-01T00:00:00Z' },
        now,
        hour
      ),
      false
    )
    assert.equal(
      needsRun(
        { state: 'pending', updated_at: '2026-10-09T11:30:00Z' },
        now,
        hour
      ),
      false
    )
    assert.equal(
      needsRun(
        { state: 'pending', updated_at: '2026-10-09T10:30:00Z' },
        now,
        hour
      ),
      true
    )
  })

  it('a PR untouched since the bridge began is not backfilled', () => {
    const since = Date.parse('2026-10-09T10:00:00Z')
    assert.equal(recent(pr(1, 'a', REPO, '2026-10-09T10:00:00Z'), since), true)
    assert.equal(recent(pr(1, 'a', REPO, '2026-10-09T09:59:59Z'), since), false)
    assert.equal(recent({}, since), false)
  })
})

describe('the verdict', () => {
  it('green only when every suite says 0', () => {
    assert.equal(verdict({ types: 0, guard: 0 }).state, 'success')
    const red = verdict({ types: 0, guard: 1 })
    assert.equal(red.state, 'failure')
    assert.match(red.description, /guard:FAIL\(1\)/)
  })

  it('no result, an empty one or a runner error is never green', () => {
    assert.equal(verdict(null).state, 'error')
    assert.equal(verdict({}).state, 'error')
    assert.equal(verdict({ error: 'boom' }).state, 'error')
  })

  it('the last ::result line is the one read', () => {
    const text = 'x\n::result {"types":1}\nmore\n::result {"types":0}\n'
    assert.deepEqual(resultOf(text), { types: 0 })
    assert.equal(resultOf('no result here'), null)
    assert.equal(resultOf('::result {broken'), null)
  })

  it('heartbeats are not part of the tail', () => {
    assert.equal(
      tailOf(':: still working\nreal\n:: queued, 1 ahead\nend', 10),
      'real\nend'
    )
  })

  it('a secret never survives redaction', () => {
    assert.equal(
      redact(`a ${TOKEN} b ${RUNNER_KEY}`, [TOKEN, RUNNER_KEY]),
      'a *** b ***'
    )
  })
})

describe('one pass', () => {
  it('runs our own unchecked head and posts pending, then success', async () => {
    const w = world({
      prs: [
        pr(7, 'aaa111'),
        pr(8, 'bbb222', 'stranger/fork'),
        pr(9, 'ccc333'),
        pr(10, 'ddd444', REPO, '2026-10-08T00:00:00Z'),
      ],
      statuses: {
        ccc333: [
          {
            context: CONTEXT,
            state: 'success',
            updated_at: '2026-10-09T11:00:00Z',
          },
        ],
      },
      runnerSays:
        ':: still working\n::result {"types":0,"render-types":0,"guard":0,"boots":0}\n',
    })
    const done = await tick(cfg, w.deps)
    assert.deepEqual(
      done.map(d => [d.number, d.state]),
      [[7, 'success']]
    )
    const posted = w.calls.filter(c => c.url.includes('/statuses/'))
    assert.deepEqual(
      posted.map(c => [c.url, JSON.parse(c.init.body).state]),
      [
        [`/repos/${REPO}/statuses/aaa111`, 'pending'],
        [`/repos/${REPO}/statuses/aaa111`, 'success'],
      ]
    )
    assert.ok(posted.every(c => JSON.parse(c.init.body).context === CONTEXT))
    assert.equal(w.calls.filter(c => c.url.endsWith('/comments')).length, 0)
    assert.ok(
      !w.calls.some(c => c.url.includes('bbb222')),
      'the fork is never touched'
    )
    assert.ok(
      !w.calls.some(c => c.url.includes('ddd444')),
      'a PR untouched since the start is not backfilled'
    )
  })

  it('sends the runner the local gates, the changed files and no ballast', async () => {
    const w = world({
      prs: [pr(7, 'aaa111')],
      runnerSays: '::result {"types":0}\n',
    })
    await tick(cfg, w.deps)
    const run = w.calls.find(c => c.url.startsWith('/run'))
    assert.equal(run.url, `/run?suites=${SUITES.join(',')}&files=`)
    assert.equal(run.init.headers['X-Check-Key'], RUNNER_KEY)
    const d = mkdtempSync(join(tmpdir(), 'ci-bridge-got-'))
    writeFileSync(join(d, 'got.tgz'), run.init.body)
    const names = execFileSync('tar', ['-tzf', join(d, 'got.tgz')], {
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean)
      .map(n => n.replace(/^\.\//, ''))
    assert.ok(
      names.includes('src/a.ts'),
      'the code is at the root, top directory stripped'
    )
    assert.ok(names.includes('.check-files'))
    assert.ok(
      !names.some(
        n =>
          n.includes('avatar_brain') ||
          n.includes('data/backups') ||
          n.endsWith('.mp4')
      )
    )
    execFileSync('tar', ['-xzf', join(d, 'got.tgz'), '-C', d, './.check-files'])
    const { readFileSync } = await import('node:fs')
    assert.equal(readFileSync(join(d, '.check-files'), 'utf8'), 'src/a.ts\n')
  })

  it('a red run posts failure and one comment with the tail, secrets scrubbed', async () => {
    const w = world({
      prs: [pr(7, 'aaa111')],
      runnerSays: `FAIL src/a.test.ts\nleaked ${TOKEN}\n::result {"types":0,"guard":1}\n`,
    })
    const [d] = await tick(cfg, w.deps)
    assert.equal(d.state, 'failure')
    const comments = w.calls.filter(c => c.url.endsWith('/comments'))
    assert.equal(comments.length, 1)
    const body = JSON.parse(comments[0].init.body).body
    assert.match(body, /FAIL src\/a\.test\.ts/)
    assert.ok(!body.includes(TOKEN))
  })

  it('a runner that cannot be reached is an error status, never success', async () => {
    const w = world({ prs: [pr(7, 'aaa111')], runnerSays: '' })
    const fetch = w.deps.fetch
    w.deps.fetch = async (url, init) => {
      if (new URL(url).pathname === '/run')
        throw new Error('connect ECONNREFUSED')
      return fetch(url, init)
    }
    const [d] = await tick(cfg, w.deps)
    assert.equal(d.state, 'error')
    assert.match(d.description, /ECONNREFUSED/)
    /* the person hears why, as on a red run */
    assert.equal(w.calls.filter(c => c.url.endsWith('/comments')).length, 1)
  })
})

describe('a GitHub App instead of a token', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  })
  const key = privateKey.export({ type: 'pkcs1', format: 'pem' })

  it('the JWT is RS256, signed by the app key, issued by the app', () => {
    const jwt = appJwt('42', key, Date.parse('2026-10-09T12:00:00Z'))
    const [h, b, sig] = jwt.split('.')
    const ok = createVerify('RSA-SHA256')
      .update(`${h}.${b}`)
      .verify(publicKey, Buffer.from(sig, 'base64url'))
    assert.equal(ok, true)
    const body = JSON.parse(Buffer.from(b, 'base64url').toString())
    assert.equal(body.iss, '42')
    assert.ok(
      body.exp - body.iat <= 600,
      'GitHub refuses a JWT over ten minutes'
    )
  })

  it('mints once, reuses the token, renews it before it ends', async () => {
    let now = Date.parse('2026-10-09T12:00:00Z')
    let minted = 0
    const fetch = async (url, init = {}) => {
      const u = new URL(url)
      assert.match(init.headers.Authorization, /^Bearer [^.]+\.[^.]+\.[^.]+$/)
      if (u.pathname === `/repos/${REPO}/installation`) return ok({ id: 7 })
      if (u.pathname === '/app/installations/7/access_tokens') {
        minted++
        return ok({
          token: `inst-${minted}`,
          expires_at: new Date(now + 60 * 60_000).toISOString(),
        })
      }
      throw new Error(`unexpected ${url}`)
    }
    const c = { ...cfg, token: '', appId: '42', appKey: key, minted: null }
    const deps = { fetch, now: () => now }
    assert.equal(await tokenOf(c, deps), 'inst-1')
    now += 50 * 60_000
    assert.equal(await tokenOf(c, deps), 'inst-1')
    now += 6 * 60_000
    assert.equal(await tokenOf(c, deps), 'inst-2')
  })

  it('an app not installed on the repository says why', async () => {
    const fetch = async () => ok({ message: 'Not Found' }, 404)
    const c = { ...cfg, token: '', appId: '42', appKey: key, minted: null }
    await assert.rejects(tokenOf(c, { fetch, now: Date.now }), /404 Not Found/)
  })
})
