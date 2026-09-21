import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  importCookies,
  IMPORT_BATCH,
  MAX_IMPORT_BYTES,
  parseCookieExport,
  sitesOf,
  toCookieParam,
  type CookieParam,
} from './src/browser/cookie-import'
import { fixedDriver } from './src/browser/pod-driver'
import { handleBrowser } from './src/browser/routes'

/**
 * THE PERSON BRINGS THEIR LOGINS WITH THEM, IN ONE GO.
 *
 * Fixture values are obviously fake and short: a real session value in a
 * test is a leaked session.
 */

const NOW = 1_800_000_000
const LATER = NOW + 86_400

describe('reading what people actually export', () => {
  it('reads Cookie-Editor JSON, domain and host-only alike', () => {
    const { cookies, skipped } = parseCookieExport(
      JSON.stringify([
        {
          name: 'sid',
          value: 'v1',
          domain: '.habr.com',
          hostOnly: false,
          path: '/',
          secure: true,
          httpOnly: true,
          sameSite: 'lax',
          expirationDate: LATER,
        },
        {
          name: 'pref',
          value: 'v2',
          domain: 'account.habr.com',
          hostOnly: true,
          path: '/',
          secure: true,
          httpOnly: false,
          sameSite: 'no_restriction',
        },
      ]),
      NOW
    )
    expect(skipped).toBe(0)
    expect(cookies[0]).toEqual({
      name: 'sid',
      value: 'v1',
      domain: '.habr.com',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
      expires: LATER,
    })
    /* HOST-ONLY STAYS HOST-ONLY: by url, never by domain. */
    expect(cookies[1].url).toBe('https://account.habr.com/')
    expect(cookies[1].domain).toBeUndefined()
    expect(cookies[1].sameSite).toBe('None')
  })

  it('reads Playwright storageState', () => {
    const { cookies } = parseCookieExport(
      JSON.stringify({
        cookies: [
          {
            name: 'a',
            value: 'b',
            domain: '.example.com',
            path: '/',
            expires: LATER,
            httpOnly: false,
            secure: false,
            sameSite: 'Strict',
          },
        ],
        origins: [],
      }),
      NOW
    )
    expect(cookies).toHaveLength(1)
    expect(cookies[0].sameSite).toBe('Strict')
  })

  it('reads Netscape cookies.txt, HttpOnly lines included', () => {
    const txt = [
      '# Netscape HTTP Cookie File',
      '',
      `.example.com\tTRUE\t/\tTRUE\t${LATER}\tsid\tv1`,
      `#HttpOnly_host.example.com\tFALSE\t/app\tFALSE\t0\ttok\tv2`,
    ].join('\n')
    const { cookies, skipped } = parseCookieExport(txt, NOW)
    expect(skipped).toBe(0)
    expect(cookies[0]).toMatchObject({ domain: '.example.com', secure: true })
    expect(cookies[1]).toMatchObject({
      url: 'http://host.example.com/app',
      httpOnly: true,
      path: '/app',
    })
    /* 0 means a session cookie: no expiry, not "expired in 1970". */
    expect(cookies[1].expires).toBeUndefined()
  })
})

describe('what is skipped rather than guessed', () => {
  const base = { name: 'n', value: 'v', domain: '.example.com', path: '/' }

  it('SKIPS WHAT IS ALREADY DEAD', () => {
    expect(toCookieParam({ ...base, expirationDate: NOW - 1 }, NOW)).toBeNull()
  })

  it('reads milliseconds as seconds', () => {
    expect(
      toCookieParam({ ...base, expirationDate: LATER * 1000 }, NOW)?.expires
    ).toBe(LATER)
  })

  it('drops SameSite=None without Secure, which Chromium refuses', () => {
    const c = toCookieParam({ ...base, sameSite: 'none', secure: false }, NOW)
    expect(c?.sameSite).toBeUndefined()
  })

  it('skips a name or value that could break a header', () => {
    expect(toCookieParam({ ...base, name: 'a b' }, NOW)).toBeNull()
    expect(
      toCookieParam({ ...base, value: 'x\r\nSet-Cookie: y' }, NOW)
    ).toBeNull()
    expect(toCookieParam({ ...base, domain: 'evil.com/path' }, NOW)).toBeNull()
    expect(toCookieParam({ ...base, domain: 42 }, NOW)).toBeNull()
  })

  it('counts what it skipped', () => {
    const { cookies, skipped } = parseCookieExport(
      JSON.stringify([base, { name: 'x' }, 7, null]),
      NOW
    )
    expect(cookies).toHaveLength(1)
    expect(skipped).toBe(3)
  })

  it('refuses what is not an export at all', () => {
    expect(() => parseCookieExport('{not json', NOW)).toThrow()
    expect(() => parseCookieExport('[]', NOW)).toThrow()
    expect(() => parseCookieExport('{"a":1}', NOW)).toThrow()
  })

  it('REFUSES A DUMP LARGER THAN A BROWSER HAS', () => {
    expect(() =>
      parseCookieExport('x'.repeat(MAX_IMPORT_BYTES + 1), NOW)
    ).toThrow()
  })
})

describe('what the person is told', () => {
  it('names sites and counts, never a value', () => {
    const cookies = parseCookieExport(
      JSON.stringify([
        { name: 'a', value: 'SECRETVALUE1', domain: '.habr.com' },
        { name: 'b', value: 'SECRETVALUE2', domain: 'account.habr.com' },
        { name: 'c', value: 'SECRETVALUE3', domain: '.habr.com' },
      ]),
      NOW
    ).cookies
    const sites = sitesOf(cookies)
    expect(sites).toEqual({ 'habr.com': 2, 'account.habr.com': 1 })
    expect(JSON.stringify(sites)).not.toContain('SECRETVALUE')
  })
})

describe('into the browser', () => {
  it('writes them in batches the browser takes', async () => {
    const calls: [string, number][] = []
    const cookies = Array.from(
      { length: IMPORT_BATCH + 3 },
      (_, i): CookieParam => ({
        name: `n${i}`,
        value: 'v',
        domain: '.example.com',
        path: '/',
        secure: false,
        httpOnly: false,
      })
    )
    await importCookies('pod:9223', cookies, {
      wsUrl: async () => 'ws://browser',
      call: async (_ws, method, params) => {
        calls.push([method, (params!.cookies as unknown[]).length])
        return {}
      },
    })
    expect(calls).toEqual([
      ['Storage.setCookies', IMPORT_BATCH],
      ['Storage.setCookies', 3],
    ])
  })
})

describe('the door', () => {
  const OWNER = '900000001'
  const LIVE = {
    telegram_id: OWNER,
    session_id: 'sess-abcdefgh',
    pod_id: 'fixed',
    endpoint: 'pod:8080',
    cdp_endpoint: 'pod:9223',
    state: 'live',
    view_token: 'view-x',
    admin_token: 'admin-x',
  }
  const FILE = JSON.stringify([
    { name: 'sid', value: 'SECRETVALUE', domain: '.habr.com', secure: true },
  ])

  function deps(opts: {
    actor?: 'person' | 'agent'
    session?: Record<string, unknown> | null
    body?: string
  }) {
    const imported: CookieParam[][] = []
    return {
      imported,
      deps: {
        getPool: async () => ({
          query: async (sql: string) =>
            /select/i.test(sql) && /browser_sessions/i.test(sql) && opts.session
              ? { rows: [opts.session] }
              : { rows: [] },
        }),
        identity: () => OWNER,
        driver: fixedDriver({ endpoint: 'pod:8080' }),
        newToken: () => 'tok',
        actor: () => opts.actor ?? 'person',
        env: { BROWSER_POD_OWNER: OWNER },
        readBody: async () => opts.body ?? FILE,
        importCookies: async (_cdp: string, cookies: CookieParam[]) => {
          imported.push(cookies)
        },
      },
    }
  }
  const post = (d: unknown) =>
    handleBrowser({ url: '/api/browser/cookies', method: 'POST' }, d as never)

  it('IS THE PERSON’S DOOR ONLY: an agent key is refused', async () => {
    const d = deps({ actor: 'agent', session: LIVE })
    const out = await post(d.deps)
    expect(out.status).toBe(403)
    expect(d.imported).toHaveLength(0)
  })

  it('needs a browser to put them in', async () => {
    const d = deps({ session: null })
    expect((await post(d.deps)).status).toBe(409)
    expect(d.imported).toHaveLength(0)
  })

  it('PUTS THEM IN, AND ANSWERS WITHOUT A SINGLE VALUE', async () => {
    const d = deps({ session: LIVE })
    const out = await post(d.deps)
    expect(out.status).toBe(200)
    expect(out.body).toMatchObject({ ok: true, imported: 1, skipped: 0 })
    expect(out.body.sites).toEqual({ 'habr.com': 1 })
    expect(JSON.stringify(out.body)).not.toContain('SECRETVALUE')
    expect(d.imported[0][0].name).toBe('sid')
  })

  it('says what is wrong with a bad file, and imports nothing', async () => {
    const d = deps({ session: LIVE, body: 'this is not a file' })
    const out = await post(d.deps)
    expect(out.status).toBe(400)
    expect(d.imported).toHaveLength(0)
  })

  it('takes only POST', async () => {
    const d = deps({ session: LIVE })
    const out = await handleBrowser(
      { url: '/api/browser/cookies', method: 'GET' },
      d.deps as never
    )
    expect(out.status).toBe(405)
  })
})

describe('the wiring, read as text', () => {
  it('the server gives the import its body reader, capped', () => {
    const src = readFileSync(join(__dirname, 'render-server.ts'), 'utf8')
    expect(src).toMatch(
      /readBody: \(r, maxBytes\) => readBody\(r as any, maxBytes\)/
    )
  })

  it('an agent opening a page goes through the rule of what it may open', () => {
    const src = readFileSync(
      join(__dirname, 'src', 'browser', 'agent-tools.ts'),
      'utf8'
    )
    const open = src.slice(src.indexOf("name: 'browser_open'"))
    expect(open.indexOf('agentMayOpen(')).toBeGreaterThan(-1)
    expect(open.indexOf('agentMayOpen(')).toBeLessThan(open.indexOf('newPage('))
  })
})
