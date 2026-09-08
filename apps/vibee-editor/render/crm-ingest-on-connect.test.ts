import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * The memory starts the moment the account is connected: the ingest runs by
 * itself after the session is saved, deep, and never breaks the connect.
 */
beforeEach(() => vi.resetModules())

describe('ingestAfterConnect', () => {
  it('runs the ingest for that person and reports what it read', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const { ingestAfterConnect } = await import(
      './src/agent/crm-ingest-on-connect'
    )
    const run = vi.fn(async () => ({
      people: 3,
      messages_new: 40,
      zep_mirrored: 40,
      stopped: null,
    }))
    const pool = { query: async () => ({ rows: [] }) }
    const r = await ingestAfterConnect(pool, '144022504', run)
    expect(run).toHaveBeenCalledWith(pool, '144022504')
    expect(r?.messages_new).toBe(40)
    expect(String(log.mock.calls[0]?.[0])).toContain('people=3')
    log.mockRestore()
  })

  it('a failing ingest is a warning, not an exception', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { ingestAfterConnect } = await import(
      './src/agent/crm-ingest-on-connect'
    )
    const r = await ingestAfterConnect(
      { query: async () => ({ rows: [] }) },
      '5',
      async () => {
        throw new Error('not the owner')
      }
    )
    expect(r).toBeNull()
    expect(String(warn.mock.calls[0]?.[0])).toContain('not the owner')
    warn.mockRestore()
  })

  it('by default it calls crm_ingest_chats as that person, every dialog, deep', async () => {
    const handler = vi.fn(async () => ({
      people: 1,
      messages_new: 2,
      zep_mirrored: 2,
    }))
    vi.doMock('./src/agent/crm-memory-tools', () => ({
      CRM_MEMORY_TOOLS: [{ name: 'crm_ingest_chats', handler }],
    }))
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const { ingestAfterConnect } = await import(
      './src/agent/crm-ingest-on-connect'
    )
    const pool = { query: async () => ({ rows: [] }) }
    await ingestAfterConnect(pool, '144022504')
    expect(handler).toHaveBeenCalledTimes(1)
    const [args, ctx] = handler.mock.calls[0] as unknown as [any, any]
    expect(args).toEqual({ limit: 100, depth: 200 })
    expect(ctx.telegramId).toBe('144022504')
    expect(ctx.pool).toBe(pool)
    expect(ctx.surface).toBe('bot')
    vi.doUnmock('./src/agent/crm-memory-tools')
  })

  it('the connect route fires it after BOTH ways of saving a session', () => {
    const src = readFileSync('src/agent/tg-connect.ts', 'utf8')
    const saves = src.split('await сохранитьСессию(').length - 1 // cyrillic-ok: pre-existing identifier
    const fires = src.split('void ingestAfterConnect(pool, кто)').length - 1 // cyrillic-ok: pre-existing local
    expect(saves).toBeGreaterThanOrEqual(2)
    expect(fires).toBe(saves)
  })
})
