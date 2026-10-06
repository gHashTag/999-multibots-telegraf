/**
 * Owner, 2026-09-22: the agent stood still on a Google settings page waiting
 * for "Allow", the question was only a Telegram message, and in the stream
 * the page's buttons were below the edge with no way to scroll on a phone.
 */
import { describe, it, expect } from 'vitest'
import { handleBrowser, type BrowserDeps } from './src/browser/routes'
import {
  parseTypeBody,
  typeLikeAPerson,
  SHORT_TEXT,
} from './src/browser/person-type'

type Row = {
  id: string
  telegram_id: string
  what: string
  state: string
  fresh: boolean
  /** The page host of a question about acting on a page; absent otherwise. */
  act_host?: string | null
}

function pool(rows: Row[]) {
  const said: string[] = []
  /* What the session was told: [telegram id, host] per opened window. */
  const opened: unknown[][] = []
  return {
    said,
    opened,
    async query(sql: string, params: unknown[] = []) {
      said.push(sql)
      const s = sql.trim().toUpperCase()
      if (s.startsWith('CREATE') || s.startsWith('ALTER')) return { rows: [] }
      if (s.startsWith('SELECT ACT_HOST FROM BROWSER_APPROVALS')) {
        const r = rows.find(
          r =>
            r.id === params[0] &&
            r.telegram_id === params[1] &&
            r.state === 'allowed'
        )
        return { rows: r ? [{ act_host: r.act_host ?? null }] : [] }
      }
      if (s.includes('FROM BROWSER_APPROVALS') && s.startsWith('SELECT')) {
        const r = rows
          .filter(
            r => r.telegram_id === params[0] && r.state === 'pending' && r.fresh
          )
          .at(-1)
        return { rows: r ? [{ id: r.id, what: r.what }] : [] }
      }
      if (s.startsWith('UPDATE BROWSER_APPROVALS')) {
        const [id, who, state] = params as string[]
        const r = rows.find(
          r =>
            r.id === id &&
            r.telegram_id === who &&
            r.state === 'pending' &&
            r.fresh
        )
        if (!r) return { rows: [] }
        r.state = state
        return { rows: [{ state }] }
      }
      if (s.startsWith('UPDATE BROWSER_SESSIONS')) {
        if (/ALLOWED_AT = NOW\(\)/.test(s)) opened.push(params)
        return { rows: [] }
      }
      if (s.startsWith('SELECT')) return { rows: [] }
      return { rows: [] }
    },
  }
}

const deps = (
  p: ReturnType<typeof pool>,
  actor: 'person' | 'agent' = 'person',
  body = ''
): BrowserDeps => ({
  getPool: async () => p as never,
  identity: () => '9000000051',
  driver: { name: 'fake' } as never,
  newToken: () => 't',
  actor: () => actor,
  readBody: async () => body,
})

const req = (method: string) => ({ url: '/api/browser/decide', method })

describe('the question in the app, answered by the person', () => {
  it('shows the open question, without any token', async () => {
    const p = pool([
      {
        id: 'a1',
        telegram_id: '9000000051',
        what: 'press Skip on the Google address page',
        state: 'pending',
        fresh: true,
      },
    ])
    const out = await handleBrowser(req('GET'), deps(p))
    expect(out.status).toBe(200)
    expect(out.body).toEqual({
      ok: true,
      approval: { id: 'a1', what: 'press Skip on the Google address page' },
    })
  })

  it('allows, and the guarded door opens for the agent', async () => {
    const rows: Row[] = [
      {
        id: 'a1',
        telegram_id: '9000000051',
        what: 'x',
        state: 'pending',
        fresh: true,
        act_host: 'accounts.google.com',
      },
    ]
    const p = pool(rows)
    const out = await handleBrowser(
      req('POST'),
      deps(p, 'person', JSON.stringify({ id: 'a1', allow: true }))
    )
    expect(out.status).toBe(200)
    expect(rows[0].state).toBe('allowed')
    expect(p.said.some(q => /allowed_at = now\(\)/.test(q))).toBe(true)
    /* ...for the place it was asked about, and nowhere else. */
    expect(p.opened).toEqual([['9000000051', 'accounts.google.com']])
  })

  it('A YES TO CLOSING TABS OR A BLOG POST OPENS NO GUARDED PAGE', async () => {
    /* browser_tidy and the desks ask with no page host (2026-10-03). */
    const rows: Row[] = [
      {
        id: 'tidy1',
        telegram_id: '9000000051',
        what: 'close 3 tabs',
        state: 'pending',
        fresh: true,
        act_host: null,
      },
    ]
    const p = pool(rows)
    const out = await handleBrowser(
      req('POST'),
      deps(p, 'person', JSON.stringify({ id: 'tidy1', allow: true }))
    )
    expect(out.status).toBe(200)
    expect(rows[0].state).toBe('allowed')
    expect(p.opened).toEqual([])
    expect(p.said.some(q => /allowed_at = now\(\)/.test(q))).toBe(false)
  })

  it('a no is a no, and opens nothing', async () => {
    const rows: Row[] = [
      {
        id: 'a1',
        telegram_id: '9000000051',
        what: 'x',
        state: 'pending',
        fresh: true,
      },
    ]
    const p = pool(rows)
    await handleBrowser(
      req('POST'),
      deps(p, 'person', JSON.stringify({ id: 'a1', allow: false }))
    )
    expect(rows[0].state).toBe('denied')
    expect(p.said.some(q => /allowed_at = now\(\)/.test(q))).toBe(false)
  })

  it('REFUSES an agent key: it cannot see or answer its own question', async () => {
    const rows: Row[] = [
      {
        id: 'a1',
        telegram_id: '9000000051',
        what: 'x',
        state: 'pending',
        fresh: true,
      },
    ]
    const p = pool(rows)
    expect((await handleBrowser(req('GET'), deps(p, 'agent'))).status).toBe(403)
    const out = await handleBrowser(
      req('POST'),
      deps(p, 'agent', JSON.stringify({ id: 'a1', allow: true }))
    )
    expect(out.status).toBe(403)
    expect(rows[0].state).toBe('pending')
  })

  it('only their own question, once, while fresh', async () => {
    const rows: Row[] = [
      {
        id: 'other',
        telegram_id: '9000000099',
        what: 'x',
        state: 'pending',
        fresh: true,
      },
      {
        id: 'old',
        telegram_id: '9000000051',
        what: 'x',
        state: 'pending',
        fresh: false,
      },
      {
        id: 'done',
        telegram_id: '9000000051',
        what: 'x',
        state: 'denied',
        fresh: true,
      },
    ]
    const p = pool(rows)
    for (const id of ['other', 'old', 'done']) {
      const out = await handleBrowser(
        req('POST'),
        deps(p, 'person', JSON.stringify({ id, allow: true }))
      )
      expect(out.status).toBe(409)
    }
    expect(rows.map(r => r.state)).toEqual(['pending', 'pending', 'denied'])
  })
})

describe('the keys a phone cannot send through the video', () => {
  it('scroll, Tab and Escape are accepted on their own', () => {
    expect(parseTypeBody('{"scroll":"down"}')).toMatchObject({
      scroll: 'down',
      text: '',
      key: null,
    })
    expect(parseTypeBody('{"key":"Tab"}')).toMatchObject({ key: 'Tab' })
    expect(parseTypeBody('{"key":"Escape"}')).toMatchObject({ key: 'Escape' })
  })

  it('any other key is not a key', () => {
    expect(() => parseTypeBody('{"key":"F12"}')).toThrow('nothing to type')
    expect(() => parseTypeBody('{"scroll":"sideways"}')).toThrow(
      'nothing to type'
    )
  })
})

describe('a code goes in box by box', () => {
  /*
   * 2026-09-23, X's four-digit passcode: one insertion put all four digits
   * into the FIRST box and the page kept one. A short text is typed the way
   * a keyboard sends it, so a field that moves focus after every character
   * gets what it expects.
   */
  it('types a short code key by key, and never as one insertion', async () => {
    const calls: Array<{ method: string; text?: string }> = []
    const fakeCall = async (
      method: string,
      params: Record<string, unknown>
    ) => {
      calls.push({ method, text: params.text as string | undefined })
      return {}
    }
    await typeLikeAPerson(fakeCall, '1234', false)
    expect(calls.some(c => c.method === 'Input.insertText')).toBe(false)
    const typed = calls
      .filter(c => c.method === 'Input.dispatchKeyEvent' && c.text)
      .map(c => c.text)
      .join('')
    expect(typed).toBe('1234')
  })

  it('still inserts a long answer in one go', async () => {
    const calls: string[] = []
    const fakeCall = async (method: string) => {
      calls.push(method)
      return {}
    }
    await typeLikeAPerson(fakeCall, 'x'.repeat(SHORT_TEXT + 1), false)
    expect(calls).toContain('Input.insertText')
  })
})
