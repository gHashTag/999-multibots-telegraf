/**
 * THE PER-CLIENT WORKSPACE READS: plan aggregation and the client list.
 * Spec: t27 specs/automation/crm-client-workspace.t27
 */
import { describe, it, expect } from 'vitest'
import {
  aggregatePlan,
  mergeClients,
  CRM_CLIENT_WORKSPACE_TOOLS,
} from './src/agent/crm-client-workspace-tools'
import type { ToolContext } from './src/agent/tools'

const OWNER = '144022504'
process.env.OWNER_TELEGRAM_ID = OWNER
const CLIENT = '435572800'
const OTHER = '500000001'

describe('crm_client_plan', () => {
  it('aggregates items per goal and in total, by status', () => {
    const out = aggregatePlan(
      [
        { id: 1, title: 'Серия рилс', intent: 'узнавание' },
        { id: 2, title: 'Пустая цель', intent: null },
      ],
      [
        {
          id: 1,
          goal_id: 1,
          title: 'a',
          status: 'idea',
          template_id: 'LeelaPlanReel',
          updated_at: 't',
        },
        {
          id: 2,
          goal_id: 1,
          title: 'b',
          status: 'done',
          template_id: null,
          updated_at: 't',
        },
        {
          id: 3,
          goal_id: 1,
          title: 'c',
          status: 'draft',
          template_id: null,
          updated_at: 't',
        },
        {
          id: 4,
          goal_id: 1,
          title: 'd',
          status: 'done',
          template_id: null,
          updated_at: 't',
        },
      ]
    )
    expect(out.total).toBe(4)
    expect(out.done).toBe(2)
    expect(out.goals[0].items).toEqual({
      total: 4,
      done: 2,
      by_status: { idea: 1, done: 2, draft: 1 },
    })
    expect(out.goals[1].items).toEqual({ total: 0, done: 0, by_status: {} })
    expect(out.items.length).toBe(4)
  })

  it('reads both tables for the given client only, after the gate', async () => {
    const seen: Array<{ sql: string; params: unknown[] }> = []
    const pool = {
      query: async (sql: string, params: unknown[] = []) => {
        seen.push({ sql: sql.replace(/\s+/g, ' '), params })
        if (/content_plan_goals WHERE/.test(sql))
          return { rows: [{ id: 1, title: 'g', intent: null }] }
        if (/content_plan_items WHERE/.test(sql))
          return {
            rows: [
              {
                id: 1,
                goal_id: 1,
                title: 'i',
                status: 'done',
                template_id: null,
                updated_at: 't',
              },
            ],
          }
        return { rows: [] }
      },
    }
    const tool = CRM_CLIENT_WORKSPACE_TOOLS.find(
      t => t.name === 'crm_client_plan'
    )!
    const out = (await tool.handler({ telegram_id: CLIENT }, {
      telegramId: OWNER,
      pool,
    } as unknown as ToolContext)) as any
    expect(out).toMatchObject({ telegram_id: CLIENT, total: 1, done: 1 })
    for (const q of seen.filter(s => /WHERE telegram_id/.test(s.sql)))
      expect(q.params[0]).toBe(CLIENT)
    await expect(
      tool.handler({ telegram_id: 'abc' }, {
        telegramId: OWNER,
        pool,
      } as unknown as ToolContext)
    ).rejects.toThrow()
  })
})

describe('crm_clients', () => {
  it('is the union of profiles and people, one row per person, newest first', () => {
    const rows = mergeClients({
      profiles: [
        {
          telegram_id: CLIENT,
          client: 'Лила Чакра',
          updated_at: '2026-09-13T10:00:00Z',
        },
      ],
      people: [
        {
          lead_id: CLIENT,
          first_name: 'Geya',
          last_name: null,
          username: 'playom',
          seen_at: '2026-09-12T10:00:00Z',
        },
        {
          lead_id: OTHER,
          first_name: 'Ivan',
          last_name: 'P',
          username: null,
          seen_at: '2026-09-13T12:00:00Z',
        },
      ],
      souls: new Set([CLIENT]),
      skills: new Map([[CLIENT, 3]]),
      duets: new Map([[CLIENT, 7]]),
      touches: new Map([
        [OTHER, [{ kind: 'written', at: '2026-09-13T12:00:00Z' }]],
      ]),
      now: Date.parse('2026-09-13T13:00:00Z'),
    })
    expect(rows.map(r => r.telegram_id)).toEqual([OTHER, CLIENT])
    expect(rows[1]).toEqual({
      telegram_id: CLIENT,
      name: 'Geya',
      username: 'playom',
      client: 'Лила Чакра',
      has_profile: true,
      has_soul: true,
      skills: 3,
      stage: 'new',
      paid: false,
      last_seen: '2026-09-13T10:00:00Z',
      duets: 7,
    })
    expect(rows[0]).toMatchObject({
      name: 'Ivan P',
      has_profile: false,
      has_soul: false,
      skills: 0,
      duets: 0,
      stage: 'written',
    })
  })

  // Spec: t27 specs/automation/crm-client-ownership.t27 (#3608)
  it('money outranks every touch: a paying person is a client, or winback after 60 quiet days', () => {
    const now = Date.parse('2026-09-13T13:00:00Z')
    const people = (seen: string) => [
      {
        lead_id: CLIENT,
        first_name: 'Geya',
        last_name: null,
        username: 'playom',
        seen_at: seen,
      },
    ]
    const base = {
      profiles: [],
      souls: new Set<string>(),
      skills: new Map<string, number>(),
      duets: new Map<string, number>(),
      touches: new Map([
        [CLIENT, [{ kind: 'refused' as const, at: '2026-09-13T12:00:00Z' }]],
      ]),
      now,
    }
    expect(
      mergeClients({ ...base, people: people('2026-09-13T12:00:00Z') })[0]
    ).toMatchObject({ stage: 'refused', paid: false })
    expect(
      mergeClients({
        ...base,
        people: people('2026-09-13T12:00:00Z'),
        paid: new Set([CLIENT]),
      })[0]
    ).toMatchObject({
      stage: 'client',
      paid: true,
    })
    expect(
      mergeClients({
        ...base,
        people: people('2026-07-01T12:00:00Z'),
        paid: new Set([CLIENT]),
      })[0]
    ).toMatchObject({
      stage: 'winback',
      paid: true,
    })
    expect(
      mergeClients({
        ...base,
        people: people('2026-07-01T12:00:00Z'),
        paid: new Set([OTHER]),
      })[0].paid
    ).toBe(false)
  })

  it('scopes people, duets and touches to the caller and survives missing tables', async () => {
    const seen: Array<{ sql: string; params: unknown[] }> = []
    const pool = {
      query: async (sql: string, params: unknown[] = []) => {
        seen.push({ sql: sql.replace(/\s+/g, ' '), params })
        if (/FROM crm_people/.test(sql))
          return {
            rows: [
              {
                lead_id: CLIENT,
                first_name: 'Geya',
                last_name: null,
                username: 'playom',
                seen_at: 'x',
              },
            ],
          }
        if (
          /FROM crm_duet_runs|FROM user_soul|FROM user_skills|FROM crm_touches/.test(
            sql
          )
        )
          throw new Error('no such table')
        return { rows: [] }
      },
    }
    const tool = CRM_CLIENT_WORKSPACE_TOOLS.find(t => t.name === 'crm_clients')!
    const out = (await tool.handler({ limit: 5 }, {
      telegramId: OWNER,
      pool,
    } as unknown as ToolContext)) as any
    expect(out.clients).toHaveLength(1)
    expect(out.clients[0]).toMatchObject({
      telegram_id: CLIENT,
      name: 'Geya',
      has_profile: false,
      duets: 0,
    })
    for (const q of seen.filter(s => /WHERE owner_id = \$1/.test(s.sql)))
      expect(q.params[0]).toBe(OWNER)
    expect(seen.some(s => /FROM crm_people WHERE owner_id/.test(s.sql))).toBe(
      true
    )
    expect(
      seen.some(s => /FROM crm_duet_runs WHERE owner_id/.test(s.sql))
    ).toBe(true)
    // Profiles: ours and the unowned legacy rows, never another seller's.
    const prof = seen.find(s => /FROM crm_client_profiles WHERE/.test(s.sql))!
    expect(prof.sql).toMatch(/owner_id = \$2 OR owner_id IS NULL/)
    expect(prof.params[1]).toBe(OWNER)
    // No Supabase in this test: the money column is unknown and the stage came from touches alone.
    expect(out.paid_known).toBe(false)
    expect(out.clients[0].paid).toBe(false)
  })
})
