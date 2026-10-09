/**
 * The office's tasks (bot-neuro-office.t27 v5, issue #3901): /todo with an
 * owner, /todos oldest first, /done by owner, author or admin only. The
 * spec's own vectors run in src/spec/bot-neuro-office.test.ts.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import * as SPEC from '@/spec/bot-neuro-office.gen'
import { setTopicTabsDbForTests } from '@/navigation/topics/tabs'
import {
  addTask,
  closeTask,
  listTasks,
  ownerOf,
  registerOfficeTasks,
  repliedPerson,
  setOfficeTasksDbForTests,
  taskText,
} from '@/navigation/topics/officeTasks'

const ROOM = -1001234567894
const office = [
  { thread_id: 11, kind: 'agent', title: 'a', created_at: new Date() },
]

/**
 * office_tasks in memory; SELECTs return copies, as Postgres does, and
 * filter `done` only when the SQL says NOT done (a fake filters by the
 * conditions its SQL names, nothing more).
 */
function tasksDb() {
  const rows: any[] = []
  let next = 1
  return {
    rows,
    async query(sql: string, p: any[] = []) {
      const q = sql.trim()
      if (q.startsWith('CREATE')) return { rows: [] }
      if (q.startsWith('INSERT')) {
        const [bot, chat, text, owner_id, owner_name, author_id] = p
        const row = {
          id: next++,
          bot,
          chat,
          text,
          owner_id,
          owner_name,
          author_id,
          done: false,
        }
        rows.push(row)
        return { rows: [{ id: row.id }] }
      }
      const open = (r: any) => !/NOT done/.test(q) || !r.done
      if (q.startsWith('SELECT') && /ORDER BY id LIMIT \$3/.test(q)) {
        const [bot, chat, limit] = p
        return {
          rows: rows
            .filter(r => r.bot === bot && r.chat === chat && open(r))
            .sort((a, b) => a.id - b.id)
            .slice(0, limit)
            .map(r => ({ ...r })),
        }
      }
      if (q.startsWith('SELECT')) {
        const [id, bot, chat] = p
        return {
          rows: rows
            .filter(
              r => r.id === id && r.bot === bot && r.chat === chat && open(r)
            )
            .map(r => ({ ...r })),
        }
      }
      if (q.startsWith('UPDATE')) {
        const r = rows.find(x => x.id === p[0])
        if (r) r.done = true
        return { rows: [] }
      }
      throw new Error('unexpected sql ' + q)
    },
  }
}

let n = 0
const ctxIn = (
  text: string,
  over: {
    from?: any
    reply?: any
    entities?: any[]
    chatType?: string
    admin?: boolean
  } = {}
): any => {
  const replies: string[] = []
  const from = over.from ?? {
    id: 5,
    first_name: 'Anna',
    username: 'anna',
    language_code: 'en',
  }
  return {
    replies,
    chat: { id: ROOM, type: over.chatType ?? 'supergroup' },
    botInfo: { username: 'tasks_bot', id: 42 },
    from,
    message: {
      text,
      from,
      message_thread_id: 11,
      is_topic_message: true,
      entities: over.entities ?? [
        { type: 'bot_command', offset: 0, length: text.split(' ')[0].length },
      ],
      ...(over.reply ? { reply_to_message: over.reply } : {}),
    },
    telegram: {
      getChatMember: async () => ({
        status: over.admin ? 'administrator' : 'member',
      }),
    },
    reply: async (t: string) => {
      replies.push(t)
    },
    _n: n++,
  }
}

describe('the office keeps its tasks', () => {
  let db: ReturnType<typeof tasksDb>
  beforeEach(() => {
    db = tasksDb()
    setOfficeTasksDbForTests(db)
    setTopicTabsDbForTests({
      query: async (sql: string) =>
        /^\s*SELECT/.test(sql) ? { rows: office } : { rows: [] },
    } as any)
  })

  it('/todo gives the task to the sender, the person named, or the person replied to', async () => {
    const own = ctxIn('/todo draft the mockup')
    expect(await addTask(own)).toBe('added')
    expect(own.replies[0]).toBe('Task #1 — Anna: draft the mockup')

    const named = ctxIn('/todo check prices @boris', {
      entities: [
        { type: 'bot_command', offset: 0, length: 5 },
        { type: 'mention', offset: 19, length: 6 },
      ],
    })
    await addTask(named)
    expect(named.replies[0]).toBe('Task #2 — @boris: check prices')

    const replied = ctxIn('/todo send the invoice @boris', {
      reply: { message_id: 77, from: { id: 9, first_name: 'Vera' } },
      entities: [
        { type: 'bot_command', offset: 0, length: 5 },
        { type: 'mention', offset: 23, length: 6 },
      ],
    })
    await addTask(replied)
    // a reply wins over a mention
    expect(replied.replies[0]).toBe('Task #3 — Vera: send the invoice')
    expect(db.rows.map(r => [r.owner_id, r.owner_name, r.author_id])).toEqual([
      [5, 'Anna', 5],
      [null, '@boris', 5],
      [9, 'Vera', 5],
    ])
  })

  it("a forum topic's own first message is no reply to a person", () => {
    const m = {
      text: '/todo x',
      message_thread_id: 11,
      is_topic_message: true,
      from: { id: 5, first_name: 'Anna' },
      reply_to_message: {
        message_id: 11,
        from: { id: 1, first_name: 'Creator' },
      },
    }
    expect(repliedPerson(m)).toBeNull()
    expect(ownerOf(m)).toEqual({ id: 5, name: 'Anna' })
    expect(
      repliedPerson({
        reply_to_message: {
          message_id: 3,
          forum_topic_created: {},
          from: { id: 1 },
        },
      })
    ).toBeNull()
    expect(
      repliedPerson({
        reply_to_message: { message_id: 3, from: { id: 2, is_bot: true } },
      })
    ).toBeNull()
  })

  it('a task is cut to the spec bound, and an empty one is explained, not stored', async () => {
    expect([...taskText({ text: `/todo ${'z'.repeat(400)}` })]).toHaveLength(
      SPEC.TASK_TEXT_MAX_CHARS
    )
    const empty = ctxIn('/todo')
    expect(await addTask(empty)).toBe('refused')
    expect(empty.replies[0]).toMatch(/Write the task/)
    expect(db.rows).toHaveLength(0)
  })

  it('/todos shows the open tasks oldest first, at most the spec bound', async () => {
    for (let i = 0; i < SPEC.OPEN_TASKS_SHOWN_MAX + 3; i++)
      await addTask(ctxIn(`/todo task ${i}`))
    db.rows[0].done = true
    const ctx = ctxIn('/todos')
    expect(await listTasks(ctx)).toBe(SPEC.OPEN_TASKS_SHOWN_MAX)
    const lines = ctx.replies[0].split('\n')
    expect(lines[0]).toBe('#2 Anna: task 1')
    expect(lines).toHaveLength(SPEC.OPEN_TASKS_SHOWN_MAX)
  })

  it('/done: the owner, the author or an admin closes it; anybody else is told who can', async () => {
    await addTask(
      ctxIn('/todo send the invoice', {
        reply: { message_id: 77, from: { id: 9, first_name: 'Vera' } },
      })
    )
    const stranger = { id: 33, first_name: 'Gleb', language_code: 'en' }
    const no = ctxIn('/done 1', { from: stranger })
    expect(await closeTask(no)).toBe('refused')
    expect(no.replies[0]).toBe(
      'Task #1 is closed by Vera, its author or an admin.'
    )
    expect(db.rows[0].done).toBe(false)

    expect(
      await closeTask(
        ctxIn('/done #1', { from: { id: 9, first_name: 'Vera' } })
      )
    ).toBe('closed')
    expect(db.rows[0].done).toBe(true)
    expect(await closeTask(ctxIn('/done 1'))).toBe('missing')

    await addTask(ctxIn('/todo y'))
    expect(
      await closeTask(ctxIn('/done 2', { from: stranger, admin: true }))
    ).toBe('closed')
    await addTask(
      ctxIn('/todo z @gleb', {
        entities: [
          { type: 'bot_command', offset: 0, length: 5 },
          { type: 'mention', offset: 8, length: 5 },
        ],
      })
    )
    expect(
      await closeTask(
        ctxIn('/done 3', { from: { ...stranger, username: 'gleb' } })
      )
    ).toBe('closed')
  })

  it('outside an office the commands say where they work and store nothing', async () => {
    setTopicTabsDbForTests({ query: async () => ({ rows: [] }) } as any)
    const ctx = ctxIn('/todo x')
    expect(await addTask(ctx)).toBe('refused')
    expect(ctx.replies[0]).toMatch(/neuro-office/)
    expect(await listTasks(ctxIn('/todos'))).toBe(0)
    expect(await closeTask(ctxIn('/done 1'))).toBe('refused')
    expect(db.rows).toHaveLength(0)
  })

  it('the three commands are registered, and a failure is said', async () => {
    const handlers: Record<string, any> = {}
    registerOfficeTasks({
      command: (name: string, h: any) => (handlers[name] = h),
      action: () => undefined,
    } as any)
    expect(Object.keys(handlers).sort()).toEqual(['done', 'todo', 'todos'])
    setOfficeTasksDbForTests({
      query: async () => {
        throw new Error('db down')
      },
    })
    const ctx = ctxIn('/todo x')
    await handlers.todo(ctx)
    expect(ctx.replies.at(-1)).toBe('That did not work, try again.')
  })
})

describe('the bot registers the office tasks', () => {
  it('registerCommands calls registerOfficeTasks beside /office', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(
      join(__dirname, '../../navigation/registerCommands.ts'),
      'utf8'
    )
    const at = src.indexOf('  registerOfficeCommand(bot)')
    expect(at).toBeGreaterThan(-1)
    expect(src.slice(at, at + 300)).toContain('registerOfficeTasks(bot)')
  })
})
