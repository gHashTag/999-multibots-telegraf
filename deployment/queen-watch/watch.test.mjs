/**
 * queen-watch: the rules that make it safe to run unattended every hour.
 * Every network call is a fake; nothing here reaches Railway, Telegram,
 * GitHub or the Queen.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  boundaryPaths,
  judge,
} from '../../apps/vibee-editor/packages/vibee-atoms/src/spec-quality.ts'
import {
  BROWSER_PAGE,
  PAGE_ASSETS_MAX,
  PAGE_ISSUE_TITLE,
  RELAYS_ISSUE_TITLE,
  assetsOf,
  config,
  hash8,
  issueSpec,
  kindOf,
  pageIssueSpec,
  probe,
  probeBrowserPage,
  run,
  tellOwner,
} from './watch.mjs'
/* A namespace too: a helper an older watch.mjs lacks is undefined in the one
 * test that needs it, instead of failing the whole file at load. */
import * as watchNs from './watch.mjs'

/* Deliberately fake values, long enough to be scrubbed. */
const BOT_KEY = 'fake-bot-key-0001'
const OTHER_KEY = 'fake-render-key-0002'
const RAIL = 'fake-railway-tok-0003'
const QUEEN = 'fake-queen-tok-0004'
const TG = 'fake-tg-tok-0005'
const GH = 'fake-gh-tok-0006'
const SECRETS = [BOT_KEY, OTHER_KEY, RAIL, QUEEN, TG, GH]

function cfgWith(over = {}) {
  return {
    ...config({
      BOT_RENDER_API_KEY: BOT_KEY,
      RENDER_API_KEY: BOT_KEY,
      RAILWAY_API_TOKEN: RAIL,
      RAILWAY_ENVIRONMENT_ID: 'env-1',
      BOT_SERVICE_ID: 'bot-svc',
      RENDER_SERVICE_ID: 'render-svc',
      TRIOS_API_TOKEN: QUEEN,
      OWNER_BOT_TOKEN: TG,
      GITHUB_TOKEN: GH,
      STATE_DIR: mkdtempSync(join(tmpdir(), 'queen-watch-')),
    }),
    /* The page watch is off unless a test turns it on: the relays tests
     * count every post, and the page is a second reporter. */
    pageUrl: '',
    ...over,
  }
}

const res = (status, body) => ({
  status,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
})

/**
 * A fake world. `render` decides how the render answers ('ok' | 'down' |
 * a status code for approve); the rest answers like production.
 */
function world({
  render = 'ok',
  queen = 201,
  issues = [],
  restartOk = true,
  said = null,
  logs = [],
  site = null,
} = {}) {
  const calls = []
  const out = []
  let restarts = 0
  const fetch = async (url, init = {}) => {
    const u = String(url)
    const body = init.body ? JSON.parse(init.body) : null
    const headers = init.headers || {}
    calls.push({
      url: u,
      method: init.method || 'GET',
      body,
      raw: init.body || '',
      headers,
      redirect: init.redirect,
    })
    if (site && u.startsWith(SITE)) return site(u, headers)
    if (u.includes('/api/browser/approve')) {
      if (render === 'down')
        throw Object.assign(new Error(`fetch failed ${u}`), {
          name: 'TypeError',
        })
      if (!headers['x-api-key']) return res(401, { error: 'unauthorized' })
      if (typeof render === 'number')
        return res(render, said === null ? {} : { said })
      return res(200, { said: said ?? 'This question has expired.' })
    }
    if (u.includes('/mcp')) {
      if (render === 'down')
        throw Object.assign(new Error('fetch failed'), { name: 'TypeError' })
      return res(200, {
        result: { structuredContent: { said: 'The card is out of date.' } },
      })
    }
    if (u.includes('backboard.railway.com')) {
      if (body.query.includes('deploymentRestart')) {
        restarts++
        if (restartOk) render = 'ok'
        return res(200, { data: { deploymentRestart: restartOk } })
      }
      if (body.query.includes('deploymentLogs')) {
        return res(200, {
          data: { deploymentLogs: logs.map(message => ({ message })) },
        })
      }
      return res(200, {
        data: {
          deployments: {
            edges: [
              {
                node: {
                  id: 'd1',
                  status: 'SUCCESS',
                  createdAt: new Date().toISOString(),
                },
              },
            ],
          },
        },
      })
    }
    if (u.includes('/queen/report')) return res(queen, { id: 7 })
    if (u.includes('api.telegram.org')) return res(200, { ok: true })
    if (u.includes('api.github.com')) {
      if (u.includes('/issues?')) return res(200, issues)
      if (u.endsWith('/comments')) return res(201, { id: 1 })
      if (u.endsWith('/issues'))
        return res(201, {
          number: 99,
          html_url: 'https://github.com/x/y/issues/99',
        })
    }
    return res(404, {})
  }
  const deps = {
    fetch,
    sleep: async () => {},
    now: () => 1_800_000_000,
    write: s => out.push(s),
    randomHex: n => 'ab'.repeat(n),
    restartRender: async () => {
      const r = await fetch('https://backboard.railway.com/graphql/v2', {
        method: 'POST',
        headers: {},
        body: JSON.stringify({ query: 'mutation { deploymentRestart }' }),
      })
      return (JSON.parse(await r.text()).data || {}).deploymentRestart === true
    },
  }
  return {
    deps,
    calls,
    out,
    stdout: () => out.join(''),
    restarts: () => restarts,
    sent: host =>
      calls.filter(c => c.url.includes(host) && c.method === 'POST'),
  }
}

/*
 * The BROWSER page as app.t27.ai serves it (measured 2026-10-04): the app's
 * index names /assets/ files, the board at /queen/ names /queen/assets/ files
 * and answers a top-level visit with a 302 to /game, a missing file is a 404
 * HTML page. Third-party files are named too, and must never be fetched.
 */
const SITE = 'https://app.example.test'
const PAGE = `${SITE}/game/browser?spec=specs%2Fdemos%2Fhello_world.t27`
const APP_HTML = `<!doctype html>
<html lang="en"><head>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<link rel="icon" href="/favicon.ico">
<script type="module" crossorigin src="/assets/index-AAA.js"></script>
<link rel="modulepreload" crossorigin href="/assets/vendor-BBB.js">
<link rel="stylesheet" crossorigin href="/assets/index-CCC.css">
</head><body><div id="root"></div></body></html>`
const boardHtml = (n = 3) => `<!DOCTYPE html>
<html lang="en"><head>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">
<script type="module" crossorigin src="/queen/assets/index-DDD.js"></script>
<link rel="stylesheet" crossorigin href="/queen/assets/index-FFF.css">
${Array.from({ length: n - 2 }, (_, i) => `<link rel="modulepreload" crossorigin href="/queen/assets/chunk-${i}.js">`).join('\n')}
</head><body><div id="root"></div></body></html>`

/**
 * The site as nginx serves it. `missing` paths answer 404 (or, with
 * `fallback`, 200 with the app's index); `down` drops every connection.
 */
function site({
  down = false,
  missing = [],
  fallback = false,
  board = boardHtml(),
  frame = 200,
  silent = [],
} = {}) {
  return (u, headers) => {
    const { pathname } = new URL(u)
    if (down || silent.includes(pathname))
      throw Object.assign(new Error(`fetch failed ${u}`), { name: 'TypeError' })
    if (missing.includes(pathname))
      return fallback
        ? res(200, APP_HTML)
        : res(404, '<html><body>404 Not Found</body></html>')
    if (pathname === '/game/browser') return res(200, APP_HTML)
    if (pathname === '/queen/') {
      if (headers['sec-fetch-dest'] === 'document' || frame === 302)
        return res(302, '')
      return res(frame, board)
    }
    if (pathname.endsWith('.js')) return res(200, 'export default 1')
    if (pathname.endsWith('.css')) return res(200, 'body{margin:0}')
    return res(404, '<html><body>404 Not Found</body></html>')
  }
}

describe('change detection', () => {
  it('reports on the first run, then stays quiet while nothing changes', async () => {
    const cfg = cfgWith()
    const w = world()
    expect(await run(cfg, w.deps)).toBe(0)
    expect(w.sent('/queen/report')).toHaveLength(1)
    expect(w.sent('api.telegram.org')).toHaveLength(1)

    const w2 = world()
    expect(await run(cfg, w2.deps)).toBe(0)
    expect(w2.sent('/queen/report')).toHaveLength(0)
    expect(w2.sent('api.telegram.org')).toHaveLength(0)
  })

  it('reports green -> red once, keeps quiet while red, reports red -> green', async () => {
    const cfg = cfgWith()
    await run(cfg, world().deps) // first run, green

    const red = world({ render: 403 })
    expect(await run(cfg, red.deps)).toBe(1)
    const q = red.sent('/queen/report')
    expect(q).toHaveLength(1)
    expect(q[0].body.needs_you).toBe(true)
    expect(Object.keys(q[0].body).sort()).toEqual([
      'body',
      'headline',
      'needs_you',
      'source',
    ])
    expect(q[0].body.headline.length).toBeLessThanOrEqual(120)

    const stillRed = world({ render: 403 })
    expect(await run(cfg, stillRed.deps)).toBe(1)
    expect(stillRed.sent('/queen/report')).toHaveLength(0)
    expect(stillRed.sent('api.telegram.org')).toHaveLength(0)

    const green = world()
    expect(await run(cfg, green.deps)).toBe(0)
    const back = green.sent('/queen/report')
    expect(back).toHaveLength(1)
    expect(back[0].body.needs_you).toBe(false)
    expect(green.sent('api.telegram.org')).toHaveLength(1)
  })

  it('keeps the state on the volume', async () => {
    const cfg = cfgWith()
    await run(cfg, world({ render: 403 }).deps)
    const st = JSON.parse(
      readFileSync(join(cfg.stateDir, 'state.json'), 'utf8')
    )
    expect(st.state).toBe('broken')
    expect(st.first).toBeUndefined()
  })
})

describe('heal', () => {
  it('a key mismatch is reported, never healed', async () => {
    const cfg = cfgWith({ renderKey: OTHER_KEY })
    const w = world({ render: 401 })
    expect(await run(cfg, w.deps)).toBe(1)
    expect(w.restarts()).toBe(0)
    expect(
      w.calls.some(c => c.body?.query?.includes('deploymentRestart'))
    ).toBe(false)
    /* No call anywhere writes a variable. */
    expect(w.calls.some(c => /variable/i.test(c.body?.query || ''))).toBe(false)
    const tg = w.sent('api.telegram.org')[0].body.text
    expect(tg).toContain('key parity')
    expect(tg).toContain(hash8(OTHER_KEY))
  })

  it('a render that does not answer is restarted once, and said so', async () => {
    const cfg = cfgWith()
    await run(cfg, world().deps)
    const w = world({ render: 'down' })
    expect(await run(cfg, w.deps)).toBe(0)
    expect(w.restarts()).toBe(1)
    expect(w.sent('api.telegram.org')[0].body.text).toContain('vibee-render')

    /* Down again inside six hours: no second restart. */
    const again = world({ render: 'down', restartOk: false })
    expect(await run(cfg, again.deps)).toBe(1)
    expect(again.restarts()).toBe(0)
  })

  it('kindOf: 000 and 5xx are down, 401/403 need a person', () => {
    expect(
      kindOf({ lines: [{ mark: 'FAIL', road: 'approve', code: 0 }] })
    ).toBe('down')
    expect(
      kindOf({ lines: [{ mark: 'FAIL', road: 'meeting', code: 502 }] })
    ).toBe('down')
    expect(
      kindOf({ lines: [{ mark: 'FAIL', road: 'approve', code: 401 }] })
    ).toBe('person')
    expect(kindOf({ lines: [{ mark: 'FAIL', road: 'parity' }] })).toBe('person')
  })
})

describe('the queen', () => {
  for (const status of [404, 429, 503]) {
    it(`a ${status} from the queen is tolerated and the other channels still fire`, async () => {
      const cfg = cfgWith()
      const w = world({ render: 403, queen: status })
      expect(await run(cfg, w.deps)).toBe(1)
      expect(w.stdout()).toContain('queen unreachable')
      if (status === 404)
        expect(w.stdout()).toContain('queen report route not deployed yet')
      expect(w.sent('api.telegram.org')).toHaveLength(1)
      expect(w.sent('api.github.com')).toHaveLength(1)
    })
  }
})

describe('secrets', () => {
  it('never appear in stdout, even when every road fails', async () => {
    for (const render of ['ok', 'down', 401, 500]) {
      const cfg = cfgWith({ renderKey: render === 401 ? OTHER_KEY : BOT_KEY })
      const w = world({ render })
      await run(cfg, w.deps)
      for (const s of SECRETS) expect(w.stdout()).not.toContain(s)
    }
  })

  it('a value that sneaks into a line is scrubbed', async () => {
    const cfg = cfgWith({ base: `https://x.test/${TG}` })
    const w = world()
    await run(cfg, w.deps)
    expect(w.stdout()).not.toContain(TG)
    expect(w.stdout()).toContain('[redacted]')
  })

  /*
   * The render's words and the bot's log lines are quoted outward. A secret
   * inside either must not reach the owner's DM, the Queen or GitHub.
   */
  const outbound = w =>
    ['/queen/report', 'api.telegram.org', 'api.github.com'].map(host => ({
      host,
      posts: w.sent(host),
    }))
  /* Every secret of cfgWith() (its renderKey is BOT_KEY, quoted via the log). */
  const leak = `leaked ${TG} ${RAIL} ${QUEEN} ${GH}`
  const logLine = `[browser-approval] relay failed {"key":"${BOT_KEY}"}`

  it('never appear in the Telegram, Queen or issue payload (red, new issue)', async () => {
    const w = world({ render: 403, said: leak, logs: [logLine] })
    expect(await run(cfgWith(), w.deps)).toBe(1)
    const sent = outbound(w)
    for (const { host, posts } of sent) {
      expect(posts.length, host).toBeGreaterThan(0)
      for (const p of posts) {
        for (const s of SECRETS) expect(p.raw, host).not.toContain(s)
        expect(p.raw, host).toContain('[redacted]')
      }
    }
    /* The bot log line really was quoted: the issue carries the warn line. */
    const issue = w.sent('api.github.com')[0]
    expect(issue.body.body).toContain('[browser-approval]')
  })

  it('never appear in an issue comment', async () => {
    const w = world({
      render: 403,
      said: leak,
      logs: [logLine],
      issues: [{ number: 41, html_url: 'https://github.com/x/y/issues/41' }],
    })
    await run(cfgWith(), w.deps)
    const [c] = w.sent('api.github.com')
    expect(c.url).toMatch(/\/comments$/)
    expect(c.body.body).toContain('[browser-approval]')
    for (const s of SECRETS) expect(c.raw).not.toContain(s)
  })

  it('never appear in the first-run green report', async () => {
    const w = world({ said: leak, logs: [logLine] })
    expect(await run(cfgWith(), w.deps)).toBe(0)
    const q = w.sent('/queen/report')
    expect(q).toHaveLength(1)
    expect(q[0].body.body).toContain('[redacted]')
    for (const { posts } of outbound(w))
      for (const p of posts)
        for (const s of SECRETS) expect(p.raw).not.toContain(s)
  })

  it('a secret with a quote or backslash is scrubbed in its JSON form too', async () => {
    const odd = 'fake"gh\\tok-0007'
    const cfg = cfgWith({ ghToken: odd })
    const w = world({ render: 403, said: `x ${odd} y` })
    await run(cfg, w.deps)
    const escaped = JSON.stringify(odd).slice(1, -1)
    for (const { host, posts } of outbound(w))
      for (const p of posts) {
        expect(p.raw, host).not.toContain(odd)
        expect(p.raw, host).not.toContain(escaped)
      }
  })

  it('a long message is scrubbed before it is cut, so no prefix survives', async () => {
    const cfg = cfgWith()
    const w = world()
    await tellOwner(cfg, w.deps, 'x'.repeat(3995) + TG)
    const [m] = w.sent('api.telegram.org')
    expect(m.body.text).toHaveLength(4000)
    expect(m.raw).not.toContain('fake-tg')
  })

  it('without RAILWAY_API_TOKEN the log is not measured, never ok', async () => {
    const r = await probe(cfgWith({ railwayToken: '' }), world().deps)
    expect(r.rc).toBe(2)
    expect(r.lines.find(l => l.road === 'log').mark).toBe('??')
  })

  it('without both keys nothing is measured', async () => {
    const r = await probe(cfgWith({ botKey: '' }), world().deps)
    expect(r.rc).toBe(2)
  })
})

describe('github', () => {
  it('comments on the open queen-watch issue instead of opening a duplicate', async () => {
    const cfg = cfgWith()
    const w = world({
      render: 403,
      issues: [{ number: 41, html_url: 'https://github.com/x/y/issues/41' }],
    })
    await run(cfg, w.deps)
    const posts = w.sent('api.github.com')
    expect(posts).toHaveLength(1)
    expect(posts[0].url).toMatch(/\/issues\/41\/comments$/)
  })

  it('ignores pull requests in the label search and opens one issue', async () => {
    const cfg = cfgWith()
    const w = world({ render: 403, issues: [{ number: 5, pull_request: {} }] })
    await run(cfg, w.deps)
    const posts = w.sent('api.github.com')
    expect(posts).toHaveLength(1)
    expect(posts[0].url).toMatch(/\/issues$/)
    expect(posts[0].body.labels).toEqual(['queen-watch'])
  })

  it('files nothing on green', async () => {
    const w = world()
    await run(cfgWith(), w.deps)
    expect(w.sent('api.github.com')).toHaveLength(0)
  })

  it('the issue body passes the Queen spec judge', async () => {
    const r = await probe(
      cfgWith({ renderKey: OTHER_KEY }),
      world({ render: 401 }).deps
    )
    const body = issueSpec({
      result: r,
      note: null,
      when: '2026-10-03T10:00:00Z',
    })
    const verdict = judge(body)
    expect(verdict.missing).toEqual([])
    expect(verdict.isSpec).toBe(true)
    expect(verdict.delegatable).toBe(true)
  })
})

it('no writable volume: the render is not restarted, and that is reported', async () => {
  /* A file where the state directory should be: mkdir fails (ENOTDIR). */
  const file = join(mkdtempSync(join(tmpdir(), 'queen-watch-')), 'not-a-dir')
  writeFileSync(file, '')
  const cfg = cfgWith({ stateDir: join(file, 'state') })
  for (let hour = 0; hour < 3; hour++) {
    const w = world({ render: 'down' })
    expect(await run(cfg, w.deps)).toBe(1)
    expect(w.restarts()).toBe(0)
    expect(w.stdout()).toContain('state not persisted -- heal skipped')
    expect(w.sent('/queen/report')[0].body.body).toContain('not persisted')
    expect(w.sent('api.telegram.org')).toHaveLength(1)
  }
})

it('a corrupt state file is a first run, not a crash', async () => {
  const cfg = cfgWith()
  writeFileSync(join(cfg.stateDir, 'state.json'), '{nope')
  const w = world()
  expect(await run(cfg, w.deps)).toBe(0)
  expect(w.sent('/queen/report')).toHaveLength(1)
})

describe('the owner bot reaches its own Bot API host', () => {
  const OURS = 'http://telegram-bot-api.railway.internal:8081'
  const FILES = 'http://telegram-bot-api.railway.internal:8082/'
  const MOVED = '900000011:ZZmovedmovedmovedmovedmovedmovedmoved' // secret-guard-ok: fake fixture token

  it('a bot moved to our server is never called on the cloud', async () => {
    const cfg = cfgWith({
      tgToken: MOVED,
      botApiEnv: {
        TELEGRAM_API_ROOT: OURS,
        TELEGRAM_API_FILES_ROOT: FILES,
        BOT_API_LOCAL_BOTS: '900000011',
      },
    })
    const w = world()
    await tellOwner(cfg, w.deps, 'hello')
    expect(w.sent('api.telegram.org')).toHaveLength(0)
    expect(w.sent(OURS)).toHaveLength(1)
  })

  it('a bot that stayed on the cloud still goes there', async () => {
    const cfg = cfgWith({
      tgToken: MOVED,
      botApiEnv: {
        TELEGRAM_API_ROOT: OURS,
        TELEGRAM_API_FILES_ROOT: FILES,
        BOT_API_LOCAL_BOTS: '900000044',
      },
    })
    const w = world()
    expect(await tellOwner(cfg, w.deps, 'hello')).toBe('sent to the owner')
    expect(w.sent('api.telegram.org')).toHaveLength(1)
  })

  it('unreadable routing sends nothing rather than guessing the cloud', async () => {
    const cfg = cfgWith({
      tgToken: MOVED,
      botApiEnv: { TELEGRAM_API_ROOT: 'not a url', BOT_API_LOCAL_BOTS: '1' },
    })
    const w = world()
    const said = await tellOwner(cfg, w.deps, 'hello')
    expect(said).toContain('not sent')
    expect(said).not.toContain('ZZmoved')
    expect(w.calls).toHaveLength(0)
  })
})

describe('the BROWSER page', () => {
  const pageCfg = (over = {}) => cfgWith({ pageUrl: PAGE, ...over })
  const toSite = w => w.calls.filter(c => c.url.startsWith(SITE))
  const issuePosts = w =>
    w.sent('api.github.com').filter(c => c.url.endsWith('/issues'))

  it('a healthy page: the page, the board as a frame asks, every asset 200', async () => {
    const w = world({ site: site() })
    const r = await probeBrowserPage(pageCfg(), w.deps)
    expect(r.rc).toBe(0)
    expect(r.lines.map(l => l.mark)).toEqual(['ok', 'ok', 'ok'])
    expect(r.lines[2].text).toBe(
      'assets: 6 of 6 answer 200 with a body that is not HTML (app 3, board 3)'
    )
    const board = toSite(w).find(c => c.url.includes('/queen/?'))
    expect(board.headers['sec-fetch-dest']).toBe('iframe')
    /* A followed redirect would hide a 302 to /game behind the app's 200. */
    for (const c of toSite(w)) expect(c.redirect).toBe('manual')
    /* Only our host, and no secret in any header: the page needs none. */
    expect(w.calls.every(c => c.url.startsWith(SITE))).toBe(true)
    for (const c of w.calls)
      for (const s of SECRETS)
        expect(JSON.stringify(c.headers)).not.toContain(s)
  })

  it('the first run reports once per watch; a second healthy run is quiet', async () => {
    const cfg = pageCfg()
    const w = world({ site: site() })
    expect(await run(cfg, w.deps)).toBe(0)
    const q = w.sent('/queen/report').map(p => p.body.headline)
    expect(q).toHaveLength(2)
    expect(q[1]).toContain('the BROWSER page watch')
    expect(w.stdout()).toContain('queen-watch: page: ok')

    const w2 = world({ site: site() })
    expect(await run(cfg, w2.deps)).toBe(0)
    expect(w2.sent('/queen/report')).toHaveLength(0)
    expect(w2.sent('api.telegram.org')).toHaveLength(0)
  })

  it('a missing asset (404) is broken, named by path and code, and not healed', async () => {
    const missing = ['/queen/assets/index-FFF.css']
    const r = await probeBrowserPage(
      pageCfg(),
      world({ site: site({ missing }) }).deps
    )
    expect(r.rc).toBe(1)
    expect(r.lines.filter(l => l.mark === 'FAIL').map(l => l.text)).toEqual([
      'asset: /queen/assets/index-FFF.css -> 404',
      'assets: 1 of 6 broken, 5 answer (app 3, board 3)',
    ])

    const w = world({ site: site({ missing }) })
    expect(await run(pageCfg(), w.deps)).toBe(1)
    /* One more look after a deploy swap's wait, then the report. */
    expect(toSite(w).filter(c => c.url === PAGE)).toHaveLength(2)
    const [made] = issuePosts(w)
    expect(made.body.title).toBe(PAGE_ISSUE_TITLE)
    expect(made.body.body).toContain('/queen/assets/index-FFF.css -> 404')
    const page = w
      .sent('/queen/report')
      .find(p => p.body.headline.includes('BROWSER page is broken'))
    expect(page.body.needs_you).toBe(true)
    expect(page.body.body).toContain('Not healed')
    /* The relays probe reads Railway's logs; nothing asks it to restart. */
    expect(w.restarts()).toBe(0)
    expect(
      w.calls.some(c => c.body?.query?.includes('deploymentRestart'))
    ).toBe(false)
  })

  it('an asset answered with an HTML page (an SPA fallback) is broken, not ok', async () => {
    const r = await probeBrowserPage(
      pageCfg(),
      world({
        site: site({ missing: ['/assets/index-AAA.js'], fallback: true }),
      }).deps
    )
    expect(r.rc).toBe(1)
    expect(r.lines.find(l => l.mark === 'FAIL').text).toContain(
      '/assets/index-AAA.js -> 200 but HTML'
    )
  })

  it('a board that redirects the frame is broken, not the app answering twice', async () => {
    const r = await probeBrowserPage(
      pageCfg(),
      world({ site: site({ frame: 302 }) }).deps
    )
    expect(r.rc).toBe(1)
    expect(r.lines.find(l => l.mark === 'FAIL').text).toBe(
      'board (as the frame asks): GET /queen/?lang=en -> 302 (expected 200)'
    )
  })

  it('a network error is not measured (exit 2), never broken', async () => {
    const r = await probeBrowserPage(
      pageCfg(),
      world({ site: site({ down: true }) }).deps
    )
    expect(r.rc).toBe(2)
    expect(r.lines.map(l => l.mark)).toEqual(['??'])
    expect(r.lines[0].text).toContain('NOT measured')

    const cfg = pageCfg()
    const w = world({ site: site({ down: true }) })
    expect(await run(cfg, w.deps)).toBe(2)
    expect(w.sent('api.github.com')).toHaveLength(0)
    /* One retry, then the first run says it could not measure. */
    expect(toSite(w).filter(c => c.url === PAGE)).toHaveLength(2)
    const q = w.sent('/queen/report').map(p => p.body)
    expect(q[1].headline).toContain('could not be measured')
    expect(q[1].needs_you).toBe(true)
    const st = JSON.parse(
      readFileSync(join(cfg.stateDir, 'state.json'), 'utf8')
    )
    expect(st.page.state).toBe('unmeasured')
    expect(st.state).toBe('ok')
  })

  it('an asset that does not answer is named and not measured, never broken', async () => {
    const r = await probeBrowserPage(
      pageCfg(),
      world({ site: site({ silent: ['/queen/assets/chunk-0.js'] }) }).deps
    )
    expect(r.rc).toBe(2)
    expect(r.lines.filter(l => l.mark !== 'ok').map(l => l.text)).toEqual([
      'asset: /queen/assets/chunk-0.js got no answer (TypeError) -- NOT measured',
      'assets: 5 of 6 answer, 1 got no answer -- NOT measured (app 3, board 3)',
    ])
  })

  it('caps the asset count and says the rest were NOT measured', async () => {
    const w = world({ site: site({ board: boardHtml(50) }) })
    const r = await probeBrowserPage(pageCfg(), w.deps)
    expect(r.rc).toBe(0)
    expect(toSite(w).filter(c => c.url.includes('/assets/'))).toHaveLength(
      PAGE_ASSETS_MAX
    )
    expect(r.lines.find(l => l.mark === 'warn').text).toBe(
      `assets: 53 named, ${PAGE_ASSETS_MAX} fetched (PAGE_ASSETS_MAX) -- the other ${53 - PAGE_ASSETS_MAX} NOT measured`
    )
  })

  it('the two watches keep separate state and separate issues', async () => {
    const cfg = pageCfg()
    /* Hour 1: relays broken, page fine. */
    const h1 = world({ render: 403, site: site() })
    expect(await run(cfg, h1.deps)).toBe(1)
    expect(issuePosts(h1).map(p => p.body.title)).toEqual([RELAYS_ISSUE_TITLE])
    let st = JSON.parse(readFileSync(join(cfg.stateDir, 'state.json'), 'utf8'))
    expect([st.state, st.page.state]).toEqual(['broken', 'ok'])

    /* Hour 2: relays fine, page broken. The relays' issue is still open:
     * the page opens its own instead of commenting on it. */
    const relaysIssue = {
      number: 41,
      title: RELAYS_ISSUE_TITLE,
      html_url: 'https://github.com/x/y/issues/41',
    }
    const h2 = world({
      site: site({ missing: ['/assets/vendor-BBB.js'] }),
      issues: [relaysIssue],
    })
    expect(await run(cfg, h2.deps)).toBe(1)
    const posts2 = h2.sent('api.github.com')
    expect(posts2).toHaveLength(1)
    expect(posts2[0].url).toMatch(/\/issues$/)
    expect(posts2[0].body.title).toBe(PAGE_ISSUE_TITLE)
    st = JSON.parse(readFileSync(join(cfg.stateDir, 'state.json'), 'utf8'))
    expect([st.state, st.page.state]).toEqual(['ok', 'broken'])
    const headlines2 = h2.sent('/queen/report').map(p => p.body.headline)
    expect(headlines2).toEqual([
      'the bot -> render roads work again',
      expect.stringContaining('the BROWSER page is broken'),
    ])

    /* Hour 3: both broken. The relays changed state and report, commenting
     * on their own issue; the page was already reported and stays quiet. */
    const h3 = world({
      render: 403,
      site: site({ missing: ['/assets/vendor-BBB.js'] }),
      issues: [
        relaysIssue,
        {
          number: 42,
          title: PAGE_ISSUE_TITLE,
          html_url: 'https://github.com/x/y/issues/42',
        },
      ],
    })
    expect(await run(cfg, h3.deps)).toBe(1)
    const posts3 = h3.sent('api.github.com')
    expect(posts3.map(p => p.url)).toEqual([
      'https://api.github.com/repos/gHashTag/999-multibots-telegraf/issues/41/comments',
    ])
    expect(h3.sent('/queen/report')).toHaveLength(1)
    expect(h3.stdout()).toContain(
      'queen-watch: page: still broken, already reported'
    )
  })

  it('a crash in one watch does not silence the other', async () => {
    const cfg = pageCfg()
    const w = world({ render: 'down', site: site() })
    w.deps.restartRender = async () => {
      throw new Error('boom')
    }
    expect(await run(cfg, w.deps)).toBe(2)
    expect(w.stdout()).toMatch(
      /queen-watch: the relays watch crashed: Error: boom \| at \S/
    )
    /* One line: no stack frame on a line of its own. */
    expect(w.stdout()).not.toMatch(/\n\s*at /)
    expect(w.stdout()).toContain('queen-watch: page: ok')
    expect(w.sent('/queen/report')).toHaveLength(1)
  })

  it('a crash is one scrubbed line: the message and its first frame', () => {
    const { crashLine } = watchNs
    const e = new TypeError(`bad answer ${RAIL}\nsecond line`)
    const line = crashLine('igla-loop:', e, SECRETS)
    expect(line).not.toMatch(/[\r\n]/)
    expect(line).toMatch(
      /^igla-loop: crashed: TypeError: bad answer \[redacted\] second line \| at \S/
    )
    expect(line).not.toContain(RAIL)
    /* Only the first frame: the rest of the stack is not in the line. */
    expect(line.split(' at ')).toHaveLength(2)
    expect(crashLine('queen-watch:', 'plain words', [])).toBe(
      'queen-watch: crashed: plain words'
    )
    expect(crashLine('queen-watch:', undefined, [])).toBe(
      'queen-watch: crashed: undefined'
    )
  })

  it('the page issue body passes the Queen spec judge, with both repos in its boundary', async () => {
    const r = await probeBrowserPage(
      pageCfg(),
      world({ site: site({ missing: ['/queen/assets/index-DDD.js'] }) }).deps
    )
    const body = pageIssueSpec({
      result: r,
      note: 'Not healed.',
      when: '2026-10-04T10:00:00Z',
      url: PAGE,
    })
    const verdict = judge(body)
    expect(verdict.missing).toEqual([])
    expect(verdict.isSpec).toBe(true)
    expect(verdict.delegatable).toBe(true)
    expect(boundaryPaths(body)).toEqual(
      expect.arrayContaining([
        'apps/vibee-editor/Dockerfile',
        'apps/website/vite.config.ts',
        'apps/website/src/components/QueenBrowser.tsx',
      ])
    )
  })

  it('assetsOf: same host, under the prefix, scripts/modulepreload/stylesheets, once each', () => {
    const html = `
      <script type=module src=/queen/assets/a.js></script>
      <script src='./assets/b.js'></script>
      <link href="/queen/assets/c.css" rel="stylesheet">
      <link rel="modulepreload" href="/queen/assets/a.js">
      <link rel="icon" href="/queen/assets/icon.svg">
      <link rel="preload" as="font" href="/queen/assets/f.woff2">
      <script src="https://cdn.example.org/queen/assets/x.js"></script>
      <script src="/assets/app.js"></script>
      <script>inline()</script>`
    expect(assetsOf(html, `${SITE}/queen/?lang=en`, '/queen/assets/')).toEqual([
      `${SITE}/queen/assets/a.js`,
      `${SITE}/queen/assets/b.js`,
      `${SITE}/queen/assets/c.css`,
    ])
  })

  it('watches the live address by default; BROWSER_PAGE_URL=off turns it off', () => {
    expect(config({}).pageUrl).toBe(BROWSER_PAGE)
    expect(config({ BROWSER_PAGE_URL: 'off' }).pageUrl).toBe('')
    expect(BROWSER_PAGE).toBe(
      'https://app.t27.ai/game/browser?spec=specs%2Fdemos%2Fhello_world.t27'
    )
  })
})
