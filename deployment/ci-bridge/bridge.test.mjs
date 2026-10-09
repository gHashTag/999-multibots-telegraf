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
  markMode,
  needsRun,
  runAsStatus,
  runsHere,
  redact,
  resultOf,
  appJwt,
  config,
  heal,
  marker,
  commentMark,
  recheckAsked,
  missing,
  serve,
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
function world({
  prs,
  statuses = {},
  checkRuns = {},
  issueComments = {},
  runnerSays,
}) {
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
    const runs = u.pathname.match(/\/commits\/([a-z0-9]+)\/check-runs$/)
    if (runs) return ok({ check_runs: checkRuns[runs[1]] || [] })
    if (u.pathname.endsWith('/check-runs')) return ok({ id: 5 }, 201)
    if (u.pathname.endsWith('/check-runs/5')) return ok({ id: 5 })
    if (u.pathname.endsWith('/comments') && (init.method || 'GET') === 'GET') {
      const n = u.pathname.match(/issues\/(\d+)\/comments/)[1]
      return ok(issueComments[n] || [])
    }
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
    const since = Date.parse('2026-10-09T10:00:00Z')
    assert.equal(runsHere(pr(1, 'a'), REPO, since), true)
    assert.equal(
      runsHere(pr(1, 'a', 'stranger/999-multibots-telegraf'), REPO, since),
      false
    )
    assert.equal(runsHere({ head: { repo: null } }, REPO, since), false)
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
    assert.equal(
      runsHere(pr(1, 'a', REPO, '2026-10-09T10:00:00Z'), REPO, since),
      true
    )
    assert.equal(
      runsHere(pr(1, 'a', REPO, '2026-10-09T09:59:59Z'), REPO, since),
      false
    )
    assert.equal(
      runsHere({ head: { repo: { full_name: REPO } } }, REPO, since),
      false
    )
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
          ...(minted === 2
            ? { permissions: { pull_requests: 'write', checks: 'read' } }
            : {}),
          expires_at: new Date(now + 60 * 60_000).toISOString(),
        })
      }
      throw new Error(`unexpected ${url}`)
    }
    /* a leftover token does not shadow the app */
    const c = {
      ...cfg,
      token: 'leftover',
      appId: '42',
      appKey: key,
      minted: null,
    }
    const logs = []
    const deps = { fetch, now: () => now, log: m => logs.push(m) }
    assert.equal(await tokenOf(c, deps), 'inst-1')
    assert.deepEqual(logs, ['app token: no permissions'])
    now += 50 * 60_000
    assert.equal(await tokenOf(c, deps), 'inst-1')
    now += 6 * 60_000
    assert.equal(await tokenOf(c, deps), 'inst-2')
    assert.equal(logs[1], 'app token: checks=read pull_requests=write')
  })

  it('an app not installed on the repository says why', async () => {
    const fetch = async () => ok({ message: 'Not Found' }, 404)
    const c = { ...cfg, token: '', appId: '42', appKey: key, minted: null }
    await assert.rejects(tokenOf(c, { fetch, now: Date.now }), /404 Not Found/)
  })
})

describe('a check run when statuses are not ours to write', () => {
  it('statuses first, checks when only checks may be written, null when neither', () => {
    assert.equal(markMode(undefined), 'statuses')
    assert.equal(markMode({ statuses: 'write', checks: 'write' }), 'statuses')
    assert.equal(markMode({ statuses: 'read', checks: 'write' }), 'checks')
    assert.equal(markMode({ pull_requests: 'read' }), null)
    assert.equal(markMode({ issues: 'write' }), 'comment')
    assert.equal(
      markMode({ pull_requests: 'write', checks: 'read' }),
      'comment'
    )
  })

  it('a run in progress reads as pending, a finished one as its conclusion', () => {
    assert.equal(runAsStatus(null), null)
    assert.deepEqual(
      runAsStatus({
        status: 'in_progress',
        started_at: '2026-10-09T11:00:00Z',
      }),
      { state: 'pending', updated_at: '2026-10-09T11:00:00Z' }
    )
    assert.deepEqual(
      runAsStatus({
        status: 'completed',
        conclusion: 'failure',
        started_at: '2026-10-09T11:00:00Z',
        completed_at: '2026-10-09T11:05:00Z',
      }),
      { state: 'failure', updated_at: '2026-10-09T11:05:00Z' }
    )
  })

  const appCfg = {
    ...cfg,
    token: '',
    appId: '42',
    appKey: 'unused: the token below is still fresh',
    minted: {
      token: 'inst-token',
      until: Date.parse('2026-10-10T00:00:00Z'),
      perms: { checks: 'write', pull_requests: 'read' },
    },
  }

  it('opens a run, then completes it with the verdict and the tail', async () => {
    const w = world({
      prs: [pr(7, 'aaa111'), pr(9, 'ccc333')],
      checkRuns: {
        ccc333: [
          {
            status: 'completed',
            conclusion: 'success',
            completed_at: '2026-10-09T11:00:00Z',
          },
        ],
      },
      runnerSays: 'FAIL x.test.ts\n::result {"types":0,"guard":1}\n',
    })
    const [d, more] = await tick({ ...appCfg }, w.deps)
    assert.equal(more, undefined, 'a commit with a finished run is done')
    assert.equal(d.state, 'failure')
    assert.equal(w.calls.filter(c => c.url.includes('/statuses/')).length, 0)
    const open = w.calls.find(
      c => c.method === 'POST' && c.url.endsWith('/check-runs')
    )
    assert.deepEqual(JSON.parse(open.init.body), {
      name: CONTEXT,
      head_sha: 'aaa111',
      status: 'in_progress',
    })
    const end = w.calls.find(c => c.method === 'PATCH')
    const body = JSON.parse(end.init.body)
    assert.equal(end.url, `/repos/${REPO}/check-runs/5`)
    assert.equal(body.conclusion, 'failure')
    assert.match(body.output.text, /FAIL x\.test\.ts/)
  })

  it('an app that may write neither says so and runs nothing', async () => {
    const w = world({ prs: [pr(7, 'aaa111')], runnerSays: '' })
    const c = {
      ...appCfg,
      minted: { ...appCfg.minted, perms: { pull_requests: 'read' } },
    }
    await assert.rejects(tick(c, w.deps), /neither commit statuses nor checks/)
    assert.ok(!w.calls.some(c => c.url.startsWith('/run')))
  })
})

describe('a token takes over when the app may not mark', () => {
  it('falls back once to the configured token, which writes statuses', async () => {
    const w = world({
      prs: [pr(7, 'aaa111')],
      runnerSays: '::result {"types":0}\n',
    })
    const c = {
      ...cfg,
      token: 'fallback-token-value-1', // secret-guard-ok: test fake, not a credential
      appId: '42',
      appKey: 'unused: the minted token is fresh',
      minted: {
        token: 'inst-token-value-2', // secret-guard-ok: test fake, not a credential
        until: Date.parse('2026-10-10T00:00:00Z'),
        perms: { pull_requests: 'read' },
      },
    }
    const [d] = await tick(c, w.deps)
    assert.equal(d.state, 'success')
    const marks = w.calls.filter(x => x.url.includes('/statuses/'))
    assert.equal(marks.length, 2)
    assert.ok(
      marks.every(
        x => x.init.headers.Authorization === 'Bearer fallback-token-value-1'
      )
    )
  })
})

describe('starting the service', () => {
  it('reads its variables: a key with escaped newlines, a url without its slash', () => {
    const c = config({
      GITHUB_APP_ID: '42',
      GITHUB_APP_PRIVATE_KEY: 'line1\\nline2',
      CHECK_RUNNER_KEY: 'k',
      CHECK_RUNNER_URL: 'https://runner.example//',
      SINCE: '2026-10-09T17:00:00Z',
    })
    assert.equal(c.appKey, 'line1\nline2')
    assert.equal(c.runnerUrl, 'https://runner.example')
    assert.equal(c.repo, REPO)
    assert.equal(c.since, Date.parse('2026-10-09T17:00:00Z'))
    assert.equal(c.pollMs, 120_000)
    const before = Date.now()
    assert.ok(config({}).since >= before, 'no SINCE: the start itself')
  })

  it('names what a start lacks', () => {
    assert.deepEqual(missing(config({})), [
      'runnerKey',
      'runnerUrl',
      'token or app',
    ])
    assert.deepEqual(
      missing(
        config({
          CHECK_RUNNER_KEY: 'k',
          CHECK_RUNNER_URL: 'u',
          GITHUB_TOKEN: 't',
        })
      ),
      []
    )
    assert.deepEqual(
      missing(
        config({
          CHECK_RUNNER_KEY: 'k',
          CHECK_RUNNER_URL: 'u',
          GITHUB_APP_ID: '1',
        })
      ),
      ['token or app']
    )
  })

  it('a failed pass is a log line, and the service goes on', async () => {
    const logs = []
    let slept = 0
    const deps = {
      fetch: async () => new Response('{}', { status: 500 }),
      now: Date.now,
      sleep: async () => {
        slept++
      },
      log: m => logs.push(m),
    }
    await serve({ ...cfg }, deps, 2)
    assert.equal(slept, 2)
    assert.equal(logs.filter(l => l.startsWith('tick failed')).length, 2)
    assert.match(logs[0], /^watching /)
  })

  it('each round looks after its own deploy before the pass', async () => {
    const logs = []
    const deps = {
      fetch: async () => new Response('{}', { status: 500 }),
      now: Date.now,
      sleep: async () => {},
      log: m => logs.push(m),
    }
    const c = {
      ...cfg,
      ownSha: 'a',
      railwayToken: 'r',
      serviceId: 's',
      environmentId: 'e',
    }
    await serve(c, deps, 1)
    assert.match(logs[1], /^heal failed: GET \/repos\/.*\/commits -> 500/)
    assert.match(logs[2], /^tick failed/)
  })

  it('tar that dies early fails the pack, not the service', async () => {
    const { Readable } = await import('node:stream')
    const broken = new Readable({
      read() {
        this.destroy(new Error('connection reset'))
      },
    })
    await assert.rejects(
      sh('tar', ['-xzf', '-', '-C', tmpdir()], broken),
      /connection reset|tar exited/
    )
  })
})

describe('a fallback that fails says both reasons and lasts one pass', () => {
  it('names the missing permission and the token refusal; the next pass tries the app', async () => {
    const w = world({ prs: [pr(7, 'aaa111')], runnerSays: '' })
    const inner = w.deps.fetch
    w.deps.fetch = async (url, init) => {
      if (init?.headers?.Authorization === 'Bearer refused-token-value-1')
        return new Response(
          JSON.stringify({
            message: 'Resource not accessible by personal access token',
          }),
          { status: 403 }
        )
      return inner(url, init)
    }
    const c = {
      ...cfg,
      token: 'refused-token-value-1', // secret-guard-ok: test fake, not a credential
      appId: '42',
      appKey: 'unused: the minted token is fresh',
      minted: {
        token: 'inst-token-value-3', // secret-guard-ok: test fake, not a credential
        until: Date.parse('2026-10-10T00:00:00Z'),
        perms: { pull_requests: 'read' },
      },
    }
    await assert.rejects(tick(c, w.deps), err => {
      assert.match(err.message, /Checks: write/)
      assert.match(
        err.message,
        /GITHUB_TOKEN: GET .*403 Resource not accessible/
      )
      assert.ok(!err.message.includes('refused-token-value-1'))
      return true
    })
    assert.equal(c.preferToken, false, 'the next pass starts from the app')
    c.minted.perms = { checks: 'write' }
    w.deps.fetch = inner
    const [d] = await tick(c, w.deps)
    assert.ok(d, 'with the permission granted the app marks')
    assert.ok(
      w.calls.some(x => x.url.endsWith('/check-runs') && x.method === 'POST')
    )
  })
})

describe('/recheck runs a finished head again', () => {
  const done = { state: 'failure', updated_at: '2026-10-09T11:00:00Z' }
  const said = (body, association, at = '2026-10-09T11:30:00Z') => ({
    body,
    author_association: association,
    created_at: at,
  })

  it('a trusted /recheck after the mark asks; anything else does not', async () => {
    const ask = async comments => {
      const w = world({ prs: [], issueComments: { 7: comments } })
      return recheckAsked(cfg, w.deps, pr(7, 'aaa111'), done)
    }
    assert.equal(await ask([said(' /Recheck ', 'OWNER')]), true)
    assert.equal(await ask([said('/recheck', 'COLLABORATOR')]), true)
    assert.equal(await ask([said('/recheck', 'NONE')]), false)
    assert.equal(await ask([said('please /recheck', 'OWNER')]), false)
    assert.equal(
      await ask([said('/recheck', 'OWNER', '2026-10-09T10:00:00Z')]),
      false,
      'older than the mark'
    )
    assert.equal(await ask([]), false)
  })

  it('a pending or missing mark is never rechecked (and costs no request)', async () => {
    const w = world({ prs: [] })
    assert.equal(await recheckAsked(cfg, w.deps, pr(7, 'a'), null), false)
    assert.equal(
      await recheckAsked(cfg, w.deps, pr(7, 'a'), {
        state: 'pending',
        updated_at: done.updated_at,
      }),
      false
    )
    assert.equal(w.calls.length, 0)
  })

  it('a pass runs a rechecked head again', async () => {
    const w = world({
      prs: [pr(9, 'ccc333')],
      statuses: { ccc333: [{ context: CONTEXT, ...done }] },
      issueComments: { 9: [said('/recheck', 'MEMBER')] },
      runnerSays: '::result {"types":0}\n',
    })
    const [d] = await tick({ ...cfg }, w.deps)
    assert.equal(d.number, 9)
    assert.equal(d.state, 'success')
  })
})

describe('a bridge left on old code heals itself', () => {
  const base = {
    ...cfg,
    ownSha: 'old0000',
    railwayToken: 'railway-token-value-1', // secret-guard-ok: test fake, not a credential
    serviceId: 'svc',
    environmentId: 'env',
    startedAt: Date.parse('2026-10-09T12:00:00Z'),
    healed: false,
  }
  function rail({
    latest = 'new1111',
    compare = 'behind',
    railwayOk = true,
  } = {}) {
    const calls = []
    const fetch = async (url, init = {}) => {
      const u = new URL(url)
      calls.push({ url: u.pathname + u.search, init })
      if (u.hostname === 'backboard.railway.com')
        return railwayOk
          ? ok({ data: { serviceInstanceDeployV2: 'dep-1' } })
          : ok({ errors: [{ message: 'Not Authorized' }] })
      if (u.pathname.endsWith('/commits'))
        return ok(latest ? [{ sha: latest }] : [])
      if (u.pathname.includes('/compare/')) return ok({ status: compare })
      if (u.pathname.endsWith('/commits/main')) return ok({ sha: 'head222' })
      throw new Error(`unexpected ${url}`)
    }
    return { calls, fetch }
  }
  const at = min => Date.parse('2026-10-09T12:00:00Z') + min * 60_000

  it('stale after the grace: asks Railway to deploy main, once', async () => {
    const r = rail()
    const logs = []
    const c = { ...base }
    const deps = { fetch: r.fetch, now: () => at(11), log: m => logs.push(m) }
    assert.equal(await heal(c, deps), 'healing')
    const ask = r.calls.find(x => x.url === '/graphql/v2')
    assert.deepEqual(JSON.parse(ask.init.body).variables, {
      s: 'svc',
      e: 'env',
      c: 'head222',
    })
    assert.equal(await heal(c, deps), 'stale, waiting', 'once per process')
    assert.equal(r.calls.filter(x => x.url === '/graphql/v2').length, 1)
    assert.ok(!logs.join('').includes('railway-token-value-1'))
  })

  it('within the grace it waits; containing the latest it is fresh', async () => {
    assert.equal(
      await heal(
        { ...base },
        { fetch: rail().fetch, now: () => at(5), log() {} }
      ),
      'stale, waiting'
    )
    assert.equal(
      await heal(
        { ...base },
        { fetch: rail({ compare: 'ahead' }).fetch, now: () => at(30), log() {} }
      ),
      'fresh'
    )
    assert.equal(
      await heal(
        { ...base, ownSha: 'new1111' },
        { fetch: rail().fetch, now: () => at(30), log() {} }
      ),
      'fresh'
    )
    assert.equal(
      await heal(
        { ...base },
        { fetch: rail({ latest: null }).fetch, now: () => at(30), log() {} }
      ),
      'fresh'
    )
  })

  it('without Railway variables it is off; a refused deploy says so', async () => {
    assert.equal(
      await heal(
        { ...base, railwayToken: '' },
        { fetch: rail().fetch, now: () => at(30), log() {} }
      ),
      'off'
    )
    const logs = []
    assert.equal(
      await heal(
        { ...base },
        {
          fetch: rail({ railwayOk: false }).fetch,
          now: () => at(30),
          log: m => logs.push(m),
        }
      ),
      'refused'
    )
    assert.match(logs.join(' '), /redeploy ci-bridge by hand/)
  })
})

describe("the verdict as the app's own PR comment (spec v3)", () => {
  const APP = 4242
  const appCfg = {
    ...cfg,
    token: '',
    appId: String(APP),
    appKey: 'unused: the minted token is fresh',
    minted: {
      token: 'inst-token-value-4', // secret-guard-ok: test fake, not a credential
      until: Date.parse('2026-10-10T00:00:00Z'),
      perms: { checks: 'read', issues: 'write', pull_requests: 'write' },
    },
  }
  const byApp = (body, at = '2026-10-09T11:30:00Z', id = 1) => ({
    id,
    body,
    updated_at: at,
    created_at: at,
    performed_via_github_app: { id: APP },
  })

  it("reads only the app's own marker for this head", async () => {
    const read = async comments => {
      const w = world({ prs: [], issueComments: { 7: comments } })
      return commentMark(appCfg, w.deps, pr(7, 'aaa111'))
    }
    assert.deepEqual(await read([byApp(marker('aaa111', 'failure') + '\nx')]), {
      state: 'failure',
      updated_at: '2026-10-09T11:30:00Z',
      id: 1,
    })
    assert.equal(
      await read([
        {
          ...byApp(marker('aaa111', 'success')),
          performed_via_github_app: null,
        },
      ]),
      null,
      'a person pasting the marker makes no mark'
    )
    assert.equal(
      await read([byApp(marker('bbb222', 'success'))]),
      null,
      'another head'
    )
    assert.equal(await read([byApp('no marker')]), null)
  })

  it('opens one pending comment and edits it to the verdict with the tail', async () => {
    const w = world({
      prs: [pr(7, 'aaa111')],
      runnerSays: 'FAIL y.test.ts\n::result {"types":0,"guard":1}\n',
    })
    const inner = w.deps.fetch
    w.deps.fetch = async (url, init = {}) => {
      const u = new URL(url)
      const own = {
        url: u.pathname + u.search,
        method: init.method || 'GET',
        init,
      }
      if (u.pathname.endsWith('/comments') && init.method === 'POST') {
        w.calls.push(own)
        return new Response(JSON.stringify({ id: 77 }), { status: 201 })
      }
      if (u.pathname.endsWith('/issues/comments/77')) {
        w.calls.push(own)
        return new Response('{}')
      }
      return inner(url, init)
    }
    const [d] = await tick({ ...appCfg }, w.deps)
    assert.equal(d.state, 'failure')
    const posts = w.calls.filter(
      c => c.method === 'POST' && c.url.endsWith('/comments')
    )
    assert.equal(posts.length, 1, 'one comment, no second failure comment')
    assert.ok(
      JSON.parse(posts[0].init.body).body.startsWith(
        marker('aaa111', 'pending')
      )
    )
    const edit = w.calls.find(c => c.method === 'PATCH')
    const body = JSON.parse(edit.init.body).body
    assert.ok(body.startsWith(marker('aaa111', 'failure')))
    assert.match(body, /FAIL y\.test\.ts/)
    assert.equal(w.calls.filter(c => c.url.includes('/statuses/')).length, 0)
  })

  it('a head whose comment mark is finished is not run again', async () => {
    const w = world({
      prs: [pr(7, 'aaa111')],
      issueComments: { 7: [byApp(marker('aaa111', 'success'))] },
      runnerSays: '',
    })
    assert.deepEqual(await tick({ ...appCfg }, w.deps), [])
    assert.ok(!w.calls.some(c => c.url.startsWith('/run')))
  })
})
