import { describe, it, expect, beforeEach } from 'vitest'
import {
  rememberManagedBot,
  managedBotsOf,
  forgetManagedBotsTableForTests,
} from './src/agent/managed-bots'

/**
 * The token of a managed bot is readable exactly once, when the update lands
 * -- BotFather does not own such a bot, we do. So it is kept immediately, and
 * then guarded: a listing that could show it would eventually show it.
 */
const TOKEN = 'invented:for-this-test' // secret-guard-ok: not a real key

function fakePool(rows: unknown[] = []) {
  const queries: Array<{ sql: string; params: unknown[] }> = []
  return {
    queries,
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql: sql.replace(/\s+/g, ' ').trim(), params })
      return { rows }
    },
  }
}

beforeEach(() => forgetManagedBotsTableForTests())

describe('keeping a bot that was just created', () => {
  it('stores the owner, the bot and its token', async () => {
    const pool = fakePool()
    expect(
      await rememberManagedBot(pool as never, {
        owner: '144022504',
        botId: 8123456789,
        botUsername: '@olga_seller_bot',
        token: TOKEN,
      })
    ).toBe('saved')
    const ins = pool.queries.find(q =>
      q.sql.startsWith('INSERT INTO managed_bots')
    )!
    expect(ins.params).toEqual([
      8123456789,
      '144022504',
      'olga_seller_bot',
      TOKEN,
    ])
  })

  it('replaces the row when the same bot gets a new token', async () => {
    // The update fires on creation AND on a token change. A stored token that
    // is no longer valid is worse than none: somebody would paste it.
    const pool = fakePool()
    await rememberManagedBot(pool as never, {
      owner: '1',
      botId: 5,
      botUsername: 'x_bot',
      token: TOKEN,
    })
    const ins = pool.queries.find(q =>
      q.sql.startsWith('INSERT INTO managed_bots')
    )!
    expect(ins.sql).toContain('ON CONFLICT (bot_id) DO UPDATE')
    expect(ins.sql).toContain(
      'token        = EXCLUDED.token'.replace(/\s+/g, ' ')
    )
  })

  it('refuses a row that is missing anything, rather than storing half of it', async () => {
    const pool = fakePool()
    for (const bad of [
      { owner: '', botId: 5, botUsername: 'x_bot', token: TOKEN },
      { owner: '1', botId: 0, botUsername: 'x_bot', token: TOKEN },
      { owner: '1', botId: 5, botUsername: '', token: TOKEN },
      { owner: '1', botId: 5, botUsername: 'x_bot', token: '' },
    ]) {
      expect(await rememberManagedBot(pool as never, bad as never)).toBe(
        'not saved'
      )
    }
    expect(
      pool.queries.some(q => q.sql.startsWith('INSERT INTO managed_bots'))
    ).toBe(false)
  })

  it('says so instead of throwing when the database refuses', async () => {
    const broken = {
      query: async () => {
        throw new Error('no database')
      },
    }
    expect(
      await rememberManagedBot(broken as never, {
        owner: '1',
        botId: 5,
        botUsername: 'x_bot',
        token: TOKEN,
      })
    ).toBe('not saved')
  })
})

describe('listing them back', () => {
  it('never selects the token', async () => {
    /*
     * The decisive case. A listing exists to be shown, and a secret that can
     * be shown will be shown. Moving a key into the environment is a
     * deliberate act with its own command, not a side effect of looking.
     */
    const pool = fakePool([
      { bot_id: 5, bot_username: 'x_bot', created_at: '2026-09-15' },
    ])
    const list = await managedBotsOf(pool as never, '144022504')
    const select = pool.queries.find(q => q.sql.startsWith('SELECT'))!
    expect(select.sql).not.toContain('token')
    expect(list[0]).toEqual({
      botId: 5,
      botUsername: 'x_bot',
      createdAt: '2026-09-15',
    })
    expect(JSON.stringify(list)).not.toContain('invented')
  })

  it('answers with nothing when the database is down', async () => {
    const broken = {
      query: async () => {
        throw new Error('no database')
      },
    }
    expect(await managedBotsOf(broken as never, '1')).toEqual([])
  })
})
