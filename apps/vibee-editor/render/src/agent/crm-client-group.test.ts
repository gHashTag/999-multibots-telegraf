import { beforeEach, describe, expect, it } from 'vitest'
import {
  bindClientGroup,
  clientGroupFor,
  clientGroupLine,
  resetClientGroupTableForTests,
  unbindClientGroup,
} from './crm-client-group'
import { resetGroupTablesForTests } from './crm-groups'
import { COMPACT_TOOLS_EXCLUDED, TOOLS } from './tools'

/**
 * A CLIENT'S GROUP (owner, 2026-09-26: "the Farisha group -- allowed").
 *
 * Pinned: only a group the CRM has read for THIS owner can be bound; the
 * brief names the group and the rule (a card, the owner's press, everybody
 * sees it); unbinding forgets it. Fictional ids only (9000000xx).
 */
const OWNER = '900000060'
const LEAD = '900000061'
const GROUP = '-900000062'

function fakePool(known: string[]) {
  const binds = new Map<string, string>()
  return {
    binds,
    async query(sql: string, p: unknown[] = []) {
      if (/^\s*(CREATE|ALTER)/i.test(sql)) return { rows: [] }
      if (sql.includes('SELECT 1 FROM crm_groups'))
        return { rows: known.includes(String(p[1])) ? [{ '?column?': 1 }] : [] }
      if (sql.includes('INSERT INTO crm_client_groups')) {
        binds.set(`${p[0]}|${p[1]}`, String(p[2]))
        return { rows: [] }
      }
      if (sql.includes('DELETE FROM crm_client_groups')) {
        binds.delete(`${p[0]}|${p[1]}`)
        return { rows: [] }
      }
      if (sql.includes('FROM crm_client_groups')) {
        const chat = binds.get(`${p[0]}|${p[1]}`)
        return {
          rows: chat
            ? [
                {
                  chat_id: chat,
                  title: 'Farisha project',
                  username: null,
                  members_count: 4,
                },
              ]
            : [],
        }
      }
      return { rows: [] }
    },
  }
}

beforeEach(() => {
  resetClientGroupTableForTests()
  resetGroupTablesForTests()
})

describe('binding a client to a group', () => {
  it('binds a group the CRM has read, and reads it back with its title', async () => {
    const pool = fakePool([GROUP])
    const g = await bindClientGroup(pool, OWNER, LEAD, GROUP)
    expect(g).toEqual({
      chat_id: GROUP,
      title: 'Farisha project',
      username: null,
      members_count: 4,
    })
    expect(await clientGroupFor(pool, OWNER, LEAD)).toEqual(g)
  })

  it('refuses a group nobody read: a typo must not stand as "the client group"', async () => {
    const pool = fakePool([])
    await expect(bindClientGroup(pool, OWNER, LEAD, GROUP)).rejects.toThrow(
      'not in your CRM'
    )
    expect(pool.binds.size).toBe(0)
  })

  it('refuses a person id as a group and a group id as a client', async () => {
    const pool = fakePool([GROUP])
    await expect(bindClientGroup(pool, OWNER, LEAD, LEAD)).rejects.toThrow(
      'negative'
    )
    await expect(bindClientGroup(pool, OWNER, GROUP, GROUP)).rejects.toThrow(
      'person'
    )
  })

  it('unbinding forgets it', async () => {
    const pool = fakePool([GROUP])
    await bindClientGroup(pool, OWNER, LEAD, GROUP)
    await unbindClientGroup(pool, OWNER, LEAD)
    expect(await clientGroupFor(pool, OWNER, LEAD)).toBeNull()
  })
})

describe('the brief line', () => {
  it('names the group and the rule: a card, the press, everybody sees it', () => {
    const line = clientGroupLine({
      chat_id: GROUP,
      title: 'Farisha project',
      username: null,
      members_count: 4,
    })
    expect(line).toContain('Farisha project')
    expect(line).toContain(`tg_send {chat: "${GROUP}"}`)
    expect(line).toContain('Отправить') // cyrillic-ok: the owner's button
    expect(line).toContain('ВСЕ') // cyrillic-ok: every member sees it
  })

  it('says nothing when no group is bound', () => {
    expect(clientGroupLine(null)).toBe('')
  })
})

describe('registry', () => {
  it('crm_client_group is registered and kept out of the compact kit', () => {
    expect(TOOLS.some(t => t.name === 'crm_client_group')).toBe(true)
    expect(COMPACT_TOOLS_EXCLUDED.test('crm_client_group')).toBe(true)
  })
})
