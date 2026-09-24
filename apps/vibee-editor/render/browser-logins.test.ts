import { afterEach, describe, expect, it } from 'vitest'
import {
  NETWORKS,
  loginsOf,
  marksOf,
  onDomain,
  readLogins,
  setLoginsIoForTests,
  type LoginsIo,
} from './src/browser/logins'
import { BROWSER_TOOLS } from './src/browser/agent-tools'
import { COMPACT_HIDDEN } from './src/agent/telegram-tools'
import { closedToClients } from './src/agent/client-facing'
import { stepOf } from './src/browser/journal'
import { systemPrompt } from './src/agent/chat'

/**
 * WHICH NETWORKS THE CLONE HOLDS (#2962).
 *
 * The browser keeps every login in a cookie; this pins that the answer is
 * built from names and expiries alone, that a value can never reach it, and
 * that nothing is guessed -- a network whose login cookie is unknown stays
 * `unknown`, never `signed_out`.
 */

const NOW = Date.UTC(2026, 8, 24, 8, 0, 0)
const IN_A_YEAR = NOW / 1000 + 365 * 24 * 3600
const LAST_WEEK = NOW / 1000 - 7 * 24 * 3600
const SECRET = 'v4lue-that-must-never-travel'

const cookie = (name: string, domain: string, expires = IN_A_YEAR) => ({
  name,
  domain,
  value: SECRET,
  path: '/',
  expires,
  httpOnly: true,
  secure: true,
  session: false,
})

const stateOf = (list: ReturnType<typeof loginsOf>, id: string) =>
  list.find(n => n.id === id)?.state

describe('the reducer', () => {
  it('drops the value in the first step', () => {
    const marks = marksOf([cookie('auth_token', '.x.com')])
    expect(marks).toEqual([
      { name: 'auth_token', domain: '.x.com', expires: IN_A_YEAR },
    ])
    expect(JSON.stringify(marks)).not.toContain(SECRET)
  })

  it('ignores junk instead of throwing', () => {
    expect(marksOf(undefined)).toEqual([])
    expect(marksOf([null, 1, { name: 2 }, { name: 'a' }])).toEqual([])
  })

  it('a login cookie on the domain or a subdomain counts; a lookalike does not', () => {
    expect(onDomain('.linkedin.com', ['linkedin.com'])).toBe(true)
    expect(onDomain('www.linkedin.com', ['linkedin.com'])).toBe(true)
    expect(onDomain('notx.com', ['x.com'])).toBe(false)
    expect(onDomain('x.com.evil.io', ['x.com'])).toBe(false)
  })

  it('signed in, expired and signed out, per network', () => {
    const list = loginsOf(
      marksOf([
        cookie('auth_token', '.x.com'),
        cookie('li_at', '.www.linkedin.com', LAST_WEEK),
        /* The right name on the wrong site is not a login. */
        cookie('sessionid', '.notinstagram.com'),
        /* A session cookie lives as long as the browser. */
        cookie('c_user', '.facebook.com', -1),
      ]),
      NOW
    )
    expect(stateOf(list, 'x')).toBe('signed_in')
    expect(stateOf(list, 'linkedin')).toBe('expired')
    expect(stateOf(list, 'instagram')).toBe('signed_out')
    expect(stateOf(list, 'facebook')).toBe('signed_in')
    expect(stateOf(list, 'tiktok')).toBe('signed_out')
  })

  it('one live cookie among expired ones is still a login', () => {
    const list = loginsOf(
      marksOf([
        cookie('sessionid', '.tiktok.com', LAST_WEEK),
        cookie('sid_tt', '.tiktok.com'),
      ]),
      NOW
    )
    expect(stateOf(list, 'tiktok')).toBe('signed_in')
  })

  it('never guesses: a network with no known login cookie is unknown, even with cookies', () => {
    const list = loginsOf(marksOf([cookie('hhtoken', '.hh.ru')]), NOW)
    expect(stateOf(list, 'hh')).toBe('unknown')
    for (const n of NETWORKS.filter(n => !n.auth.length))
      expect(stateOf(list, n.id), n.id).toBe('unknown')
  })

  it('answers with networks and states only: no cookie names, no values', () => {
    const list = loginsOf(marksOf([cookie('auth_token', '.x.com')]), NOW)
    const text = JSON.stringify(list)
    expect(text).not.toContain(SECRET)
    expect(text).not.toContain('auth_token')
    expect(Object.keys(list[0]).sort()).toEqual(['id', 'name', 'state'])
  })
})

const fakePod = (cookies: unknown[]) => {
  const calls: Array<{ ws: string; method: string }> = []
  const io: LoginsIo = {
    wsUrl: async endpoint => `ws://${endpoint}/browser`,
    call: async (ws, method) => {
      calls.push({ ws, method })
      return { cookies }
    },
  }
  return { io, calls }
}

describe('asking the pod', () => {
  afterEach(() => setLoginsIoForTests())

  it('uses the browser socket and one read-only CDP call', async () => {
    const { io, calls } = fakePod([cookie('user_session', 'github.com')])
    const list = await readLogins('10.0.0.1:9222', NOW, io)
    expect(calls).toEqual([
      { ws: 'ws://10.0.0.1:9222/browser', method: 'Storage.getCookies' },
    ])
    expect(stateOf(list, 'github')).toBe('signed_in')
  })
})

const tool = () => {
  const t = BROWSER_TOOLS.find(t => t.name === 'browser_logins')
  if (!t) throw new Error('browser_logins is not offered')
  return t
}

const ctxWith = (rows: Array<Record<string, unknown>>) => ({
  telegramId: 'tg-900000001',
  pool: {
    async query(sql: string, params: unknown[] = []) {
      if (!sql.trim().toUpperCase().startsWith('SELECT')) return { rows: [] }
      return { rows: rows.filter(r => r.telegram_id === String(params[0])) }
    },
  },
})

const liveRow = (telegramId: string, cdp: string) => ({
  telegram_id: telegramId,
  session_id: 's1',
  pod_id: 'p1',
  endpoint: '127.0.0.1:1',
  cdp_endpoint: cdp,
  state: 'live',
  view_token: 'v',
  admin_token: 'a',
})

describe('the tool', () => {
  afterEach(() => setLoginsIoForTests())

  it('says the browser is off instead of reporting everything signed out', async () => {
    const out = (await tool().handler({}, ctxWith([]) as never)) as Record<
      string,
      unknown
    >
    expect(out.running).toBe(false)
    expect(out.networks).toBeUndefined()
  })

  it("reads the caller's OWN pod, and nobody else's", async () => {
    const { io, calls } = fakePod([cookie('auth_token', '.x.com')])
    setLoginsIoForTests(io)
    const out = (await tool().handler(
      {},
      ctxWith([
        liveRow('tg-900000001', '10.0.0.7:9222'),
        liveRow('tg-somebody-else', '10.0.0.8:9222'),
      ]) as never
    )) as { running: boolean; signedIn: string[] }
    expect(calls.map(c => c.ws)).toEqual(['ws://10.0.0.7:9222/browser'])
    expect(out.running).toBe(true)
    expect(out.signedIn).toEqual(['X'])
    expect(JSON.stringify(out)).not.toContain(SECRET)
  })

  it('the journal keeps which networks, never which cookies', () => {
    const step = stepOf(
      'browser_logins',
      {},
      { result: { running: true, signedIn: ['X', 'GitHub'] } },
      12
    )
    expect(step.detail).toEqual({ running: true, signedIn: ['X', 'GitHub'] })
  })
})

describe('where it is offered', () => {
  it('closed to a client in a business DM, out of the compact kit', () => {
    expect(closedToClients('browser_logins')).toBe(true)
    expect(COMPACT_HIDDEN.has('browser_logins')).toBe(true)
  })

  it('the owner is told it exists; a client DM is not', () => {
    expect(systemPrompt('bot')).toContain('browser_logins')
    expect(systemPrompt('business')).not.toContain('browser_logins')
  })
})
