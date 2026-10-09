/**
 * Every person of the account reaches the client list, and a search the
 * list cannot answer asks the account (owner, 2026-10-09: "not all clients
 * are visible and the search does not work -- all contacts").
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearPeopleSync,
  searchTelegram,
  syncPeople,
  syncPeopleOnce,
} from './crm-people-sync'

const OWNER = '900000001'
const id = (n: number) => ({ toString: () => String(n) })

function people() {
  const rows = new Map<string, Record<string, unknown>>()
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      if (/INSERT INTO crm_people/.test(sql)) {
        const [owner, lead, first, last, username] = params as string[]
        // Names only: the conflict branch never moves seen_at.
        const touches = /DO UPDATE[\s\S]*seen_at\s*=\s*now\(\)/.test(sql)
        rows.set(`${owner}:${lead}`, { first, last, username, touches })
      }
      return { rows: [] }
    },
  }
  return { pool, rows }
}

function fakeClient(o: {
  contacts?: unknown[]
  dialogs?: unknown[]
  search?: { myResults: unknown[]; users: unknown[] }
  failContacts?: boolean
}) {
  const asked: string[] = []
  const c = {
    invoke: async (req: { className?: string; q?: string }) => {
      asked.push(String(req?.className))
      if (req?.className === 'contacts.GetContacts') {
        if (o.failContacts) throw new Error('FLOOD_WAIT_30')
        return { users: o.contacts ?? [] }
      }
      if (req?.className === 'contacts.Search') return o.search
      throw new Error('unexpected ' + req?.className)
    },
    getDialogs: async () => o.dialogs ?? [],
    disconnect: vi.fn(async () => undefined),
  }
  return { c, asked, open: async () => c }
}

const ctx = (pool: unknown) => ({ telegramId: OWNER, pool }) as never

afterEach(() => clearPeopleSync())

describe('the sync files every person of the account', () => {
  it('the contact book and the people of every dialog, never bots or self', async () => {
    const db = people()
    const f = fakeClient({
      contacts: [
        { id: id(900000002), firstName: 'Anna', username: 'username' },
        { id: id(900000003), firstName: 'Bot', bot: true },
      ],
      dialogs: [
        { isUser: true, entity: { id: id(900000004), firstName: 'Ivan' } },
        { isUser: true, entity: { id: id(900000005), self: true } },
        { isUser: false, entity: { id: id(900000006), title: 'a group' } },
      ],
    })
    const r = await syncPeople(ctx(db.pool), f.open)
    expect(r).toEqual({ contacts: 1, dialogs: 1, stopped: null })
    expect([...db.rows.keys()].sort()).toEqual([
      `${OWNER}:900000002`,
      `${OWNER}:900000004`,
    ])
    expect(db.rows.get(`${OWNER}:900000002`)).toMatchObject({
      first: 'Anna',
      username: 'username',
      touches: false,
    })
    expect(f.c.disconnect).toHaveBeenCalled()
  })

  it('a refused contact book still walks the dialogs, and says where it stopped', async () => {
    const db = people()
    const f = fakeClient({
      failContacts: true,
      dialogs: [
        { isUser: true, entity: { id: id(900000004), firstName: 'Ivan' } },
      ],
    })
    const r = await syncPeople(ctx(db.pool), f.open)
    expect(r.dialogs).toBe(1)
    expect(r.stopped).toMatch(/contacts: .*FLOOD_WAIT/)
  })

  it('runs once per owner, and again after a failed start', async () => {
    const run = vi.fn(async () => ({ contacts: 0, dialogs: 0, stopped: null }))
    expect(syncPeopleOnce(ctx(null), run)).toBe(true)
    expect(syncPeopleOnce(ctx(null), run)).toBe(false)
    expect(run).toHaveBeenCalledTimes(1)
    clearPeopleSync()
    const failing = vi.fn(async () => {
      throw new Error('not connected')
    })
    expect(syncPeopleOnce(ctx(null), failing)).toBe(true)
    await new Promise(r => setTimeout(r, 0))
    expect(syncPeopleOnce(ctx(null), failing)).toBe(true)
  })
})

describe('a search the list cannot answer asks the account', () => {
  it("finds the owner's own people and an exact @username, files them, skips strangers", async () => {
    const db = people()
    const f = fakeClient({
      search: {
        myResults: [{ userId: id(900000004) }],
        users: [
          { id: id(900000004), firstName: 'Anna', lastName: 'K' },
          { id: id(900000002), firstName: 'Anna', username: 'username' },
          { id: id(900000007), firstName: 'Anna', username: 'someone' },
        ],
      },
    })
    const found = await searchTelegram(ctx(db.pool), '@username', 20, f.open)
    expect(found.sort()).toEqual(['900000002', '900000004'])
    expect(db.rows.has(`${OWNER}:900000007`)).toBe(false)
    expect(f.asked).toEqual(['contacts.Search'])
  })

  it('empty words ask nothing', async () => {
    const f = fakeClient({})
    expect(await searchTelegram(ctx(null), ' @ ', 20, f.open)).toEqual([])
    expect(f.asked).toEqual([])
  })
})
