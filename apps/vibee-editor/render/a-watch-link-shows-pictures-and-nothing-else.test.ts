/**
 * A WATCH LINK SHOWS PICTURES AND NOTHING ELSE (src/browser/watch-link.ts).
 *
 * What is pinned here, each one a way the link would stop being safe:
 * - only the person makes, lists and revokes a link; the agent key is 403;
 * - the database holds a hash, the token is shown once and never listed;
 * - a revoked or expired link closes a watcher already watching;
 * - a private place holds the picture BEFORE its first frame, and the frame
 *   in flight when the person leaves it is dropped too;
 * - an unreadable list or address holds everything;
 * - two watchers per link; the page and the socket have no input path.
 */
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  WATCH_CLOSE,
  WATCH_MAX_ACTIVE,
  WATCH_MAX_VIEWERS_PER_LINK,
  WATCH_UNHOLD_QUIET_MS,
  createWatchLink,
  enterViewer,
  hashOf,
  leaveViewer,
  listWatchLinks,
  newWatchToken,
  openWatch,
  parseWatchPath,
  resetWatchLinksForTests,
  resolveWatch,
  revokeWatchLink,
  serveWatch,
  watchHold,
  watchPageHeaders,
  watchPageHtml,
  watchViewerOf,
  type WatchIo,
  type WatchViewer,
} from './src/browser/watch-link'
import { ruleFor, type SiteRuleRow } from './src/browser/site-rules'

const ID = '900000001'
const T0 = Date.parse('2026-10-03T00:00:00.000Z')

interface Row {
  token_hash: string
  telegram_id: string
  label: string | null
  created_at: string
  expires_at: string
  revoked_at: string | null
  views: number
  last_view_at: string | null
}
let rows: Row[] = []
let sessionState = 'live'
const journal: unknown[][] = []

const pool = {
  query: async (text: string, params: unknown[] = []) => {
    const p = params as string[]
    if (text.includes('CREATE TABLE')) return { rows: [] }
    if (text.includes('browser_watch_links')) {
      if (text.includes('count(*)'))
        return {
          rows: [
            {
              n: rows.filter(
                r =>
                  r.telegram_id === p[0] && !r.revoked_at && r.expires_at > p[1]
              ).length,
            },
          ],
        }
      if (text.startsWith('INSERT')) {
        rows.push({
          token_hash: p[0],
          telegram_id: p[1],
          label: p[2],
          created_at: p[3],
          expires_at: p[4],
          revoked_at: null,
          views: 0,
          last_view_at: null,
        })
        return { rows: [] }
      }
      if (text.includes('SET revoked_at')) {
        const hit = rows.filter(
          r =>
            r.telegram_id === p[0] &&
            r.token_hash.slice(0, 12) === p[1] &&
            !r.revoked_at
        )
        for (const r of hit) r.revoked_at = p[2]
        return { rows: hit.map(r => ({ token_hash: r.token_hash })) }
      }
      if (text.includes('SET views')) {
        for (const r of rows.filter(r => r.token_hash === p[0])) {
          r.views++
          r.last_view_at = p[1]
        }
        return { rows: [] }
      }
      if (text.includes('SELECT telegram_id'))
        return {
          rows: rows
            .filter(
              r => r.token_hash === p[0] && !r.revoked_at && r.expires_at > p[1]
            )
            .map(r => ({ telegram_id: r.telegram_id })),
        }
      if (text.includes('SELECT token_hash'))
        return { rows: rows.filter(r => r.telegram_id === p[0]).reverse() }
      throw new Error('unexpected watch-link query: ' + text)
    }
    if (text.includes('browser_journal')) {
      journal.push(params)
      return { rows: [] }
    }
    /* Everything else is the session read. */
    return {
      rows: [
        {
          telegram_id: ID,
          session_id: 's1',
          pod_id: 'pod',
          endpoint: '127.0.0.1:1',
          cdp_endpoint: '127.0.0.1:2',
          allowed_ms: null,
          wheel_ms: null,
          state: sessionState,
          view_token: 'v',
          admin_token: 'a',
        },
      ],
    }
  },
}

beforeEach(() => {
  rows = []
  sessionState = 'live'
  journal.length = 0
  resetWatchLinksForTests()
  vi.useRealTimers()
})

describe('addresses and tokens', () => {
  it('a new token is a path the parser takes, and nothing else is', () => {
    const t = newWatchToken()
    expect(parseWatchPath('/watch/' + t)).toEqual({ token: t, frames: false })
    expect(parseWatchPath(`/watch/${t}/frames`)).toEqual({
      token: t,
      frames: true,
    })
    expect(parseWatchPath('/watch/short')).toBeNull()
    expect(parseWatchPath(`/watch/${t}/input`)).toBeNull()
    expect(parseWatchPath(`/watch/${t}/frames/x`)).toBeNull()
    expect(parseWatchPath(`/live/${t}`)).toBeNull()
    expect(parseWatchPath(`/watch/${t.slice(0, 10)}%2e%2e`)).toBeNull()
  })

  it('two tokens differ, and the hash is not the token', () => {
    const a = newWatchToken()
    expect(newWatchToken()).not.toBe(a)
    expect(hashOf(a)).not.toContain(a)
    expect(hashOf(a)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('watchHold: what a watcher may see', () => {
  const sensitive = (u: string) => /bank\.example|mail\.google/.test(u)
  const rules: SiteRuleRow[] = [
    { site: 'ask.example', rule: 'ask' } as SiteRuleRow,
    { site: 'block.example', rule: 'block' } as SiteRuleRow,
  ]
  const hold = (u: string, r: SiteRuleRow[] | null = rules) =>
    watchHold(u, r, sensitive, ruleFor)

  it('a public page is shown, the blank page too', () => {
    expect(hold('https://x.com/home')).toBeNull()
    expect(hold('about:blank')).toBeNull()
    expect(hold('chrome://newtab/')).toBeNull()
  })

  it('a sensitive place and every listed site are private', () => {
    expect(hold('https://bank.example/pay')).toBe('private')
    expect(hold('https://ask.example/')).toBe('private')
    expect(hold('https://block.example/')).toBe('private')
  })

  it("the browser's own pages are held, and so is anything not on the web", () => {
    for (const u of [
      'data:text/html,<h1>bank</h1>',
      'blob:https://x.com/1-2-3',
      'file:///home/neko/Downloads/statement.pdf',
      'javascript:alert(1)',
    ])
      expect(hold(u)).toBe('browser')
    expect(hold('chrome://settings/passwords')).toBe('browser')
    expect(hold('chrome-extension://abc/popup.html')).toBe('browser')
    expect(hold('devtools://devtools/x')).toBe('browser')
  })

  it('an unreadable address or list holds everything', () => {
    expect(hold('')).toBe('unknown')
    expect(hold('not a url')).toBe('unknown')
    expect(hold('https://x.com/', null)).toBe('list')
  })
})

describe('making, listing, revoking: the token is shown once', () => {
  it('the row holds the hash; the list holds ids, never the token', async () => {
    const r = await createWatchLink(pool, ID, { label: 'mom' }, T0)
    if (!r.ok) throw new Error(r.error)
    expect(rows).toHaveLength(1)
    expect(JSON.stringify(rows)).not.toContain(r.token)
    expect(rows[0].token_hash).toBe(hashOf(r.token))
    const list = await listWatchLinks(pool, ID, T0)
    expect(JSON.stringify(list)).not.toContain(r.token)
    expect(list[0]).toMatchObject({ id: r.id, label: 'mom', live: true })
  })

  it('a day by default, three at most, never zero', async () => {
    const r = await createWatchLink(pool, ID, {}, T0)
    expect(r.ok && Date.parse(r.expiresAt) - T0).toBe(24 * 3_600_000)
    for (const hours of [0, -1, 73, 'abc', Infinity])
      expect(await createWatchLink(pool, ID, { hours }, T0)).toMatchObject({
        ok: false,
        status: 400,
      })
  })

  it(`at most ${WATCH_MAX_ACTIVE} live links per person`, async () => {
    for (let i = 0; i < WATCH_MAX_ACTIVE; i++)
      expect((await createWatchLink(pool, ID, {}, T0)).ok).toBe(true)
    expect(await createWatchLink(pool, ID, {}, T0)).toMatchObject({
      ok: false,
      status: 409,
    })
  })

  it('resolves while live; not after a revoke, not after it expires', async () => {
    const r = await createWatchLink(pool, ID, { hours: 1 }, T0)
    if (!r.ok) throw new Error(r.error)
    expect(await resolveWatch(pool, r.token, T0)).toEqual({
      telegramId: ID,
      id: r.id,
    })
    expect(await resolveWatch(pool, r.token, T0 + 3_600_001)).toBeNull()
    expect(await revokeWatchLink(pool, ID, r.id, T0)).toBe(true)
    expect(await resolveWatch(pool, r.token, T0)).toBeNull()
  })

  it('the revoke and the resolve say who, and skip the revoked', async () => {
    const texts: string[] = []
    const spy = {
      query: async (text: string, params: unknown[] = []) => {
        texts.push(text.replace(/\s+/g, ' '))
        return pool.query(text, params)
      },
    }
    const r = await createWatchLink(pool, ID, {}, T0)
    if (!r.ok) throw new Error(r.error)
    await revokeWatchLink(spy, ID, r.id, T0)
    await resolveWatch(spy, r.token, T0)
    const revoke = texts.find(t => t.includes('SET revoked_at')) as string
    expect(revoke).toContain('telegram_id = $1')
    expect(revoke).toContain('revoked_at IS NULL')
    const resolve = texts.find(t => t.includes('SELECT telegram_id')) as string
    expect(resolve).toContain('token_hash = $1')
    expect(resolve).toContain('revoked_at IS NULL')
    expect(resolve).toContain('expires_at > $2')
  })

  it("nobody revokes another person's link", async () => {
    const r = await createWatchLink(pool, ID, {}, T0)
    if (!r.ok) throw new Error(r.error)
    expect(await revokeWatchLink(pool, '777', r.id, T0)).toBe(false)
    expect(await revokeWatchLink(pool, ID, "x' OR 1=1 --", T0)).toBe(false)
    expect(await resolveWatch(pool, r.token, T0)).not.toBeNull()
  })
})

describe('/api/browser/watch-links: the person only', () => {
  const call = async (
    method: string,
    url: string,
    actor: 'person' | 'agent',
    body = ''
  ) => {
    const { handleBrowser } = await import('./src/browser/routes')
    return handleBrowser({ url, method }, {
      getPool: async () => pool,
      identity: () => ID,
      actor: () => actor,
      driver: { name: 'docker' } as never,
      newToken: () => 't',
      readBody: async () => body,
      env: { PUBLIC_URL: 'https://render.example/' },
    } as never)
  }

  it('the agent key gets 403 on every method, and nothing is made', async () => {
    for (const m of ['GET', 'POST', 'DELETE'])
      expect(
        (await call(m, '/api/browser/watch-links?id=abc', 'agent', '{}')).status
      ).toBe(403)
    expect(rows).toHaveLength(0)
  })

  it('the person gets the link once; the list does not repeat it', async () => {
    const made = await call('POST', '/api/browser/watch-links', 'person', '{}')
    expect(made.status).toBe(200)
    const url = (made.body as { url: string }).url
    expect(url).toMatch(/^https:\/\/render\.example\/watch\/[A-Za-z0-9_-]{43}$/)
    const token = url.split('/').pop() as string
    const listed = await call('GET', '/api/browser/watch-links', 'person')
    expect(JSON.stringify(listed.body)).not.toContain(token)
    const id = (made.body as { id: string }).id
    const gone = await call(
      'DELETE',
      `/api/browser/watch-links?id=${id}`,
      'person'
    )
    expect(gone.status).toBe(200)
    expect(await resolveWatch(pool, token)).toBeNull()
  })
})

/** A watcher that records what reached it. */
function fakeViewer() {
  const sent: Array<Buffer | string> = []
  const closes: Array<number | undefined> = []
  let closeFn: (() => void)[] = []
  const v: WatchViewer = {
    send: d => sent.push(d),
    bufferedAmount: 0,
    close: code => {
      closes.push(code)
      const fns = closeFn
      closeFn = []
      for (const f of fns) f()
    },
    onClose: fn => closeFn.push(fn),
  }
  return {
    v,
    sent,
    closes,
    frames: () => sent.filter(s => typeof s !== 'string').length,
    notes: () => sent.filter(s => typeof s === 'string') as string[],
  }
}

/** A fake browser whose address and frames the test drives. */
function fakeIo(over: Partial<WatchIo> = {}) {
  let emit: (jpeg: Buffer) => void = () => undefined
  let url: (u: string) => void = () => undefined
  const stop = vi.fn()
  const io: WatchIo = {
    rules: async () => [],
    stillLive: async () => true,
    frontId: async () => 'page-1',
    sensitive: u => /bank\.example/.test(u),
    ruleFor,
    cast: async (onFrame, opts) => {
      emit = onFrame
      url = opts.onUrl
      opts.onPage('page-1')
      return stop
    },
    ...over,
  }
  return {
    io,
    stop,
    frame: () => emit(Buffer.from([0xff, 0xd8])),
    go: (u: string) => url(u),
  }
}

describe('serveWatch: the picture holds before the private frame', () => {
  it('frames on a public page; none on a bank; quiet after leaving it', async () => {
    vi.useFakeTimers()
    const w = fakeViewer()
    const b = fakeIo()
    await serveWatch(w.v, b.io, { recheckMs: 60_000 })
    b.go('https://x.com/home')
    b.frame()
    expect(w.frames()).toBe(1)
    b.go('https://bank.example/pay')
    b.frame()
    b.frame()
    expect(w.frames()).toBe(1)
    expect(w.notes().map(n => JSON.parse(n).hold)).toEqual([
      'unknown',
      null,
      'private',
    ])
    b.go('https://x.com/home')
    /* The frame in flight when the person left may be the bank's last. */
    b.frame()
    expect(w.frames()).toBe(1)
    vi.advanceTimersByTime(WATCH_UNHOLD_QUIET_MS + 1)
    b.frame()
    expect(w.frames()).toBe(2)
    w.v.close()
    expect(b.stop).toHaveBeenCalled()
  })

  it('the first public page is not quieted: nothing was shown before it', async () => {
    const w = fakeViewer()
    const b = fakeIo()
    await serveWatch(w.v, b.io, { recheckMs: 60_000 })
    b.go('https://x.com/home')
    b.frame()
    expect(w.frames()).toBe(1)
    w.v.close()
  })

  it('a list that cannot be read holds every frame', async () => {
    const w = fakeViewer()
    const b = fakeIo({ rules: async () => null })
    await serveWatch(w.v, b.io, { recheckMs: 60_000 })
    b.go('https://x.com/home')
    b.frame()
    expect(w.frames()).toBe(0)
    expect(JSON.parse(w.notes().at(-1) as string).hold).toBe('list')
    w.v.close()
  })

  it('a site on the person\'s "ask" list is private to a watcher', async () => {
    const w = fakeViewer()
    const b = fakeIo({
      rules: async () => [{ site: 'x.com', rule: 'ask' } as SiteRuleRow],
    })
    await serveWatch(w.v, b.io, { recheckMs: 60_000 })
    b.go('https://x.com/home')
    b.frame()
    expect(w.frames()).toBe(0)
    w.v.close()
  })

  it('a revoke reaches a watcher already watching', async () => {
    vi.useFakeTimers()
    let live = true
    const w = fakeViewer()
    const b = fakeIo({ stillLive: async () => live })
    await serveWatch(w.v, b.io, { recheckMs: 1000 })
    b.go('https://x.com/home')
    live = false
    await vi.advanceTimersByTimeAsync(1001)
    expect(w.closes).toContain(WATCH_CLOSE.ended)
    expect(b.stop).toHaveBeenCalled()
    b.frame()
    expect(w.frames()).toBe(0)
  })

  it('another tab in front closes with "follow" so the page reconnects', async () => {
    vi.useFakeTimers()
    const w = fakeViewer()
    const b = fakeIo({ frontId: async () => 'page-2' })
    await serveWatch(w.v, b.io, { recheckMs: 1000 })
    await vi.advanceTimersByTimeAsync(1001)
    expect(w.closes).toContain(WATCH_CLOSE.front)
  })

  it('every recheck reads the list again: a site listed mid-watch holds', async () => {
    vi.useFakeTimers()
    let rules: SiteRuleRow[] | null = []
    const w = fakeViewer()
    const b = fakeIo({ rules: async () => rules })
    await serveWatch(w.v, b.io, { recheckMs: 1000 })
    b.go('https://x.com/home')
    b.frame()
    expect(w.frames()).toBe(1)
    rules = [{ site: 'x.com', rule: 'ask' } as SiteRuleRow]
    await vi.advanceTimersByTimeAsync(1001)
    b.frame()
    expect(w.frames()).toBe(1)
    expect(JSON.parse(w.notes().at(-1) as string).hold).toBe('private')
    w.v.close()
  })

  it('a database that fails on a recheck holds or ends, never shows', async () => {
    vi.useFakeTimers()
    let failRules = false
    let failLive = false
    const w = fakeViewer()
    const b = fakeIo({
      rules: async () => {
        if (failRules) throw new Error('db down')
        return []
      },
      stillLive: async () => {
        if (failLive) throw new Error('db down')
        return true
      },
    })
    await serveWatch(w.v, b.io, { recheckMs: 1000 })
    b.go('https://x.com/home')
    failRules = true
    await vi.advanceTimersByTimeAsync(1001)
    b.frame()
    expect(w.frames()).toBe(0)
    expect(JSON.parse(w.notes().at(-1) as string).hold).toBe('list')
    failLive = true
    await vi.advanceTimersByTimeAsync(1001)
    expect(w.closes).toContain(WATCH_CLOSE.ended)
  })

  it('a socket already gone starts no screencast and no timer', async () => {
    vi.useFakeTimers()
    const w = fakeViewer()
    const v: WatchViewer = { ...w.v, onClose: fn => fn() }
    const cast = vi.fn(fakeIo().io.cast)
    await serveWatch(v, fakeIo({ cast }).io, { recheckMs: 1000, maxMs: 5000 })
    expect(cast).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('a screencast that cannot start closes as "off"', async () => {
    const w = fakeViewer()
    const b = fakeIo({
      cast: async () => {
        throw new Error('no pod')
      },
    })
    await serveWatch(w.v, b.io, { recheckMs: 60_000 })
    expect(w.closes).toContain(1011)
  })
})

describe('openWatch: refusals the page understands', () => {
  const viewerSize = { width: 800, height: 600 }

  it('an unknown token ends; a stopped browser is off and starts nothing', async () => {
    const w = fakeViewer()
    await openWatch(pool, newWatchToken(), w.v, viewerSize)
    expect(w.closes).toEqual([WATCH_CLOSE.ended])

    const r = await createWatchLink(pool, ID, {})
    if (!r.ok) throw new Error(r.error)
    sessionState = 'stopped'
    const w2 = fakeViewer()
    await openWatch(pool, r.token, w2.v, viewerSize)
    expect(w2.closes).toEqual([1011])
    /* The refused watcher left its seat. */
    expect(enterViewer(r.id)).toBe(true)
    leaveViewer(r.id)
  })

  it(`${WATCH_MAX_VIEWERS_PER_LINK} watchers per link, a seat frees on leaving`, () => {
    for (let i = 0; i < WATCH_MAX_VIEWERS_PER_LINK; i++)
      expect(enterViewer('abc')).toBe(true)
    expect(enterViewer('abc')).toBe(false)
    leaveViewer('abc')
    expect(enterViewer('abc')).toBe(true)
  })

  it('a watcher who leaves while the token is read takes no seat', async () => {
    const r = await createWatchLink(pool, ID, {})
    if (!r.ok) throw new Error(r.error)
    const w = fakeViewer()
    const slow = {
      query: async (text: string, params: unknown[] = []) => {
        if (text.includes('SELECT telegram_id')) w.v.close(1001)
        return pool.query(text, params)
      },
    }
    await openWatch(slow, r.token, w.v, viewerSize)
    for (let i = 0; i < WATCH_MAX_VIEWERS_PER_LINK; i++)
      expect(enterViewer(r.id)).toBe(true)
    expect(journal).toHaveLength(0)
  })

  it('a watcher who leaves after taking a seat gives it back', async () => {
    const r = await createWatchLink(pool, ID, {})
    if (!r.ok) throw new Error(r.error)
    const w = fakeViewer()
    const leaving = {
      query: async (text: string, params: unknown[] = []) => {
        /* The session read: the seat is taken by now. */
        if (!text.includes('browser_watch_links') && !text.includes('CREATE'))
          w.v.close(1001)
        return pool.query(text, params)
      },
    }
    sessionState = 'stopped'
    await openWatch(leaving, r.token, w.v, viewerSize)
    for (let i = 0; i < WATCH_MAX_VIEWERS_PER_LINK; i++)
      expect(enterViewer(r.id)).toBe(true)
    expect(enterViewer(r.id)).toBe(false)
  })

  it('the ws wrapper hears a close that happened before it was asked', () => {
    let fire: () => void = () => undefined
    const ws = {
      readyState: 1,
      bufferedAmount: 0,
      send: vi.fn(),
      close: vi.fn(),
      on: (_e: 'close', fn: () => void) => void (fire = fn),
    }
    const v = watchViewerOf(ws)
    const early = vi.fn()
    v.onClose(early)
    fire()
    expect(early).toHaveBeenCalledTimes(1)
    const late = vi.fn()
    v.onClose(late)
    expect(late).toHaveBeenCalledTimes(1)
    v.send(Buffer.from([1]))
    expect(ws.send).not.toHaveBeenCalled()

    const gone = watchViewerOf({ ...ws, readyState: 3, on: () => undefined })
    const atOnce = vi.fn()
    gone.onClose(atOnce)
    expect(atOnce).toHaveBeenCalledTimes(1)
  })

  it('a full link closes with 4029 before reading the session', async () => {
    const r = await createWatchLink(pool, ID, {})
    if (!r.ok) throw new Error(r.error)
    for (let i = 0; i < WATCH_MAX_VIEWERS_PER_LINK; i++) enterViewer(r.id)
    const w = fakeViewer()
    await openWatch(pool, r.token, w.v, viewerSize)
    expect(w.closes).toEqual([WATCH_CLOSE.full])
    expect(journal).toHaveLength(0)
  })
})

describe('no input path: the page sends nothing, the socket reads nothing', () => {
  const html = watchPageHtml('n0nce')

  it('the page never writes to its socket and has no form or input', () => {
    expect(html).not.toMatch(/\.send\(/)
    expect(html).not.toMatch(/<(form|input|textarea|button)\b/i)
    expect(html).not.toMatch(/addEventListener\(['"](key|mouse|pointer|touch)/)
  })

  it('no cache, no referrer, no framing, scripts only by nonce', () => {
    const h = watchPageHeaders('n0nce')
    expect(h['Cache-Control']).toBe('no-store')
    expect(h['Referrer-Policy']).toBe('no-referrer')
    expect(h['Content-Security-Policy']).toContain("frame-ancestors 'none'")
    expect(h['Content-Security-Policy']).toContain("script-src 'nonce-n0nce'")
    expect(h['Content-Security-Policy']).toContain("default-src 'none'")
    expect(html).toContain('<script nonce="n0nce">')
  })

  it('the server closes a watcher socket that says anything', () => {
    const src = readFileSync(
      new URL('./render-server.ts', import.meta.url),
      'utf8'
    )
    const at = src.indexOf('if (watchAt?.frames)')
    expect(at).toBeGreaterThan(0)
    const block = src.slice(at, at + 1500)
    expect(block).toContain("ws.on('message', () => ws.close(1008))")
    expect(block).not.toMatch(/pipeUpgrade|cdpTypeIo|clickAt|typeText/)
    /* The watcher's socket is matched before the live path, so a token can never reach it. */
    expect(at).toBeLessThan(src.indexOf('if (!isLivePath(path))'))
  })
})

describe('startScreencast reports the address in frame order', () => {
  it('Page.enable before the cast; main-frame navigations only', async () => {
    const { startScreencast } = await import('./src/browser/frames')
    const sent: Array<{ method: string }> = []
    let push: (t: string) => void = () => undefined
    const io = {
      front: async () => ({
        id: 'tab-1',
        type: 'page',
        title: '',
        url: 'https://x.com/',
      }),
      connect: async () => ({
        send: (t: string) => void sent.push(JSON.parse(t)),
        close: () => undefined,
        onMessage: (fn: (t: string) => void) => void (push = fn),
        onClose: () => undefined,
      }),
    }
    const seen: string[] = []
    const order: string[] = []
    await startScreencast(
      'pod:9223',
      { width: 400, height: 800 },
      () => order.push('frame'),
      io,
      {
        onUrl: u => {
          seen.push(u)
          order.push('url')
        },
      }
    )
    push(JSON.stringify({ id: 1, result: { sessionId: 'S' } }))
    expect(sent.map(s => s.method)).toEqual([
      'Target.attachToTarget',
      'Page.enable',
      'Page.getFrameTree',
    ])
    push(
      JSON.stringify({
        id: 3,
        sessionId: 'S',
        result: {
          frameTree: { frame: { id: 'tab-1', url: 'https://x.com/' } },
        },
      })
    )
    expect(sent.at(-1)?.method).toBe('Page.startScreencast')
    const ev = (method: string, params: unknown) =>
      push(JSON.stringify({ method, sessionId: 'S', params }))
    ev('Page.frameNavigated', {
      frame: { id: 'child', parentId: 'tab-1', url: 'https://bank.example/' },
    })
    ev('Page.frameNavigated', {
      frame: {
        id: 'tab-1',
        url: 'https://bank.example/pay',
        urlFragment: '#x',
      },
    })
    ev('Page.screencastFrame', { data: 'AA==', sessionId: 1 })
    ev('Page.navigatedWithinDocument', { frameId: 'other', url: 'https://a/' })
    ev('Page.navigatedWithinDocument', {
      frameId: 'tab-1',
      url: 'https://x.com/b',
    })
    expect(seen).toEqual([
      'https://x.com/',
      'https://bank.example/pay#x',
      'https://x.com/b',
    ])
    expect(order).toEqual(['url', 'url', 'frame', 'url'])
  })

  it("the list's address is never trusted: the tree answers, then the cast", async () => {
    const { startScreencast } = await import('./src/browser/frames')
    const sent: Array<{ id: number; method: string }> = []
    let push: (t: string) => void = () => undefined
    const seen: string[] = []
    await startScreencast(
      'pod:9223',
      { width: 400, height: 800 },
      () => undefined,
      {
        /* Read before Page.enable: the tab has since gone to the bank. */
        front: async () => ({
          id: 'tab-1',
          type: 'page',
          title: '',
          url: 'https://x.com/',
        }),
        connect: async () => ({
          send: (t: string) => void sent.push(JSON.parse(t)),
          close: () => undefined,
          onMessage: (fn: (t: string) => void) => void (push = fn),
          onClose: () => undefined,
        }),
      },
      { onUrl: u => seen.push(u) }
    )
    expect(seen).toEqual([])
    push(JSON.stringify({ id: 1, result: { sessionId: 'S' } }))
    expect(sent.map(s => s.method)).not.toContain('Page.startScreencast')
    const tree = sent.find(s => s.method === 'Page.getFrameTree')
    push(
      JSON.stringify({
        id: tree?.id,
        result: { frameTree: { frame: { url: 'https://bank.example/pay' } } },
      })
    )
    expect(seen).toEqual(['https://bank.example/pay'])
    expect(sent.at(-1)?.method).toBe('Page.startScreencast')
  })

  it('a tree that cannot be read reports nothing known, which holds', async () => {
    const { startScreencast } = await import('./src/browser/frames')
    const sent: Array<{ id: number; method: string }> = []
    let push: (t: string) => void = () => undefined
    const seen: string[] = []
    await startScreencast(
      'pod:9223',
      { width: 400, height: 800 },
      () => undefined,
      {
        front: async () => ({ id: 'tab-1', type: 'page', title: '', url: '' }),
        connect: async () => ({
          send: (t: string) => void sent.push(JSON.parse(t)),
          close: () => undefined,
          onMessage: (fn: (t: string) => void) => void (push = fn),
          onClose: () => undefined,
        }),
      },
      { onUrl: u => seen.push(u) }
    )
    push(JSON.stringify({ id: 1, result: { sessionId: 'S' } }))
    const tree = sent.find(s => s.method === 'Page.getFrameTree')
    push(JSON.stringify({ id: tree?.id, error: { message: 'gone' } }))
    expect(seen).toEqual([''])
    expect(watchHold(seen[0], [], () => false, ruleFor)).toBe('unknown')
  })

  it('without onUrl nothing extra is asked of Chromium', async () => {
    const { startScreencast } = await import('./src/browser/frames')
    const sent: Array<{ method: string }> = []
    let push: (t: string) => void = () => undefined
    await startScreencast(
      'pod:9223',
      { width: 400, height: 800 },
      () => undefined,
      {
        front: async () => ({ id: 'tab-1', type: 'page', title: '', url: '' }),
        connect: async () => ({
          send: (t: string) => void sent.push(JSON.parse(t)),
          close: () => undefined,
          onMessage: (fn: (t: string) => void) => void (push = fn),
          onClose: () => undefined,
        }),
      }
    )
    push(JSON.stringify({ id: 1, result: { sessionId: 'S' } }))
    expect(sent.map(s => s.method)).not.toContain('Page.enable')
  })
})
