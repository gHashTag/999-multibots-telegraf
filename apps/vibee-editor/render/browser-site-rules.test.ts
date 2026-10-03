import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_SITE_RULES,
  removeSiteRule,
  resetSiteRulesCache,
  ruleFor,
  setSiteRule,
  siteOf,
  siteRulesOf,
  type SiteRuleRow,
} from './src/browser/site-rules'
import { mayAct } from './src/browser/guard'
import { skipReason } from './src/browser/tab-shape'

/**
 * THE PERSON'S OWN SITE LIST (site-rules.ts).
 *
 * "ask" makes a site a bank for this person; "block" means the agent does not
 * open, read, shoot or act there at all. The agent may only tighten the list;
 * the person loosens it. Driven through the real handlers and the real route,
 * against a fake browser and an in-memory table.
 */

const row = (site: string, rule: 'ask' | 'block'): SiteRuleRow => ({
  site,
  rule,
  by: 'person',
  at: '2026-10-03T00:00:00.000Z',
})

describe('a site is one place on the web', () => {
  it.each([
    ['bank.com', 'bank.com'],
    ['https://WWW.Bank.com/', 'bank.com'],
    ['*.bank.com', 'bank.com'],
    ['https://yandex.ru/mail/?uid=1#inbox', 'yandex.ru/mail'],
    ['http://portal.clinic.example/records/', 'portal.clinic.example/records'],
  ])('%s -> %s', (raw, site) => {
    expect(siteOf(raw)).toBe(site)
  })

  it.each<[unknown, string]>([
    ['', 'empty'],
    ['localhost', 'no dot'],
    ['bank .com', 'a space'],
    ['chrome://settings', 'not the web'],
    ['javascript:alert(1)', 'not a place'],
    [42, 'not a string'],
  ])('%s is refused (%s)', raw => {
    expect(siteOf(raw)).toBeNull()
  })
})

describe('which rule covers an address', () => {
  const rules = [row('x.com', 'block'), row('yandex.ru/mail', 'ask')]

  it('a host covers itself and its sub-domains', () => {
    expect(ruleFor('https://x.com/home', rules)).toBe('block')
    expect(ruleFor('https://mobile.x.com/', rules)).toBe('block')
  })

  it('NOT by substring: netflix.com is not x.com', () => {
    /* guard.ts's shared list matches by includes; the person's list must not. */
    expect(ruleFor('https://www.netflix.com/browse', rules)).toBeNull()
    expect(ruleFor('https://x.com.evil.example/', rules)).toBeNull()
  })

  it('a path covers its corner and not the rest of the site', () => {
    expect(ruleFor('https://yandex.ru/mail/inbox', rules)).toBe('ask')
    expect(ruleFor('https://yandex.ru/mail', rules)).toBe('ask')
    expect(ruleFor('https://yandex.ru/mailbox', rules)).toBeNull()
    expect(ruleFor('https://yandex.ru/search?text=cats', rules)).toBeNull()
  })

  it('block beats ask, whichever comes first', () => {
    const both = [row('bank.com', 'ask'), row('bank.com/cards', 'block')]
    expect(ruleFor('https://bank.com/cards/1', both)).toBe('block')
    expect(ruleFor('https://bank.com/', both)).toBe('ask')
  })

  it("the browser's own pages and unreadable addresses are not the list's", () => {
    expect(ruleFor('chrome://settings', rules)).toBeNull()
    expect(ruleFor('not a url', rules)).toBeNull()
  })
})

describe('the guard reads "ask" as a bank', () => {
  it('needs a fresh yes on a page the shared list never names', () => {
    const at = { url: 'https://portal.clinic.example/', nowMs: 1e12 }
    expect(mayAct({ ...at, allowedAtMs: null }, []).allowed).toBe(true)
    expect(
      mayAct({ ...at, allowedAtMs: null, alsoSensitive: true }, []).allowed
    ).toBe(false)
    expect(
      mayAct({ ...at, allowedAtMs: 1e12 - 1000, alsoSensitive: true }, [])
        .allowed
    ).toBe(true)
  })

  it('the tab sweep does not even look at a blocked page', () => {
    expect(skipReason('https://x.com/', 'block')).toMatch(/blocked/)
    expect(skipReason('https://portal.clinic.example/', 'ask')).toMatch(
      /sensitive/
    )
    expect(skipReason('https://portal.clinic.example/', null)).toBeNull()
  })
})

/* An in-memory browser_site_rules plus the session row the tools need. */
type Stored = {
  telegram_id: string
  site: string
  rule: string
  by_whom: string
}
let table: Stored[] = []
let broken = false

const SESSION = {
  telegram_id: '900000001',
  session_id: 's1',
  pod_id: 'pod',
  endpoint: '127.0.0.1:1',
  cdp_endpoint: '127.0.0.1:2',
  allowed_ms: null,
  state: 'live',
  view_token: 'v',
  admin_token: 'a',
}

const pool = {
  query: async (text: string, params: unknown[] = []) => {
    if (text.includes('browser_site_rules')) {
      if (broken) throw new Error('connection refused')
      if (text.includes('CREATE TABLE')) return { rows: [] }
      if (text.startsWith('SELECT'))
        return {
          rows: table
            .filter(r => r.telegram_id === params[0])
            .map(r => ({ ...r, at: '2026-10-03T00:00:00.000Z' })),
        }
      if (text.startsWith('INSERT')) {
        const [telegram_id, site, rule, by_whom] = params as string[]
        table = table.filter(
          r => !(r.telegram_id === telegram_id && r.site === site)
        )
        table.push({ telegram_id, site, rule, by_whom })
        return { rows: [] }
      }
      if (text.startsWith('DELETE')) {
        const before = table.length
        table = table.filter(
          r => !(r.telegram_id === params[0] && r.site === params[1])
        )
        return { rows: before === table.length ? [] : [{ site: params[1] }] }
      }
    }
    /* Everything else is the session read. */
    return { rows: [SESSION] }
  },
}

beforeEach(() => {
  table = []
  broken = false
  resetSiteRulesCache()
})

describe('the list only tightens from the agent side', () => {
  const ID = '900000001'

  it('the agent adds a site and moves ask to block', async () => {
    expect(await setSiteRule(pool, ID, 'bank.com', 'ask', 'agent')).toEqual({
      ok: true,
      site: 'bank.com',
      rule: 'ask',
      was: null,
    })
    expect(await setSiteRule(pool, ID, 'bank.com', 'block', 'agent')).toEqual({
      ok: true,
      site: 'bank.com',
      rule: 'block',
      was: 'ask',
    })
  })

  it('the agent may NOT move block back to ask; the person may', async () => {
    await setSiteRule(pool, ID, 'bank.com', 'block', 'person')
    const r = await setSiteRule(pool, ID, 'bank.com', 'ask', 'agent')
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('expected a refusal')
    expect(r.status).toBe(403)
    expect((await siteRulesOf(pool, ID))![0].rule).toBe('block')
    expect((await setSiteRule(pool, ID, 'bank.com', 'ask', 'person')).ok).toBe(
      true
    )
  })

  it('setting what is already there is ok and changes nothing', async () => {
    await setSiteRule(pool, ID, 'bank.com', 'block', 'person')
    const r = await setSiteRule(pool, ID, 'https://bank.com/', 'block', 'agent')
    expect(r).toMatchObject({ ok: true, was: 'block' })
    expect(table[0].by_whom).toBe('person')
  })

  it('refuses a bad site, a bad rule and a list over the cap', async () => {
    expect(
      await setSiteRule(pool, ID, 'localhost', 'ask', 'person')
    ).toMatchObject({ ok: false, status: 400 })
    expect(
      await setSiteRule(pool, ID, 'bank.com', 'allow', 'person')
    ).toMatchObject({ ok: false, status: 400 })
    for (let i = 0; i < MAX_SITE_RULES; i++)
      table.push({
        telegram_id: ID,
        site: `s${i}.example`,
        rule: 'ask',
        by_whom: 'person',
      })
    expect(
      await setSiteRule(pool, ID, 'one-more.example', 'ask', 'person')
    ).toMatchObject({ ok: false, status: 409 })
  })

  it("one person never sees or changes another person's list", async () => {
    await setSiteRule(pool, ID, 'bank.com', 'block', 'person')
    expect(await siteRulesOf(pool, '900000002')).toEqual([])
    expect(await removeSiteRule(pool, '900000002', 'bank.com')).toBe(false)
    expect(table).toHaveLength(1)
  })

  it('an unreadable table is null, never an empty list', async () => {
    broken = true
    expect(await siteRulesOf(pool, ID)).toBeNull()
    expect(
      await setSiteRule(pool, ID, 'bank.com', 'block', 'agent')
    ).toMatchObject({ ok: false, status: 503 })
  })
})

/*
 * The tools, against a fake browser: what is asserted is that nothing
 * happens in the browser at a blocked site -- not merely that a call threw.
 */
const cdpCalls: string[] = []
const PAGE = { url: 'https://ru.wikipedia.org/wiki/x' }
/* listTargets throws (the pod's tab list did not answer). */
const TABS = { fail: false, others: [] as { id: string; url: string }[] }

vi.mock('./src/browser/cdp', async importOriginal => ({
  ...(await importOriginal<typeof import('./src/browser/cdp')>()),
  frontPage: async () => ({ id: 'page-1', url: PAGE.url }),
  listTargets: async () => {
    if (TABS.fail) throw new Error('cdp did not answer')
    return [
      { id: 'page-1', url: PAGE.url, type: 'page' },
      ...TABS.others.map(t => ({ ...t, type: 'page' })),
    ]
  },
  newPage: async (_c: string, url: string) => {
    cdpCalls.push(`newPage ${url}`)
    return { id: 'page-2', url }
  },
  activatePage: async () => undefined,
  closePage: async () => void cdpCalls.push('closePage'),
  evaluateOn: async () => {
    cdpCalls.push('evaluateOn')
    return {
      title: 'x',
      url: PAGE.url,
      text: 'x',
      readyState: 'complete',
      visible: true,
    }
  },
  clickAt: async () => void cdpCalls.push('clickAt'),
  typeText: async () => void cdpCalls.push('typeText'),
  screenshot: async () => {
    cdpCalls.push('screenshot')
    return 'AAAA'
  },
}))

vi.mock('./src/browser/screen', async importOriginal => ({
  ...(await importOriginal<typeof import('./src/browser/screen')>()),
  desktopShot: async () => {
    cdpCalls.push('desktopShot')
    return 'AAAA'
  },
}))

vi.mock('./src/agent/media-vision', async importOriginal => ({
  ...(await importOriginal<typeof import('./src/agent/media-vision')>()),
  visionConfig: () => null,
}))

const ctx = { telegramId: '900000001', requestId: 'r1', pool } as never

describe('the tools honour the list', () => {
  beforeAll(async () => {
    await import('./src/browser/agent-tools')
  }, 180_000)

  beforeEach(() => {
    cdpCalls.length = 0
    TABS.fail = false
    TABS.others = []
    SESSION.allowed_ms = null
  })

  const tool = async (name: string) => {
    const { BROWSER_TOOLS } = await import('./src/browser/agent-tools')
    const t = BROWSER_TOOLS.find(x => x.name === name)
    if (!t) throw new Error(`no tool ${name}`)
    return t
  }

  it('A BLOCKED SITE IS NOT OPENED, READ, SHOT OR TOUCHED', async () => {
    table.push({
      telegram_id: '900000001',
      site: 'bank.com',
      rule: 'block',
      by_whom: 'person',
    })
    await expect(
      (await tool('browser_open')).handler(
        { url: 'https://online.bank.com/' },
        ctx
      )
    ).rejects.toThrow(/blocked list/)
    PAGE.url = 'https://bank.com/cards'
    for (const [name, args] of [
      ['browser_read', {}],
      ['browser_screenshot', {}],
      ['browser_click', { x: 1, y: 1 }],
      ['browser_type', { text: 'x' }],
      ['browser_evaluate', { expression: '1' }],
    ] as const)
      await expect((await tool(name)).handler(args, ctx), name).rejects.toThrow(
        /blocked list/
      )
    expect(cdpCalls).toEqual([])
  })

  it('"ask" makes an ordinary site a bank: reading yes, acting needs a yes', async () => {
    table.push({
      telegram_id: '900000001',
      site: 'portal.clinic.example',
      rule: 'ask',
      by_whom: 'person',
    })
    PAGE.url = 'https://portal.clinic.example/records'
    await expect(
      (await tool('browser_read')).handler({}, ctx)
    ).resolves.toBeTruthy()
    await expect(
      (await tool('browser_click')).handler({ x: 1, y: 1 }, ctx)
    ).rejects.toThrow(/browser_ask_permission/)
    expect(cdpCalls).not.toContain('clickAt')
  })

  it('an unreadable list opens, reads and acts on nothing, not even after a yes', async () => {
    broken = true
    PAGE.url = 'https://ru.wikipedia.org/wiki/x'
    /* A fresh yes: browser_evaluate reads too, so the yes is not enough. */
    SESSION.allowed_ms = Date.now() as never
    await expect(
      (await tool('browser_open')).handler(
        { url: 'https://ru.wikipedia.org/' },
        ctx
      )
    ).rejects.toThrow(/could not be read/)
    for (const [name, args] of [
      ['browser_read', {}],
      ['browser_screenshot', {}],
      ['browser_screenshot', { desktop: true }],
      ['browser_click', { x: 1, y: 1 }],
      ['browser_evaluate', { expression: 'document.body.innerText' }],
    ] as const)
      await expect((await tool(name)).handler(args, ctx), name).rejects.toThrow(
        /could not be read/
      )
    expect(cdpCalls).toEqual([])
  })

  it('a tab whose address cannot be read is blocked while the list blocks anything', async () => {
    table.push({
      telegram_id: '900000001',
      site: 'bank.com',
      rule: 'block',
      by_whom: 'person',
    })
    PAGE.url = 'https://bank.com/cards'
    TABS.fail = true
    SESSION.allowed_ms = Date.now() as never
    for (const [name, args] of [
      ['browser_read', {}],
      ['browser_screenshot', {}],
      ['browser_screenshot', { desktop: true }],
      ['browser_evaluate', { expression: '1' }],
      ['browser_click', { x: 1, y: 1 }],
    ] as const)
      await expect((await tool(name)).handler(args, ctx), name).rejects.toThrow(
        /could not tell which site/
      )
    expect(cdpCalls).toEqual([])
  })

  it('a desktop shot is refused while ANY open tab is blocked, a page shot of another is not', async () => {
    table.push({
      telegram_id: '900000001',
      site: 'bank.com',
      rule: 'block',
      by_whom: 'person',
    })
    PAGE.url = 'https://ru.wikipedia.org/wiki/x'
    TABS.others = [{ id: 'page-9', url: 'https://online.bank.com/cards' }]
    const shot = await tool('browser_screenshot')
    await expect(shot.handler({ desktop: true }, ctx)).rejects.toThrow(
      /blocked list.*whole screen/s
    )
    expect(cdpCalls).not.toContain('desktopShot')
    await expect(shot.handler({}, ctx)).resolves.toMatchObject({
      base64: 'AAAA',
    })
    /* Once the blocked tab is gone, the whole screen is shot again. */
    TABS.others = []
    await expect(shot.handler({ desktop: true }, ctx)).resolves.toMatchObject({
      base64: 'AAAA',
    })
    expect(cdpCalls).toContain('desktopShot')
  })

  it('an unlisted ordinary site works as before', async () => {
    PAGE.url = 'https://ru.wikipedia.org/wiki/x'
    await expect(
      (await tool('browser_click')).handler({ x: 1, y: 1 }, ctx)
    ).resolves.toBeTruthy()
    expect(cdpCalls).toContain('clickAt')
  })

  it('browser_sites adds and lists, and cannot unblock', async () => {
    const sites = await tool('browser_sites')
    await sites.handler({ action: 'add', site: 'bank.com', rule: 'block' }, ctx)
    expect(await sites.handler({ action: 'list' }, ctx)).toEqual({
      sites: [{ site: 'bank.com', rule: 'block', by: 'agent' }],
    })
    await expect(
      sites.handler({ action: 'add', site: 'bank.com', rule: 'ask' }, ctx)
    ).rejects.toThrow(/only the person/)
  })
})

describe('/api/browser/sites: the person loosens, the agent only tightens', () => {
  const call = async (
    method: string,
    url: string,
    actor: 'person' | 'agent',
    body = ''
  ) => {
    const { handleBrowser } = await import('./src/browser/routes')
    return handleBrowser({ url, method }, {
      getPool: async () => pool,
      identity: () => '900000001',
      actor: () => actor,
      driver: { name: 'docker' } as never,
      newToken: () => 't',
      readBody: async () => body,
    } as never)
  }

  it('the agent key may add but not remove', async () => {
    expect(
      (
        await call(
          'POST',
          '/api/browser/sites',
          'agent',
          '{"site":"bank.com","rule":"block"}'
        )
      ).status
    ).toBe(200)
    expect(
      (await call('DELETE', '/api/browser/sites?site=bank.com', 'agent')).status
    ).toBe(403)
    expect(
      (
        await call(
          'POST',
          '/api/browser/sites',
          'agent',
          '{"site":"bank.com","rule":"ask"}'
        )
      ).status
    ).toBe(403)
    expect(table).toHaveLength(1)
  })

  it('the person removes, and reads the list back', async () => {
    await call(
      'POST',
      '/api/browser/sites',
      'person',
      '{"site":"bank.com","rule":"block"}'
    )
    const got = await call('GET', '/api/browser/sites', 'person')
    expect(got.body).toMatchObject({
      ok: true,
      sites: [{ site: 'bank.com', rule: 'block' }],
    })
    expect(
      (await call('DELETE', '/api/browser/sites?site=bank.com', 'person')).body
    ).toEqual({ ok: true, removed: true })
    expect(table).toEqual([])
  })

  it('a body that is not JSON is a 400, not a crash', async () => {
    expect(
      (await call('POST', '/api/browser/sites', 'person', '{nope')).status
    ).toBe(400)
  })
})
