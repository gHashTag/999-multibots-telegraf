import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CONNECTIONS_TABLE,
  connectionForOwner,
  knownConnections,
  rememberConnection,
  setConnectionsDbForTests,
  type Db,
} from '@/services/businessConnections.store'

/*
 * businessBotService is imported inside the two cases that need it, after the
 * mocks below: at module load it reaches for the chat service and the model
 * switch, and a static import here fails before a single test runs.
 */
vi.mock('@/services/aiChatService', () => ({
  chatWithAI: async () => 'ok reply',
}))
vi.mock('@/services/modelSwitch', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/modelSwitch')>()),
  wasAgentSent: async () => false,
}))

/**
 * THE FIVE-DAY MESSAGE THAT COULD NOT BE SENT AS THE OWNER.
 *
 * 2026-09-24. A client had waited five days. The owner said "send it". The text
 * was in his voice -- "Лена, это Дима" -- and it went from a bot, with the
 * channel explained inside the message, because a message in his own DM needs a
 * `business_connection_id` and that id lived only in process memory. Telegram
 * sends `business_connection` when the LINK CHANGES and never on restart, so
 * after any deploy the platform could not start a conversation as anybody until
 * that person's client happened to write first.
 *
 * Each test below is one way this store could give that ability back and then
 * quietly take it away again.
 */

function fakeDb(): Db & { sql: string[]; rows: any[] } {
  const state: any = { sql: [], rows: [] }
  state.query = async (sql: string, params?: unknown[]) => {
    state.sql.push(sql)
    if (/^CREATE TABLE/.test(sql.trim())) return { rows: [] }
    if (/^INSERT/.test(sql.trim())) {
      // A crude upsert: last write per connection id wins, as ON CONFLICT does.
      const [id, owner, chat, bot, canReply, enabled] = params as any[]
      state.rows = [
        ...state.rows.filter((r: any) => r.connection_id !== id),
        {
          connection_id: id,
          owner_id: owner,
          owner_chat_id: chat,
          bot_name: bot,
          can_reply: canReply,
          enabled,
          connected_at: null,
        },
      ]
      return { rows: [] }
    }
    const owner = (params as any[])?.[0]
    let rows = state.rows.filter((r: any) => r.enabled)
    if (/owner_id = \$1/.test(sql))
      rows = rows.filter((r: any) => r.owner_id === owner && r.can_reply)
    return { rows }
  }
  return state
}

describe('the platform can write as an owner after a restart', () => {
  beforeEach(() => setConnectionsDbForTests(null))

  it('remembers a connection and hands it back', async () => {
    const d = fakeDb()
    setConnectionsDbForTests(d)
    await rememberConnection({
      connectionId: 'conn-1',
      ownerId: 144022504,
      ownerChatId: 144022504,
      botName: 'neuro_blogger_bot',
      canReply: true,
      enabled: true,
    })
    expect(await connectionForOwner(144022504)).toEqual({
      connectionId: 'conn-1',
      ownerChatId: '144022504',
    })
  })

  it('creates its table before it needs it', async () => {
    // No migration runner in this repository: the first call brings the schema
    // or the feature is a table that exists on one machine.
    const d = fakeDb()
    setConnectionsDbForTests(d)
    await connectionForOwner(1)
    expect(d.sql[0]).toBe(CONNECTIONS_TABLE)
  })

  it('refuses a link the owner turned off, and keeps the row', async () => {
    // "Never connected" and "connected, then unlinked" are different states.
    // Writing as somebody after they switched it off is the exact thing they
    // switched off, so the row stays and the answer is no.
    const d = fakeDb()
    setConnectionsDbForTests(d)
    await rememberConnection({
      connectionId: 'conn-2',
      ownerId: '77',
      ownerChatId: '77',
      canReply: true,
      enabled: true,
    })
    await rememberConnection({
      connectionId: 'conn-2',
      ownerId: '77',
      ownerChatId: '77',
      canReply: true,
      enabled: false,
    })
    expect(await connectionForOwner('77')).toBeNull()
    expect(d.rows).toHaveLength(1)
  })

  it('refuses a link Telegram did not grant writing on', async () => {
    // can_reply is Telegram's permission, not our assumption: a link without it
    // lets the bot read the correspondence and not write in it.
    const d = fakeDb()
    setConnectionsDbForTests(d)
    await rememberConnection({
      connectionId: 'conn-3',
      ownerId: '88',
      ownerChatId: '88',
      canReply: false,
      enabled: true,
    })
    expect(await connectionForOwner('88')).toBeNull()
  })

  it('lists what a fresh process may use, which is the whole point', async () => {
    const d = fakeDb()
    setConnectionsDbForTests(d)
    await rememberConnection({
      connectionId: 'a',
      ownerId: '1',
      ownerChatId: '1',
      canReply: true,
      enabled: true,
    })
    await rememberConnection({
      connectionId: 'b',
      ownerId: '2',
      ownerChatId: '2',
      canReply: true,
      enabled: true,
    })
    const all = await knownConnections()
    expect(all.map(c => c.connectionId).sort()).toEqual(['a', 'b'])
  })

  it('answers null when there is no database, instead of throwing', async () => {
    // Most of this repository's decisions degrade rather than fail. A store
    // that throws here would take down the reply path that is answering a
    // client right now, for the sake of a message we have not written yet.
    setConnectionsDbForTests(null)
    const before = process.env.TOKENS_DATABASE_URL
    const beforeRender = process.env.RENDER_DATABASE_URL
    delete process.env.TOKENS_DATABASE_URL
    delete process.env.RENDER_DATABASE_URL
    try {
      expect(await connectionForOwner('1')).toBeNull()
      expect(await knownConnections()).toEqual([])
      await expect(
        rememberConnection({
          connectionId: 'x',
          ownerId: '1',
          ownerChatId: '1',
          canReply: true,
          enabled: true,
        })
      ).resolves.toBeUndefined()
    } finally {
      if (before) process.env.TOKENS_DATABASE_URL = before
      if (beforeRender) process.env.RENDER_DATABASE_URL = beforeRender
    }
  })

  it('does not write a row with no owner', async () => {
    const d = fakeDb()
    setConnectionsDbForTests(d)
    await rememberConnection({
      connectionId: 'conn-4',
      ownerId: '   ',
      ownerChatId: '',
      canReply: true,
      enabled: true,
    })
    expect(d.sql.filter(s => /^INSERT/.test(s.trim()))).toHaveLength(0)
  })

  it('a fresh process picks the connections up, which is the whole defect', async () => {
    // The Map used to start empty after every deploy. Telegram sends
    // `business_connection` only when the link changes, so nothing ever
    // refilled it: the ability to write as an owner lasted one process.
    const d = fakeDb()
    setConnectionsDbForTests(d)
    await rememberConnection({
      connectionId: 'restored-1',
      ownerId: '144022504',
      ownerChatId: '144022504',
      canReply: true,
      enabled: true,
    })
    const svc = await import('@/services/businessBotService')
    const restored = await svc.restoreBusinessConnections()
    expect(restored).toBeGreaterThanOrEqual(1)
    expect(
      svc.getBusinessStats().connections.some(c => c.id === 'restored-1')
    ).toBe(true)
  })

  it('a live connection is written down the moment Telegram names it', async () => {
    // The only moment we are ever told. Not writing it here is how it was lost.
    const d = fakeDb()
    setConnectionsDbForTests(d)
    const svc = await import('@/services/businessBotService')
    svc.handleBusinessConnection({
      id: 'live-1',
      user: { id: 555 },
      user_chat_id: 555,
      date: 1,
      is_enabled: true,
      rights: { can_reply: true },
    } as never)
    await new Promise(r => setTimeout(r, 20))
    expect(d.rows.some((r: any) => r.connection_id === 'live-1')).toBe(true)
  })

  it('survives a database that refuses, and says so', async () => {
    const spoke: unknown[] = []
    vi.spyOn(console, 'error').mockImplementation(() => {})
    setConnectionsDbForTests({
      query: async () => {
        spoke.push(1)
        throw new Error('connection refused')
      },
    })
    expect(await connectionForOwner('1')).toBeNull()
    expect(spoke.length).toBeGreaterThan(0)
    vi.restoreAllMocks()
  })
})
