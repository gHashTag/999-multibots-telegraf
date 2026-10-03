import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  NETWORKS,
  loginsOf,
  loginsOfPerson,
  setLoginsIoForTests,
  type CookieMark,
} from './src/browser/logins'
import {
  REFUSAL_TTL_MS,
  judgeUse,
  refusalsOf,
  refusedLine,
  resetRefusalsCache,
  stampOf,
  wallOf,
  wallPlace,
  withUse,
  type Refusal,
} from './src/browser/login-use'
import { isNotConnected } from './src/agent/rounds'
import { BROWSER_TOOLS } from './src/browser/agent-tools'
import { DOORS } from './src/browser/sign-in'

/**
 * A LOGIN IS CHECKED BY USE (login-use.ts).
 *
 * The cookie says what the browser holds; the site says whether it still
 * honours it. A gated page sent to the network's sign-in page is a refusal,
 * and `browser_logins` says `refused` until the person signs in again -- which
 * moves the login cookie's expiry and voids the refusal by itself.
 */

const NOW = Date.UTC(2026, 9, 3, 6, 0, 0)
const EXP = NOW / 1000 + 365 * 24 * 3600
const net = (id: string) => NETWORKS.find(n => n.id === id)!
const xMarks = (expires = EXP): CookieMark[] => [
  { name: 'auth_token', domain: '.x.com', expires },
  { name: 'guest_id', domain: '.x.com', expires: EXP + 99 },
]
const refusal = (over: Partial<Refusal> = {}): Refusal => ({
  network: 'x',
  stamp: EXP,
  wall: 'x.com/i/flow/login',
  at: new Date(NOW - 3600_000).toISOString(),
  ...over,
})
const stateOf = (list: Array<{ id: string; state: string }>, id: string) =>
  list.find(n => n.id === id)?.state

describe('the wall: a gated page sent to its own sign-in page', () => {
  it.each([
    ['https://x.com/compose/post', 'https://x.com/i/flow/login', 'x'],
    [
      'https://x.com/intent/post?text=a',
      'https://x.com/i/flow/login?redirect_after_login=%2F',
      'x',
    ],
    [
      'https://www.linkedin.com/sharing/share-offsite/?url=u',
      'https://www.linkedin.com/uas/login',
      'linkedin',
    ],
    [
      'https://www.linkedin.com/feed/',
      'https://www.linkedin.com/authwall',
      'linkedin',
    ],
    [
      'https://www.reddit.com/r/a/submit?x=1',
      'https://www.reddit.com/login/',
      'reddit',
    ],
    [
      'https://www.threads.net/intent/post?text=a',
      'https://www.threads.com/login',
      'threads',
    ],
    [
      'https://www.instagram.com/',
      'https://www.instagram.com/challenge/',
      'instagram',
    ],
    [
      'https://studio.youtube.com/',
      'https://accounts.google.com/v3/signin/identifier',
      'youtube',
    ],
  ])('%s -> %s is %s refusing', (asked, landed, id) => {
    expect(wallOf(asked, landed)?.id).toBe(id)
  })

  it('opening the sign-in door on purpose is not a refusal', () => {
    expect(
      wallOf('https://x.com/i/flow/login', 'https://x.com/i/flow/login')
    ).toBeNull()
    expect(wallOf(DOORS.linkedin, 'https://www.linkedin.com/login')).toBeNull()
  })

  it('a page that stayed where it was asked is no wall', () => {
    expect(
      wallOf('https://x.com/compose/post', 'https://x.com/compose/post')
    ).toBeNull()
    /* "login" inside a longer word is not the sign-in page. */
    expect(
      wallOf('https://x.com/compose/post', 'https://x.com/loginsomething')
    ).toBeNull()
  })

  it('a lookalike host or another network does not count', () => {
    expect(
      wallOf('https://x.com/compose/post', 'https://evil-x.com/i/flow/login')
    ).toBeNull()
    expect(
      wallOf('https://x.com/compose/post', 'https://www.reddit.com/login')
    ).toBeNull()
    /* Google's host speaks for Google networks only. */
    expect(
      wallOf('https://x.com/compose/post', 'https://accounts.google.com/signin')
    ).toBeNull()
  })

  it('a network with no known wall, or an unreadable URL, is not judged', () => {
    expect(wallOf('https://hh.ru/', 'https://hh.ru/account/login')).toBeNull()
    expect(wallOf('not a url', 'https://x.com/i/flow/login')).toBeNull()
    expect(wallOf('https://x.com/compose/post', '')).toBeNull()
  })

  it('the wall is kept without its query', () => {
    expect(wallPlace('https://x.com/i/flow/login?token=ONE-TIME')).toBe(
      'x.com/i/flow/login'
    )
    expect(wallPlace('junk')).toBe('')
  })
})

describe('the stamp: which login cookie the site refused', () => {
  it("is the latest expiry among the network's login cookies only", () => {
    expect(stampOf(xMarks(), net('x'))).toBe(EXP)
  })
  it('session-only login cookies stamp 0, no login cookie stamps null', () => {
    expect(stampOf([{ name: 'auth_token', domain: '.x.com' }], net('x'))).toBe(
      0
    )
    expect(stampOf([], net('x'))).toBeNull()
  })
})

describe('the answer, corrected by use', () => {
  const cookieAnswer = () => loginsOf(xMarks(), NOW)

  it('a signed_in the site refused with the same cookie is refused, with when', () => {
    const got = withUse(cookieAnswer(), xMarks(), [refusal()], NOW)
    expect(stateOf(got, 'x')).toBe('refused')
    expect(got.find(n => n.id === 'x')?.refusedAt).toBe(refusal().at)
    /* Every other network is untouched. */
    expect(stateOf(got, 'linkedin')).toBe('signed_out')
  })

  it('signing in again moves the cookie, and the refusal stops counting', () => {
    const fresh = xMarks(EXP + 86_400)
    expect(
      stateOf(withUse(loginsOf(fresh, NOW), fresh, [refusal()], NOW), 'x')
    ).toBe('signed_in')
  })

  it('a second of slack, not exactness', () => {
    const near = xMarks(EXP + 0.5)
    expect(
      stateOf(withUse(loginsOf(near, NOW), near, [refusal()], NOW), 'x')
    ).toBe('refused')
  })

  it('a session-only login cookie cannot be told from a new one: not believed', () => {
    const session: CookieMark[] = [{ name: 'auth_token', domain: '.x.com' }]
    const got = withUse(
      loginsOf(session, NOW),
      session,
      [refusal({ stamp: 0 })],
      NOW
    )
    expect(stateOf(got, 'x')).toBe('signed_in')
  })

  it('a refusal older than a week is history', () => {
    const old = refusal({
      at: new Date(NOW - REFUSAL_TTL_MS - 1).toISOString(),
    })
    expect(stateOf(withUse(cookieAnswer(), xMarks(), [old], NOW), 'x')).toBe(
      'signed_in'
    )
  })

  it('it never turns a signed_out or unknown into anything else', () => {
    const got = withUse(
      loginsOf([], NOW),
      [],
      [refusal(), refusal({ network: 'hh' })],
      NOW
    )
    expect(stateOf(got, 'x')).toBe('signed_out')
    expect(stateOf(got, 'hh')).toBe('unknown')
  })

  it('every reader that acts on a login treats refused as not connected', () => {
    const got = withUse(cookieAnswer(), xMarks(), [refusal()], NOW)
    expect(isNotConnected('https://x.com/intent/post?text=a', got)).toBe(true)
  })
})

/** A table in memory, enough for the three statements login-use.ts runs. */
function table() {
  const rows = new Map<string, Record<string, unknown>>()
  const sql: string[] = []
  const q = {
    sql,
    rows,
    query: async (text: string, params: unknown[] = []) => {
      sql.push(text)
      if (/^\s*CREATE TABLE/.test(text)) return { rows: [] }
      if (/INSERT INTO browser_login_refusals/.test(text)) {
        const [tg, network, stamp, wall] = params
        rows.set(`${tg}/${network}`, {
          telegram_id: tg,
          network,
          stamp,
          wall,
          at: new Date(NOW).toISOString(),
        })
        return { rows: [] }
      }
      if (/DELETE FROM browser_login_refusals/.test(text)) {
        rows.delete(`${params[0]}/${params[1]}`)
        return { rows: [] }
      }
      if (/FROM browser_login_refusals/.test(text))
        return {
          rows: [...rows.values()].filter(r => r.telegram_id === params[0]),
        }
      if (/FROM browser_sessions/.test(text))
        return {
          rows: [
            {
              telegram_id: params[0],
              session_id: 's',
              state: 'live',
              cdp_endpoint: 'pod:9223',
            },
          ],
        }
      return { rows: [] }
    },
  }
  return q
}

describe('the desk writes the verdict down', () => {
  beforeEach(() => resetRefusalsCache())

  it('a refusal is stored with the stamp and the wall, never the query', async () => {
    const q = table()
    const use = await judgeUse(
      q,
      '7',
      'https://x.com/compose/post',
      'https://x.com/i/flow/login?token=ONE-TIME',
      async () => xMarks()
    )
    expect(use).toEqual({ network: 'x', refused: true })
    expect(q.rows.get('7/x')).toMatchObject({
      stamp: EXP,
      wall: 'x.com/i/flow/login',
    })
    expect(JSON.stringify([...q.rows.values()])).not.toContain('ONE-TIME')
  })

  it('a gated page let through clears it; a page off the network does not', async () => {
    const q = table()
    await judgeUse(
      q,
      '7',
      'https://x.com/compose/post',
      'https://x.com/i/flow/login',
      async () => xMarks()
    )
    expect(
      await judgeUse(
        q,
        '7',
        'https://x.com/compose/post',
        'https://t.co/elsewhere',
        async () => xMarks()
      )
    ).toBeNull()
    expect(q.rows.has('7/x')).toBe(true)
    expect(
      await judgeUse(
        q,
        '7',
        'https://x.com/compose/post',
        'https://x.com/compose/post',
        async () => xMarks()
      )
    ).toEqual({ network: 'x', refused: false })
    expect(q.rows.has('7/x')).toBe(false)
  })

  it('a page of no judged network touches nothing', async () => {
    const q = table()
    expect(
      await judgeUse(q, '7', 'https://t27.ai/blog', 'https://t27.ai/blog', () =>
        Promise.resolve([])
      )
    ).toBeNull()
    expect(q.sql).toEqual([])
  })

  it('a broken table never stops the desk', async () => {
    const q = {
      query: async () => {
        throw new Error('db down')
      },
    }
    await expect(
      judgeUse(
        q,
        '7',
        'https://x.com/compose/post',
        'https://x.com/i/flow/login',
        async () => xMarks()
      )
    ).resolves.toBeNull()
  })

  it("one person's refusal is not another's", async () => {
    const q = table()
    await judgeUse(
      q,
      '7',
      'https://x.com/compose/post',
      'https://x.com/i/flow/login',
      async () => xMarks()
    )
    expect(await refusalsOf(q, '8')).toEqual([])
    expect((await refusalsOf(q, '7')).map(r => r.network)).toEqual(['x'])
  })
})

describe('browser_logins says it, and says where to sign in again', () => {
  beforeEach(() => resetRefusalsCache())
  afterEach(() => setLoginsIoForTests())

  it('the pod holds the cookie, the desk was refused: refused + the door', async () => {
    const q = table()
    await judgeUse(
      q,
      '7',
      'https://x.com/compose/post',
      'https://x.com/i/flow/login',
      async () => xMarks()
    )
    setLoginsIoForTests({
      wsUrl: async () => 'ws://pod',
      call: async () => ({
        cookies: xMarks().map(m => ({ ...m, value: 'SECRET' })),
      }),
    })
    expect(stateOf((await loginsOfPerson(q, '7'))!, 'x')).toBe('refused')
    const tool = BROWSER_TOOLS.find(t => t.name === 'browser_logins')!
    const out = (await tool.handler({}, {
      pool: q,
      telegramId: '7',
    } as never)) as Record<string, any>
    expect(out.signedIn).not.toContain('X')
    expect(out.signInAgain).toEqual([
      { name: 'X', refusedAt: new Date(NOW).toISOString(), door: DOORS.x },
    ])
    expect(JSON.stringify(out)).not.toContain('SECRET')
  })

  it('an unreadable refusal table leaves the cookie answer as it was', async () => {
    const q = table()
    const broken = {
      query: async (text: string, params?: unknown[]) => {
        if (/browser_login_refusals/.test(text)) throw new Error('no table')
        return q.query(text, params)
      },
    }
    setLoginsIoForTests({
      wsUrl: async () => 'ws://pod',
      call: async () => ({ cookies: xMarks() }),
    })
    expect(stateOf((await loginsOfPerson(broken, '7'))!, 'x')).toBe('signed_in')
  })

  it("the owner's line names what happened and what to do", () => {
    expect(refusedLine('2026-10-03T01:02:03.000Z')).toMatch(
      /^вход слетел.*2026-10-03 01:02 UTC.*ничего не нажато.*«Браузер»/ // cyrillic-ok: the owner's words
    )
  })
})
