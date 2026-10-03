import { afterEach, describe, expect, it, vi } from 'vitest'
import { BROWSER_TOOLS } from './src/browser/agent-tools'
import { resetTidyCache } from './src/browser/tab-tidy'

/**
 * ONE CARD AT A TIME, THROUGH THE TOOL ITSELF.
 *
 * Found 2026-10-03: `tri browser doctor` flags litter tabs on every loop
 * tick, and `browser_tidy ask` put a new card on the owner's phone each time
 * even when one was already waiting. This drives the real handler with a
 * question open and checks that no second approval row is written and that
 * Telegram is never called.
 */

const tidy = BROWSER_TOOLS.find(t => t.name === 'browser_tidy')!

function ctxWith(open: { state: string; age_ms: number } | null) {
  const writes: string[] = []
  const pool = {
    async query(sql: string) {
      if (sql.includes('FROM browser_sessions'))
        return {
          rows: [
            {
              telegram_id: '144',
              session_id: 's',
              cdp_endpoint: 'http://127.0.0.1:9222',
              state: 'live',
              view_token: 'v',
              admin_token: 'a',
            },
          ],
        }
      if (sql.includes('JOIN browser_approvals'))
        return {
          rows: open ? [{ approval_id: 'q-open', ttl_ms: null, ...open }] : [],
        }
      if (/INSERT|UPDATE/.test(sql)) writes.push(sql.trim().slice(0, 40))
      return { rows: [] }
    },
  }
  return { ctx: { telegramId: '144', pool }, writes }
}

const PAGES = [
  { id: 'A', type: 'page', url: 'https://t27.ai/' },
  { id: 'B', type: 'page', url: 'chrome://newtab/' },
  {
    id: 'C',
    type: 'page',
    url: 'https://www.reddit.com/r/t27ai/submit/?title=x',
  },
]

function stubFetch() {
  const calls: string[] = []
  vi.stubGlobal('fetch', async (url: string) => {
    calls.push(String(url))
    if (String(url).endsWith('/json/list'))
      return new Response(JSON.stringify(PAGES))
    return new Response('{"ok":true,"result":{}}')
  })
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
  resetTidyCache()
})

describe('browser_tidy ask', () => {
  it('a waiting question is returned, not asked again', async () => {
    const calls = stubFetch()
    const { ctx, writes } = ctxWith({ state: 'pending', age_ms: 60_000 })
    const out = (await tidy.handler({ ask: true }, ctx as never)) as {
      asked: boolean
      open?: { question: string; state: string }
    }
    expect(out.asked).toBe(false)
    expect(out.open).toEqual({ question: 'q-open', state: 'pending' })
    expect(writes.filter(w => w.includes('browser_approvals'))).toEqual([])
    expect(calls.some(u => u.includes('api.telegram.org'))).toBe(false)
  })

  it('an allowed one points at apply instead of a new card', async () => {
    stubFetch()
    const { ctx, writes } = ctxWith({ state: 'allowed', age_ms: 9e9 })
    const out = (await tidy.handler({ ask: true }, ctx as never)) as {
      asked: boolean
      open?: { state: string }
      note?: string
    }
    expect(out.asked).toBe(false)
    expect(out.open?.state).toBe('allowed')
    expect(out.note).toMatch(/apply/)
    expect(writes.filter(w => w.includes('browser_approvals'))).toEqual([])
  })

  it('an expired one does not block a fresh card', async () => {
    stubFetch()
    const { ctx, writes } = ctxWith({ state: 'pending', age_ms: 9e9 })
    await tidy.handler({ ask: true }, ctx as never).catch(() => undefined)
    expect(writes.some(w => w.includes('browser_approvals'))).toBe(true)
  })

  it('an allowed one whose tabs are all gone is cleared by apply, then asking works again', async () => {
    stubFetch()
    let applied = false
    const stored = JSON.stringify([
      { id: 'GONE1', url: 'https://x.com/compose', why: 'abandoned-form' },
      { id: 'GONE2', url: 'https://x.com/login', why: 'stuck-sign-in' },
    ])
    const pool = {
      async query(sql: string) {
        if (sql.includes('FROM browser_sessions'))
          return {
            rows: [
              {
                telegram_id: '144',
                session_id: 's',
                cdp_endpoint: 'http://127.0.0.1:9222',
                state: 'live',
                view_token: 'v',
                admin_token: 'a',
              },
            ],
          }
        if (sql.includes('JOIN browser_approvals'))
          return {
            rows: applied
              ? []
              : [
                  {
                    approval_id: 'q-yes',
                    state: 'allowed',
                    ttl_ms: 86_400_000,
                    age_ms: 9e9,
                  },
                ],
          }
        if (sql.includes('FROM browser_approvals WHERE id'))
          return {
            rows: [
              {
                id: 'q-yes',
                telegram_id: '144',
                what: 'w',
                state: 'allowed',
                created_ms: 0,
                ttl_ms: 86_400_000,
              },
            ],
          }
        if (sql.includes('UPDATE browser_tidy_asks')) {
          if (applied) return { rows: [] }
          applied = true
          return { rows: [{ tabs: stored }] }
        }
        return { rows: [] }
      },
    }
    const ctx = { telegramId: '144', pool }
    const before = (await tidy.handler({}, ctx as never)) as {
      open?: { state: string }
    }
    expect(before.open?.state).toBe('allowed')
    const done = (await tidy.handler({ apply: 'q-yes' }, ctx as never)) as {
      applied: boolean
      closed: string[]
      skipped: { id: string; why: string }[]
    }
    expect(done.applied).toBe(true)
    expect(done.closed).toEqual([])
    expect(done.skipped.map(s => s.why)).toEqual([
      'already closed',
      'already closed',
    ])
    const after = (await tidy.handler({}, ctx as never)) as {
      open?: unknown
      tabs: unknown[]
    }
    expect(after.open).toBeUndefined()
    expect(after.tabs.length).toBeGreaterThan(0)
  })
})
