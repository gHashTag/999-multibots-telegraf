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
  assignedIsTask,
  assignOk,
  assignToOffice,
  mayAssign,
  OFFICE_CRM_TOOLS,
  OFFICE_PROPOSALS_TABLE,
  officeIn,
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

  it("the owner assigns into the client's office, never from the client's DM", () => {
    expect(mayAssign(true, false, true, true)).toBe(true)
    expect(mayAssign(false, false, true, true)).toBe(false)
    expect(mayAssign(true, true, true, true)).toBe(false)
    expect(mayAssign(true, false, false, true)).toBe(false)
    expect(mayAssign(true, false, true, false)).toBe(false)
  })

  it('an assignment is a proposal until a person in the office presses', () => {
    expect(SPEC.ASSIGN_IS_PROPOSAL).toBe(true)
    expect(assignedIsTask(false)).toBe(false)
    expect(assignedIsTask(true)).toBe(true)
  })

  it("an assignment names a person and the work within the office's bounds", () => {
    expect(SPEC.ASSIGN_NAME_MAX_CHARS).toBe(64)
    expect(SPEC.ASSIGN_TEXT_MAX_CHARS).toBe(300)
    expect(assignOk(4, 20)).toBe(true)
    expect(assignOk(64, 300)).toBe(true)
    expect(assignOk(65, 20)).toBe(false)
    expect(assignOk(4, 301)).toBe(false)
    expect(assignOk(0, 20)).toBe(false)
    expect(assignOk(4, 0)).toBe(false)
  })

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(2)
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

/**
 * crm_office_task (v2, #3919): the owner's word in a client's thread becomes
 * a proposal in the client's office, posted by the office's bot.
 */
function assignWorld(opts: {
  seller?: boolean
  bound?: string | null
  office?: { bot_username: string; thread_id: number; kind: string }[]
  token?: string | null
  sendOk?: boolean
}) {
  const sql: Array<{ q: string; p?: unknown[] }> = []
  const sent: Array<{ token: string; body: any }> = []
  const proposals: any[] = []
  const pool = {
    async query(q: string, p?: unknown[]) {
      sql.push({ q, p })
      if (/FROM bot_topic_tabs/.test(q)) {
        const rows = (opts.office ?? [])
          .filter(r => (/thread_id > 0/.test(q) ? r.thread_id > 0 : true))
          .sort((a, b) =>
            /ORDER BY \(kind = 'agent'\) DESC/.test(q)
              ? Number(b.kind === 'agent') - Number(a.kind === 'agent') ||
                a.thread_id - b.thread_id
              : 0
          )
        return { rows: rows.slice(0, 1) }
      }
      if (/^INSERT INTO office_task_proposals/.test(q)) {
        proposals.push({ id: proposals.length + 41, p })
        return { rows: [{ id: proposals.length + 40 }] }
      }
      if (/^DELETE FROM office_task_proposals/.test(q)) {
        proposals.splice(0, 1)
        return { rows: [] }
      }
      return { rows: [] }
    },
  }
  const deps = {
    isSeller: async () => opts.seller ?? true,
    groupOf: async () =>
      opts.bound === undefined
        ? { chat_id: GROUP }
        : opts.bound
          ? { chat_id: opts.bound }
          : null,
    tokenOf: async () => (opts.token === undefined ? 'T0K' : opts.token),
    send: async (token: string, body: any) => {
      sent.push({ token, body })
      return opts.sendOk === false
        ? { ok: false, description: 'Bad Request: chat not found' }
        : { ok: true }
    },
  }
  return { sql, sent, proposals, pool, deps }
}

const OFFICE_ROWS = [
  { bot_username: 'office_bot', thread_id: 7, kind: 'wallet' },
  { bot_username: 'office_bot', thread_id: 11, kind: 'agent' },
]
const turn = (pool: any, surface = 'miniapp') =>
  ({ telegramId: '144022504', pool, surface }) as never
const ask = { client: '987654321', name: 'Anna', text: 'the mockup by Friday' }

describe("the owner assigns into the client's office (v2)", () => {
  it("the office's bot posts a proposal in the Agent's channel with the press button", async () => {
    const w = assignWorld({ office: OFFICE_ROWS })
    const r = await assignToOffice(ask, turn(w.pool), w.deps)
    expect(r).toMatchObject({
      proposed: 41,
      group: GROUP,
      office_bot: 'office_bot',
      is_task: false,
    })
    expect(w.sql.map(x => x.q)).toContain(OFFICE_PROPOSALS_TABLE)
    expect(w.sent).toHaveLength(1)
    const { token, body } = w.sent[0]
    expect(token).toBe('T0K')
    expect(body.chat_id).toBe(GROUP)
    expect(body.message_thread_id).toBe(11)
    expect(body.reply_markup.inline_keyboard[0][0]).toEqual({
      text: '📌 Anna: the mockup by Friday',
      callback_data: 'otp:41',
    })
    const insert = w.sql.find(x => /^INSERT/.test(x.q))!
    expect(insert.p).toEqual([
      'office_bot',
      GROUP,
      'the mockup by Friday',
      'Anna',
    ])
  })

  it('the post speaks the language asked for, and a long label is cut', async () => {
    const w = assignWorld({ office: OFFICE_ROWS })
    await assignToOffice(
      { ...ask, text: 'x'.repeat(120), lang: 'en' },
      turn(w.pool),
      w.deps
    )
    expect(w.sent[0].body.text).toMatch(/A task from the owner/)
    expect([
      ...w.sent[0].body.reply_markup.inline_keyboard[0][0].text,
    ]).toHaveLength(60)
    const ru = assignWorld({ office: OFFICE_ROWS })
    await assignToOffice(ask, turn(ru.pool), ru.deps)
    expect(ru.sent[0].body.text).toMatch(/Задача от владельца/) // cyrillic-ok: the copy under test
  })

  it("from the client's DM, or by somebody who is not the seller: nothing is posted", async () => {
    const dm = assignWorld({ office: OFFICE_ROWS })
    await expect(
      assignToOffice(ask, turn(dm.pool, 'business'), dm.deps)
    ).rejects.toThrow(/владелец/) // cyrillic-ok: the refusal under test
    const stranger = assignWorld({ seller: false, office: OFFICE_ROWS })
    await expect(
      assignToOffice(ask, turn(stranger.pool), stranger.deps)
    ).rejects.toThrow(/владелец/) // cyrillic-ok: the refusal under test
    expect([...dm.sent, ...stranger.sent]).toHaveLength(0)
    expect(dm.sql.some(x => /bot_topic_tabs/.test(x.q))).toBe(false)
  })

  it('no bound group, or no office in it: said, nothing posted', async () => {
    const unbound = assignWorld({ bound: null, office: OFFICE_ROWS })
    await expect(
      assignToOffice(ask, turn(unbound.pool), unbound.deps)
    ).rejects.toThrow(/crm_client_group/)
    const noOffice = assignWorld({ office: [] })
    await expect(
      assignToOffice(ask, turn(noOffice.pool), noOffice.deps)
    ).rejects.toThrow(/\/office/)
    expect([...unbound.sent, ...noOffice.sent]).toHaveLength(0)
  })

  it('an office bot the farm does not know, or a post Telegram refuses: no proposal stays behind', async () => {
    const lost = assignWorld({ office: OFFICE_ROWS, token: null })
    await expect(
      assignToOffice(ask, turn(lost.pool), lost.deps)
    ).rejects.toThrow(/@office_bot/)
    expect(lost.proposals).toHaveLength(0)
    const refused = assignWorld({ office: OFFICE_ROWS, sendOk: false })
    await expect(
      assignToOffice(ask, turn(refused.pool), refused.deps)
    ).rejects.toThrow(/chat not found/)
    expect(refused.proposals).toHaveLength(0)
  })

  it('a bad client id or a name and work outside the bounds is refused before anything is read', async () => {
    const w = assignWorld({ office: OFFICE_ROWS })
    await expect(
      assignToOffice({ ...ask, client: 'abc' }, turn(w.pool), w.deps)
    ).rejects.toThrow(/client/)
    await expect(
      assignToOffice({ ...ask, name: '' }, turn(w.pool), w.deps)
    ).rejects.toThrow(/name/)
    await expect(
      assignToOffice({ ...ask, text: 'y'.repeat(301) }, turn(w.pool), w.deps)
    ).rejects.toThrow(/300/)
    await expect(
      assignToOffice({ ...ask, name: 'n'.repeat(65) }, turn(w.pool), w.deps)
    ).rejects.toThrow(/64/)
    expect(w.sql).toHaveLength(0)
  })

  it("an office is found by the group's tabs; a person's id or a failed read is no office", async () => {
    const w = assignWorld({ office: OFFICE_ROWS })
    expect(await officeIn(w.pool, GROUP)).toEqual({
      bot: 'office_bot',
      thread: 11,
    })
    expect(await officeIn(w.pool, '144022504')).toBeNull()
    expect(
      await officeIn(
        {
          query: async () => {
            throw new Error('down')
          },
        },
        GROUP
      )
    ).toBeNull()
  })

  it("the tool is in the catalogue, out of the compact kit, with the bot's table byte for byte", async () => {
    const { TOOLS, COMPACT_TOOLS_EXCLUDED } = await import('../agent/tools')
    expect(TOOLS.some(t => t.name === 'crm_office_task')).toBe(true)
    expect(OFFICE_CRM_TOOLS[0].name).toBe('crm_office_task')
    expect(COMPACT_TOOLS_EXCLUDED.test('crm_office_task')).toBe(true)
    const bot = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        '..',
        'src',
        'navigation',
        'topics',
        'officeTasks.ts'
      ),
      'utf8'
    )
    expect(bot).toContain(
      'export const OFFICE_PROPOSALS_TABLE = `' +
        OFFICE_PROPOSALS_TABLE.slice('CREATE'.length * 0)
    )
    expect(bot).toContain("export const PROPOSAL_PREFIX = 'otp:'")
  })
})
