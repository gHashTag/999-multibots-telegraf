/**
 * Owner, 2026-09-22: the agent stood still on a Google settings page waiting
 * for "Allow", the question was only a Telegram message, and in the stream
 * the page's buttons were below the edge with no way to scroll on a phone.
 */
import { describe, it, expect } from 'vitest'
import { handleBrowser, type BrowserDeps } from './src/browser/routes'
import { parseTypeBody } from './src/browser/person-type'

type Row = {
  id: string
  telegram_id: string
  what: string
  state: string
  fresh: boolean
}

function pool(rows: Row[]) {
  const said: string[] = []
  return {
    said,
    async query(sql: string, params: unknown[] = []) {
      said.push(sql)
      const s = sql.trim().toUpperCase()
      if (s.startsWith('CREATE') || s.startsWith('ALTER')) return { rows: [] }
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
      if (s.startsWith('UPDATE BROWSER_SESSIONS')) return { rows: [] }
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
