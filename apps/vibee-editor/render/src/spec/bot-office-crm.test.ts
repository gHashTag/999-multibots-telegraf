/**
 * Spec bot-office-crm.t27 (gHashTag/t27#7999), every test block run against
 * the render's code in agent/office-crm.ts, then the behaviour: an office
 * turn of the bot is taught the task marker and no other turn is, the
 * owner's client card lists the open tasks of the client's office, and a
 * room turn carries no client. The bot's half (the buttons, the press) is
 * bound in src/spec/bot-neuro-office.test.ts at the repository root.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as SPEC from './bot-office-crm.gen'
import {
  cardTasksShown,
  clientCardListsTasks,
  OFFICE_TASK_MARKERS,
  officeTasksFor,
  officeTasksLine,
  roomGetsClientCard,
  teachesTaskMarker,
} from '../agent/office-crm'
import { clientContextBlock, officeTaskSection } from '../agent/chat'

describe('spec bot-office-crm.t27', () => {
  it('the task marker is taught in an office turn of the bot only', () => {
    expect(teachesTaskMarker(true, true, false)).toBe(true)
    expect(teachesTaskMarker(false, true, false)).toBe(false)
    expect(teachesTaskMarker(true, false, false)).toBe(false)
    expect(teachesTaskMarker(true, true, true)).toBe(false)
  })

  it("the client's card lists the office's open tasks when the group is bound", () => {
    expect(SPEC.CLIENT_CARD_SHOWS_OFFICE_TASKS).toBe(true)
    expect(clientCardListsTasks(true, 1)).toBe(true)
    expect(clientCardListsTasks(false, 3)).toBe(false)
    expect(clientCardListsTasks(true, 0)).toBe(false)
  })

  it('the card shows at most five tasks', () => {
    expect(SPEC.CLIENT_CARD_TASKS_MAX).toBe(5)
    expect(cardTasksShown(4)).toBe(4)
    expect(cardTasksShown(5)).toBe(5)
    expect(cardTasksShown(6)).toBe(5)
    expect(cardTasksShown(0)).toBe(0)
  })

  it("a room turn never carries a client's card", () => {
    expect(SPEC.ROOM_SEES_CLIENT_CARD).toBe(false)
    expect(roomGetsClientCard(true)).toBe(false)
    expect(roomGetsClientCard(false)).toBe(true)
  })

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(1)
  })
})

describe('the office turn is taught the marker', () => {
  it('an office turn of the bot gets the section, the sweep and other surfaces do not', () => {
    expect(officeTaskSection({ office: true, surface: 'bot' })).toBe(
      OFFICE_TASK_MARKERS
    )
    expect(officeTaskSection({ office: true, surface: 'miniapp' })).toBe('')
    expect(
      officeTaskSection({ office: true, surface: 'bot', toolsOnly: true })
    ).toBe('')
    expect(officeTaskSection({ surface: 'bot' })).toBe('')
    expect(officeTaskSection(undefined)).toBe('')
  })

  it("the section names the bot's marker and the bounds its parser keeps", () => {
    expect(OFFICE_TASK_MARKERS).toContain('[[todo:')
    expect(OFFICE_TASK_MARKERS).toContain('300')
  })

  it('the route marks an office turn and keeps the client off a room turn', () => {
    const routes = readFileSync(
      join(__dirname, '..', 'agent', 'routes.ts'),
      'utf8'
    )
    expect(routes).toContain('office: officeMember(body.member, gate.room)')
    expect(routes).toMatch(/client: roomGetsClientCard\(!!gate\.room\)/)
  })

  it("the section joins the turn's system prompt", () => {
    const chat = readFileSync(join(__dirname, '..', 'agent', 'chat.ts'), 'utf8')
    expect(chat).toMatch(
      /teamSection\(opts, history\) \+\s*officeTaskSection\(opts\)/
    )
  })
})

/**
 * A pool that answers only what its SQL names: the bound group, the office's
 * open tasks (filtered by `NOT done` because the SQL says so), and nothing
 * for every other read the brief makes.
 */
function fakePool(opts: {
  bound?: string | null
  tasks?: Array<{
    id: number
    text: string
    owner_name: string
    done?: boolean
    chat_id: string
  }>
  failTasks?: boolean
}) {
  const calls: Array<{ sql: string; params?: unknown[] }> = []
  return {
    calls,
    async query(sql: string, params?: unknown[]) {
      calls.push({ sql, params })
      if (/FROM crm_client_groups/.test(sql)) {
        return {
          rows: opts.bound
            ? [
                {
                  chat_id: opts.bound,
                  title: 'Project',
                  username: null,
                  members_count: 4,
                },
              ]
            : [],
        }
      }
      if (/FROM office_tasks/.test(sql)) {
        if (opts.failTasks)
          throw new Error('relation "office_tasks" does not exist')
        let rows = (opts.tasks ?? []).filter(
          t => t.chat_id === String(params?.[0])
        )
        if (/NOT done/.test(sql)) rows = rows.filter(t => !t.done)
        // the count of all only when the SQL counts them
        const open = /count\(\*\) OVER \(\)/.test(sql) ? rows.length : undefined
        return {
          rows: rows
            .sort((a, b) => a.id - b.id)
            .slice(0, Number(params?.[1]))
            .map(r => ({ ...r, open })),
        }
      }
      return { rows: [] }
    },
  }
}

const GROUP = '-1001234567890'
const task = (
  id: number,
  text: string,
  extra: Partial<{ done: boolean; chat_id: string }> = {}
) => ({
  id,
  text,
  owner_name: 'Anna',
  chat_id: GROUP,
  ...extra,
})

describe("the office in the client's card", () => {
  it('reads the open tasks of the group, oldest first, at most five, with the count of all', async () => {
    const pool = fakePool({
      tasks: [7, 3, 9, 1, 5, 2, 8].map(i => task(i, `t${i}`)),
    })
    const found = await officeTasksFor(pool, GROUP)
    expect(found.open).toBe(7)
    expect(found.tasks.map(t => t.id)).toEqual([1, 2, 3, 5, 7])
  })

  it('a closed task and another group are not the card', async () => {
    const pool = fakePool({
      tasks: [
        task(1, 'open'),
        task(2, 'closed', { done: true }),
        task(3, 'elsewhere', { chat_id: '-1009999999999' }),
      ],
    })
    const found = await officeTasksFor(pool, GROUP)
    expect(found.tasks.map(t => t.text)).toEqual(['open'])
    expect(found.open).toBe(1)
  })

  it('no table, or a chat that is not a group, is no tasks and no query', async () => {
    expect(await officeTasksFor(fakePool({ failTasks: true }), GROUP)).toEqual({
      tasks: [],
      open: 0,
    })
    const pool = fakePool({ tasks: [task(1, 'x')] })
    expect(await officeTasksFor(pool, '144022504')).toEqual({
      tasks: [],
      open: 0,
    })
    expect(pool.calls).toHaveLength(0)
  })

  it('the line names each task with its owner and says how many more there are', () => {
    const five = [1, 2, 3, 4, 5].map(i => ({
      id: i,
      text: `t${i}`,
      owner_name: 'Anna',
    }))
    const line = officeTasksLine(true, { tasks: five, open: 7 })
    expect(line).toContain('#1 Anna: t1')
    expect(line).toContain('#5 Anna: t5')
    expect(line).toContain('7')
    expect(line).toMatch(/2 — \/todos/)
    expect(
      officeTasksLine(true, { tasks: five.slice(0, 2), open: 2 })
    ).not.toMatch(/\/todos/)
  })

  it('more tasks than the bound handed in: the card still shows five', () => {
    const seven = [1, 2, 3, 4, 5, 6, 7].map(i => ({
      id: i,
      text: `t${i}`,
      owner_name: 'Anna',
    }))
    const line = officeTasksLine(true, { tasks: seven, open: 7 })
    expect(line).toContain('#5 Anna: t5')
    expect(line).not.toContain('#6 Anna')
  })

  it('an unbound client or an empty office adds no line', () => {
    const one = [{ id: 1, text: 't', owner_name: 'Anna' }]
    expect(officeTasksLine(false, { tasks: one, open: 1 })).toBe('')
    expect(officeTasksLine(true, { tasks: [], open: 0 })).toBe('')
  })

  it("the owner's client card carries the office's tasks when the group is bound", async () => {
    const pool = fakePool({
      bound: GROUP,
      tasks: [task(4, 'mockup for the client')],
    })
    const block = await clientContextBlock(
      { telegramId: 144022504, pool } as never,
      '987654321'
    )
    expect(block).toContain('#4 Anna: mockup for the client')
  })

  it('an unbound client card reads no office tasks', async () => {
    const pool = fakePool({ bound: null, tasks: [task(4, 'mockup')] })
    const block = await clientContextBlock(
      { telegramId: 144022504, pool } as never,
      '987654321'
    )
    expect(block).not.toContain('mockup')
    expect(pool.calls.some(c => /FROM office_tasks/.test(c.sql))).toBe(false)
  })
})
