/**
 * queen-watch: the rules that make it safe to run unattended every hour.
 * Every network call is a fake; nothing here reaches Railway, Telegram,
 * GitHub or the Queen.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { judge } from '../../apps/vibee-editor/packages/vibee-atoms/src/spec-quality.ts'
import { config, hash8, issueSpec, kindOf, probe, run } from './watch.mjs'

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
} = {}) {
  const calls = []
  const out = []
  let restarts = 0
  const fetch = async (url, init = {}) => {
    const u = String(url)
    const body = init.body ? JSON.parse(init.body) : null
    const headers = init.headers || {}
    calls.push({ url: u, method: init.method || 'GET', body, headers })
    if (u.includes('/api/browser/approve')) {
      if (render === 'down')
        throw Object.assign(new Error(`fetch failed ${u}`), {
          name: 'TypeError',
        })
      if (!headers['x-api-key']) return res(401, { error: 'unauthorized' })
      if (typeof render === 'number') return res(render, {})
      return res(200, { said: 'This question has expired.' })
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
        return res(200, { data: { deploymentLogs: [] } })
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

it('a corrupt state file is a first run, not a crash', async () => {
  const cfg = cfgWith()
  writeFileSync(join(cfg.stateDir, 'state.json'), '{nope')
  const w = world()
  expect(await run(cfg, w.deps)).toBe(0)
  expect(w.sent('/queen/report')).toHaveLength(1)
})
