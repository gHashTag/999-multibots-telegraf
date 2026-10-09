/**
 * The client list reaches every person of the account (crm-people-sync.ts):
 * its first page starts the names sync, and a search the table cannot
 * answer asks the account, then reads the table again.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sync = vi.hoisted(() => ({
  syncPeopleOnce: vi.fn(() => true),
  searchTelegram: vi.fn(async () => [] as string[]),
}))
vi.mock('./src/agent/crm-people-sync', () => sync)

import { CRM_CLIENT_WORKSPACE_TOOLS } from './src/agent/crm-client-workspace-tools'
import type { ToolContext } from './src/agent/tools'

const OWNER = '144022504'
process.env.OWNER_TELEGRAM_ID = OWNER
const ANNA = {
  lead_id: '900000002',
  first_name: 'Anna',
  last_name: null,
  username: 'username',
  seen_at: 'x',
}

function db(filedAfterSearch: boolean) {
  let filed = false
  sync.searchTelegram.mockImplementation(async () => {
    filed = filedAfterSearch
    return filedAfterSearch ? [ANNA.lead_id] : []
  })
  const reads: string[] = []
  const pool = {
    query: async (sql: string) => {
      if (
        /FROM crm_people/.test(sql) &&
        /SELECT p.lead_id, p.first_name/.test(sql)
      ) {
        reads.push(sql)
        return { rows: filed ? [ANNA] : [] }
      }
      return { rows: [] }
    },
  }
  return { pool, reads }
}

const clients = async (args: Record<string, unknown>, pool: unknown) =>
  (await CRM_CLIENT_WORKSPACE_TOOLS.find(
    t => t.name === 'crm_clients'
  )!.handler(args, { telegramId: OWNER, pool } as unknown as ToolContext)) as {
    clients: { telegram_id: string }[]
  }

beforeEach(() => {
  sync.syncPeopleOnce.mockClear()
  sync.searchTelegram.mockClear()
})

describe('the client list reaches every person of the account', () => {
  it('the first page starts the names sync; a later page and a search do not', async () => {
    const d = db(false)
    await clients({ limit: 5 }, d.pool)
    expect(sync.syncPeopleOnce).toHaveBeenCalledTimes(1)
    await clients({ limit: 5, offset: 5 }, d.pool)
    await clients({ limit: 5, query: 'anna' }, d.pool)
    expect(sync.syncPeopleOnce).toHaveBeenCalledTimes(1)
  })

  it('a search the table cannot answer asks the account and shows who it filed', async () => {
    const d = db(true)
    const out = await clients({ limit: 5, query: '@username' }, d.pool)
    expect(sync.searchTelegram).toHaveBeenCalledWith(
      expect.anything(),
      'username',
      5
    )
    expect(d.reads).toHaveLength(2)
    expect(out.clients.map(c => c.telegram_id)).toContain(ANNA.lead_id)
  })

  it('nothing found in the account: one read, an empty answer', async () => {
    const d = db(false)
    const out = await clients({ limit: 5, query: 'nobody' }, d.pool)
    expect(sync.searchTelegram).toHaveBeenCalledTimes(1)
    expect(d.reads).toHaveLength(1)
    expect(out.clients).toEqual([])
  })
})
