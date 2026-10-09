/**
 * The agent proposes tasks (bot-neuro-office.t27 v7, issue #3912): markers
 * in an office answer become buttons, and only a person's press makes a
 * task -- within the day, once. The spec's own vectors run in
 * src/spec/bot-neuro-office.test.ts.
 */
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import * as SPEC from '@/spec/bot-neuro-office.gen'
import { setTopicTabsDbForTests } from '@/navigation/topics/tabs'
import {
  OFFICE_PROPOSALS_TABLE,
  PROPOSAL_PREFIX,
  officeProposals,
  proposeTasks,
  registerOfficeTasks,
  setOfficeTasksDbForTests,
  takeProposal,
} from '@/navigation/topics/officeTasks'

const ROOM = -1001234567894
const office = [
  { thread_id: 11, kind: 'agent', title: 'a', created_at: new Date() },
]
const HOUR = 3_600_000

/**
 * office_task_proposals and office_tasks in memory. Each statement is
 * answered by what its SQL names: a SELECT filters by id, bot and chat; the
 * UPDATE takes a proposal only while `taken_at IS NULL`, as the SQL says.
 */
function officeDb(opts: { failInsert?: boolean } = {}) {
  const proposals: any[] = []
  const tasks: any[] = []
  const sql: string[] = []
  let nextP = 1
  let nextT = 1
  return {
    proposals,
    tasks,
    sql,
    async query(q: string, p: any[] = []) {
      const s = q.trim()
      sql.push(s)
      if (s.startsWith('CREATE')) return { rows: [] }
      if (s.startsWith('INSERT INTO office_task_proposals')) {
        if (opts.failInsert) throw new Error('db down')
        const [bot, chat, text, owner_name] = p
        const row = {
          id: nextP++,
          bot,
          chat,
          text,
          owner_name,
          created: Date.now(),
          taken_by: null,
          taken_at: null,
        }
        proposals.push(row)
        return { rows: [{ id: row.id }] }
      }
      if (s.startsWith('SELECT') && /FROM office_task_proposals/.test(s)) {
        const [id, bot, chat] = p
        return {
          rows: proposals
            .filter(
              r =>
                r.id === id &&
                (!/bot_username = \$2/.test(s) || r.bot === bot) &&
                (!/chat_id = \$3/.test(s) || r.chat === chat)
            )
            .map(r => ({
              id: r.id,
              text: r.text,
              owner_name: r.owner_name,
              taken_at: r.taken_at,
              age_hours: (Date.now() - r.created) / HOUR,
            })),
        }
      }
      if (s.startsWith('UPDATE office_task_proposals')) {
        const [id, by] = p
        const r = proposals.find(
          x => x.id === id && (!/taken_at IS NULL/.test(s) || !x.taken_at)
        )
        if (!r) return { rows: [] }
        r.taken_by = by
        r.taken_at = new Date()
        return { rows: [{ id }] }
      }
      if (s.startsWith('INSERT INTO office_tasks')) {
        const [bot, chat, text, owner_id, owner_name, author_id] = p
        const row = {
          id: nextT++,
          bot,
          chat,
          text,
          owner_id,
          owner_name,
          author_id,
        }
        tasks.push(row)
        return { rows: [{ id: row.id }] }
      }
      throw new Error('unexpected sql ' + s)
    },
  }
}

const anna = { id: 5, first_name: 'Anna', language_code: 'en' }

function roomCtx(over: { chatType?: string; from?: any } = {}): any {
  const replies: Array<{ text: string; extra?: any }> = []
  return {
    replies,
    chat: { id: ROOM, type: over.chatType ?? 'supergroup' },
    botInfo: { username: 'tasks_bot', id: 42 },
    from: over.from ?? anna,
    message: { text: 'x', from: over.from ?? anna, message_thread_id: 11 },
    reply: async (text: string, extra?: any) => {
      replies.push({ text, extra })
    },
  }
}

function pressCtx(
  data: string,
  keyboard: any[][],
  over: { from?: any; chatId?: number } = {}
): any {
  const events: string[] = []
  const replies: string[] = []
  const edits: any[] = []
  return {
    events,
    replies,
    edits,
    chat: { id: over.chatId ?? ROOM, type: 'supergroup' },
    botInfo: { username: 'tasks_bot', id: 42 },
    from: over.from ?? { id: 9, first_name: 'Oleg', language_code: 'en' },
    callbackQuery: {
      data,
      message: { reply_markup: { inline_keyboard: keyboard } },
    },
    answerCbQuery: async () => {
      events.push('answerCbQuery')
    },
    editMessageReplyMarkup: async (m: any) => {
      events.push('edit')
      edits.push(m)
    },
    reply: async (t: string) => {
      events.push('reply')
      replies.push(t)
    },
  }
}

describe('the markers of an answer', () => {
  it('each marker becomes a proposal and leaves the words', () => {
    const got = officeProposals(
      'Agreed.\n[[todo:Anna|draft the mockup by Friday]]\n[[todo: @oleg |count the budget]]'
    )
    expect(got.text).toBe('Agreed.')
    expect(got.items).toEqual([
      { name: 'Anna', text: 'draft the mockup by Friday' },
      { name: '@oleg', text: 'count the budget' },
    ])
  })

  it('at most three, in the order given', () => {
    const four = [1, 2, 3, 4].map(i => `[[todo:P${i}|t${i}]]`).join(' ')
    const got = officeProposals('Plan: ' + four)
    expect(got.items.map(p => p.name)).toEqual(['P1', 'P2', 'P3'])
    expect(got.text).toBe('Plan:')
  })

  it('a team member, an empty name or work, and the bounds are dropped -- and stripped all the same', () => {
    const long = 'x'.repeat(SPEC.TASK_TEXT_MAX_CHARS + 1)
    const longName = 'n'.repeat(SPEC.SPEAKER_NAME_MAX_CHARS + 1)
    const got = officeProposals(
      [
        'Done.',
        '[[todo:Казначей|count the budget]]', // cyrillic-ok: a member's name as people type it
        '[[todo:Treasurer|count it]]',
        '[[todo:|nobody]]',
        '[[todo:Anna|]]',
        `[[todo:Anna|${long}]]`,
        `[[todo:${longName}|x]]`,
        `[[todo:Vera|${'y'.repeat(SPEC.TASK_TEXT_MAX_CHARS)}]]`,
      ].join('\n')
    )
    expect(got.items.map(p => p.name)).toEqual(['Vera'])
    expect(got.text).toBe('Done.')
  })

  it('the marker is read whatever its case; an answer without one is as it was', () => {
    expect(officeProposals('[[TODO:Anna|call]]').items).toEqual([
      { name: 'Anna', text: 'call' },
    ])
    expect(officeProposals('Just words [[Pay|act:topup]]')).toEqual({
      text: 'Just words [[Pay|act:topup]]',
      items: [],
    })
  })
})

describe('the proposals under an answer', () => {
  let db: ReturnType<typeof officeDb>
  let tabs: string[]
  beforeEach(() => {
    db = officeDb()
    tabs = []
    setOfficeTasksDbForTests(db)
    setTopicTabsDbForTests({
      query: async (sql: string) => {
        tabs.push(sql)
        return /^\s*SELECT/.test(sql) ? { rows: office } : { rows: [] }
      },
    } as any)
  })

  it('in an office each is stored and gets a button that names it', async () => {
    const ctx = roomCtx()
    const made = await proposeTasks(ctx, [
      { name: 'Anna', text: 'draft the mockup' },
      { name: 'Oleg', text: 'z'.repeat(200) },
    ])
    expect(made).toBe(2)
    expect(db.proposals.map(p => [p.chat, p.owner_name, p.bot])).toEqual([
      [ROOM, 'Anna', 'tasks_bot'],
      [ROOM, 'Oleg', 'tasks_bot'],
    ])
    expect(db.sql).toContain(OFFICE_PROPOSALS_TABLE.trim())
    const rows = ctx.replies[0].extra.reply_markup.inline_keyboard
    expect(rows).toHaveLength(2)
    expect(rows[0][0]).toEqual({
      text: '📌 Anna: draft the mockup',
      callback_data: `${PROPOSAL_PREFIX}1`,
    })
    expect([...rows[1][0].text]).toHaveLength(60)
    expect(rows[1][0].text.endsWith('…')).toBe(true)
    expect(ctx.replies[0].text).toMatch(/\/todos/)
  })

  it('nothing to propose, or no office, stores nothing and says nothing', async () => {
    const ctx = roomCtx()
    expect(await proposeTasks(ctx, [])).toBe(0)
    expect(tabs).toHaveLength(0)
    setTopicTabsDbForTests({ query: async () => ({ rows: [] }) } as any)
    expect(await proposeTasks(ctx, [{ name: 'Anna', text: 'x' }])).toBe(0)
    const dm = roomCtx({ chatType: 'private' })
    expect(await proposeTasks(dm, [{ name: 'Anna', text: 'x' }])).toBe(0)
    expect(db.proposals).toHaveLength(0)
    expect(ctx.replies).toHaveLength(0)
  })

  it('a database that fails leaves the answer as it was, never throws', async () => {
    setOfficeTasksDbForTests(officeDb({ failInsert: true }))
    const ctx = roomCtx()
    expect(await proposeTasks(ctx, [{ name: 'Anna', text: 'x' }])).toBe(0)
    expect(ctx.replies).toHaveLength(0)
  })

  it('a Russian room is asked in Russian', async () => {
    const ctx = roomCtx({
      from: { id: 5, first_name: 'Аня', language_code: 'ru' },
    }) // cyrillic-ok: a person's name
    await proposeTasks(ctx, [{ name: 'Аня', text: 'макет' }]) // cyrillic-ok: test data
    expect(ctx.replies[0].text).toMatch(/Записать задачи/) // cyrillic-ok: the copy under test
  })
})

describe('a press on a proposal', () => {
  let db: ReturnType<typeof officeDb>
  const keyboard = () => [
    [{ text: '📌 Anna: mockup', callback_data: 'otp:1' }],
    [{ text: '📌 Oleg: budget', callback_data: 'otp:2' }],
  ]
  beforeEach(async () => {
    db = officeDb()
    setOfficeTasksDbForTests(db)
    setTopicTabsDbForTests({
      query: async (sql: string) =>
        /^\s*SELECT/.test(sql) ? { rows: office } : { rows: [] },
    } as any)
    await proposeTasks(roomCtx(), [
      { name: 'Anna', text: 'mockup' },
      { name: 'Oleg', text: 'budget' },
    ])
  })

  it('makes the task, the presser its author, and takes only its own button away', async () => {
    const ctx = pressCtx('otp:1', keyboard())
    expect(await takeProposal(ctx)).toBe('taken')
    expect(ctx.events[0]).toBe('answerCbQuery')
    expect(db.tasks).toEqual([
      {
        id: 1,
        bot: 'tasks_bot',
        chat: ROOM,
        text: 'mockup',
        owner_id: null,
        owner_name: 'Anna',
        author_id: 9,
      },
    ])
    expect(ctx.replies[0]).toBe('Task #1 — Anna: mockup (by Oleg)')
    expect(ctx.edits[0]).toEqual({
      inline_keyboard: [[{ text: '📌 Oleg: budget', callback_data: 'otp:2' }]],
    })
    expect(db.proposals[0].taken_by).toBe(9)
  })

  it('a second press finds it taken: no second task, no second write, the room is not told', async () => {
    await takeProposal(pressCtx('otp:1', keyboard()))
    const updates = () => db.sql.filter(q => q.startsWith('UPDATE')).length
    expect(updates()).toBe(1)
    const again = pressCtx('otp:1', keyboard(), {
      from: { id: 11, first_name: 'Vera' },
    })
    expect(await takeProposal(again)).toBe('gone')
    expect(db.tasks).toHaveLength(1)
    expect(again.replies).toHaveLength(0)
    expect(again.events).toContain('edit')
    expect(updates()).toBe(1)
  })

  it('two presses read it untaken at once: the write takes it only once', async () => {
    await takeProposal(pressCtx('otp:1', keyboard()))
    // the second press read the row before the first one wrote it
    const real = db.query.bind(db)
    db.query = async (q: string, p: any[] = []) => {
      const r = await real(q, p)
      return /^SELECT/.test(q.trim())
        ? { rows: r.rows.map((x: any) => ({ ...x, taken_at: null })) }
        : r
    }
    const late = pressCtx('otp:1', keyboard(), {
      from: { id: 11, first_name: 'Vera' },
    })
    expect(await takeProposal(late)).toBe('gone')
    expect(db.tasks).toHaveLength(1)
    expect(db.proposals[0].taken_by).toBe(9)
  })

  it('the last button taken leaves no keyboard', async () => {
    const ctx = pressCtx('otp:2', [[{ text: 'x', callback_data: 'otp:2' }]])
    await takeProposal(ctx)
    expect(ctx.edits[0]).toBeUndefined()
  })

  it('a press a day later is stale: the room is told how to make it by hand', async () => {
    db.proposals[0].created = Date.now() - SPEC.PROPOSAL_TTL_HOURS * HOUR - 1000
    const ctx = pressCtx('otp:1', keyboard())
    expect(await takeProposal(ctx)).toBe('stale')
    expect(db.tasks).toHaveLength(0)
    expect(ctx.replies[0]).toBe(
      'That proposal is stale. If the task still stands: /todo mockup'
    )
  })

  it('a press just inside the day still counts', async () => {
    db.proposals[0].created = Date.now() - (SPEC.PROPOSAL_TTL_HOURS - 1) * HOUR
    expect(await takeProposal(pressCtx('otp:1', keyboard()))).toBe('taken')
  })

  it("a bot's press makes nothing and touches nothing", async () => {
    const ctx = pressCtx('otp:1', keyboard(), {
      from: { id: 77, is_bot: true, first_name: 'Bot' },
    })
    expect(await takeProposal(ctx)).toBe('refused')
    expect(db.tasks).toHaveLength(0)
    expect(ctx.edits).toHaveLength(0)
  })

  it('a proposal of another room, an unknown one, or a lost race makes nothing', async () => {
    const other = pressCtx('otp:1', keyboard(), { chatId: -100999 })
    expect(await takeProposal(other)).toBe('gone')
    expect(await takeProposal(pressCtx('otp:99', keyboard()))).toBe('gone')
    expect(await takeProposal(pressCtx('otp:x', keyboard()))).toBe('refused')
    // somebody else took it between the read and the write
    const race = pressCtx('otp:2', keyboard())
    db.proposals[1].taken_at = null
    const real = db.query.bind(db)
    db.query = async (q: string, p: any[] = []) =>
      q.trim().startsWith('UPDATE') ? { rows: [] } : real(q, p)
    expect(await takeProposal(race)).toBe('gone')
    expect(db.tasks).toHaveLength(0)
  })

  it('no database: the press is answered and refused', async () => {
    setOfficeTasksDbForTests(null)
    const prev = process.env.TOKENS_DATABASE_URL
    const prevR = process.env.RENDER_DATABASE_URL
    delete process.env.TOKENS_DATABASE_URL
    delete process.env.RENDER_DATABASE_URL
    try {
      const ctx = pressCtx('otp:1', keyboard())
      expect(await takeProposal(ctx)).toBe('refused')
      expect(ctx.events).toEqual(['answerCbQuery'])
    } finally {
      if (prev !== undefined) process.env.TOKENS_DATABASE_URL = prev
      if (prevR !== undefined) process.env.RENDER_DATABASE_URL = prevR
    }
  })

  it('a Russian presser is answered in Russian', async () => {
    const ctx = pressCtx('otp:1', keyboard(), {
      from: { id: 9, first_name: 'Олег', language_code: 'ru' }, // cyrillic-ok: a person's name
    })
    await takeProposal(ctx)
    expect(ctx.replies[0]).toMatch(/^Задача #1/) // cyrillic-ok: the copy under test
  })
})

describe('the wiring', () => {
  it('the press is registered with the task commands', () => {
    const actions: any[] = []
    registerOfficeTasks({
      command: () => undefined,
      action: (trigger: any) => actions.push(trigger),
    } as any)
    expect(actions).toHaveLength(1)
    expect(actions[0].test('otp:12')).toBe(true)
    expect(actions[0].test('otp:x')).toBe(false)
  })

  it("the agent's answer loses its markers before the buttons, and a room gets the proposals", () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../navigation/registerCommands.ts'),
      'utf8'
    )
    expect(src).toMatch(/const offered = officeProposals\(\s*ответ\.текст/) // cyrillic-ok: field of ОтветАгента
    expect(src).toMatch(/buttonsForAnswer\(\s*offered\.text,/)
    expect(src).toMatch(
      /if \(turnWhere\.room\) \{[\s\S]{0,200}await proposeTasks\(ctx, offered\.items\)/
    )
  })
})
