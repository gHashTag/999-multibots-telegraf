/**
 * The neuro-office's edges (issue #3902): every refusal, every failed reply
 * and the database pool, so office.ts and officeTasks.ts are covered line by
 * line. The rules themselves run in src/spec/bot-neuro-office.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { pools } = vi.hoisted(() => ({ pools: [] as any[] }))
vi.mock('pg', () => ({
  Pool: class {
    handlers: Record<string, (e: Error) => void> = {}
    constructor(public opts: any) {
      pools.push(this)
    }
    on(event: string, h: (e: Error) => void) {
      this.handlers[event] = h
    }
    async query() {
      return { rows: [] }
    }
  },
}))
vi.mock('@/services/trinityAgent', () => ({
  спроситьАгента: vi.fn(async () => ({ текст: 'Decided: ship Friday.' })), // cyrillic-ok: the agent client's exported names
}))

import { setTopicTabsDbForTests } from '@/navigation/topics/tabs'
import {
  catchUp,
  handOffInOffice,
  memberNamedFirst,
  namedInOffice,
  officeChannelKind,
  registerOfficeCommand,
} from '@/navigation/topics/office'
import {
  addTask,
  closeTask,
  listTasks,
  registerOfficeTasks,
  setOfficeTasksDbForTests,
} from '@/navigation/topics/officeTasks'

const ROOM = -1001234567895
const office = [
  { thread_id: 11, kind: 'agent', title: 'a', created_at: new Date() },
  { thread_id: 15, kind: 'wallet', title: 'w', created_at: new Date() },
]
const tabsDb = (rows: any[]) => ({
  query: async (sql: string) =>
    /^\s*SELECT/.test(sql) ? { rows } : { rows: [] },
})
let n = 0
const ctxIn = (over: any = {}): any => {
  const from = over.from ?? { id: 5, first_name: 'Anna', language_code: 'en' }
  return {
    replies: [] as string[],
    chat: { id: ROOM, type: 'supergroup', ...(over.chat ?? {}) },
    botInfo:
      over.botInfo === null
        ? undefined
        : { username: `edge_bot_${n++}`, id: 42 },
    from,
    message: {
      text: over.text ?? 'x',
      from,
      message_thread_id: over.thread ?? 15,
    },
    telegram: over.telegram ?? {
      getChatMember: async () => ({ status: 'member' }),
    },
    reply:
      over.reply ??
      async function (this: any, t: string) {
        this.replies.push(t)
      },
  }
}
const failingReply = async () => {
  throw new Error('telegram down')
}

describe('office.ts edges', () => {
  beforeEach(() => setTopicTabsDbForTests(tabsDb(office) as any))

  it('an empty line names no member', () => {
    expect(memberNamedFirst('')).toBe(6)
    expect(memberNamedFirst('   ')).toBe(6)
    expect(memberNamedFirst(null)).toBe(6)
  })

  it('no bot name, a private chat or an unreadable tab table: no office', async () => {
    expect(await officeChannelKind(ctxIn({ botInfo: null }))).toBeUndefined()
    expect(await namedInOffice(ctxIn({ chat: { type: 'private' } }))).toBe(
      false
    )
    setTopicTabsDbForTests({
      query: async () => {
        throw new Error('db down')
      },
    } as any)
    expect(await officeChannelKind(ctxIn())).toBeUndefined()
  })

  it('a reply Telegram refuses never throws out of catch-up or hand-off', async () => {
    const notOffice = ctxIn({ chat: { type: 'private' }, reply: failingReply })
    expect(await catchUp(notOffice, vi.fn() as any)).toBe('not an office')
    const failed = ctxIn({ reply: failingReply })
    expect(
      await catchUp(failed, async () => {
        throw new Error('render down')
      })
    ).toBe('failed')
    // in the Agent's channel, so the Treasurer is a colleague, not itself
    const handoff = ctxIn({ reply: failingReply, thread: 11 })
    expect(
      await handOffInOffice(handoff, 'x', 'Treasurer, count.', async () => {
        throw new Error('render down')
      })
    ).toBe('failed')
  })

  describe('the commands', () => {
    const handlers = () => {
      const h: Record<string, any> = {}
      registerOfficeCommand({
        command: (name: string, f: any) => (h[name] = f),
      } as any)
      return h
    }

    it('/catchup asks the agent client of the bot, then lists the open tasks', async () => {
      setOfficeTasksDbForTests({
        query: async (sql: string) =>
          /^\s*SELECT/.test(sql)
            ? {
                rows: [{ id: 4, owner_name: 'Vera', text: 'send the invoice' }],
              }
            : { rows: [] },
      })
      const ctx = ctxIn({ text: '/catchup' })
      await handlers().catchup(ctx)
      setOfficeTasksDbForTests(null)
      expect(ctx.replies).toEqual([
        'Decided: ship Friday.',
        'Open tasks:\n#4 Vera: send the invoice',
      ])
    })

    it('/office in a private chat says where an office opens', async () => {
      const ctx = ctxIn({ text: '/office', chat: { type: 'private', id: 5 } })
      await handlers().office(ctx)
      expect(ctx.replies[0]).toMatch(/group with topics/)
    })

    it('/office when Telegram will not say who is who: refused, never thrown', async () => {
      const ctx = ctxIn({
        text: '/office',
        chat: { is_forum: true },
        telegram: {
          getChatMember: async () => {
            throw new Error('403')
          },
        },
      })
      await handlers().office(ctx)
      expect(ctx.replies[0]).toMatch(/cannot open yet/)
    })
  })
})

describe('officeTasks.ts edges', () => {
  const saved = { ...process.env }
  afterEach(() => {
    process.env = { ...saved }
    setOfficeTasksDbForTests(null)
  })
  beforeEach(() => setTopicTabsDbForTests(tabsDb(office) as any))

  it('without a database the list is unavailable, said, and nothing is stored', async () => {
    delete process.env.TOKENS_DATABASE_URL
    delete process.env.RENDER_DATABASE_URL
    setOfficeTasksDbForTests(null)
    const add = ctxIn({ text: '/todo x' })
    expect(await addTask(add)).toBe('refused')
    expect(add.replies[0]).toBe('The task list is not available just now.')
    expect(await listTasks(ctxIn({ text: '/todos' }))).toBe(0)
    const done = ctxIn({ text: '/done 1' })
    expect(await closeTask(done)).toBe('missing')
  })

  it('with a database URL one pool is made, its errors logged, and reused', async () => {
    process.env.TOKENS_DATABASE_URL = 'postgres://u:p@h/db'
    setOfficeTasksDbForTests(null)
    pools.length = 0
    await listTasks(ctxIn({ text: '/todos' }))
    await listTasks(ctxIn({ text: '/todos' }))
    expect(pools).toHaveLength(1)
    expect(pools[0].opts.connectionString).toBe('postgres://u:p@h/db')
    expect(() => pools[0].handlers.error(new Error('boom'))).not.toThrow()
  })

  it('a wrong task number, a refused reply, a member check Telegram refuses', async () => {
    const rows: any[] = [
      { id: 1, owner_id: 9, owner_name: 'Vera', author_id: 9, done: false },
    ]
    setOfficeTasksDbForTests({
      query: async (sql: string) =>
        /^\s*SELECT/.test(sql)
          ? { rows: rows.map(r => ({ ...r })) }
          : { rows: [] },
    })
    const bad = ctxIn({ text: '/done abc' })
    expect(await closeTask(bad)).toBe('missing')
    expect(bad.replies[0]).toBe('The task number: /done 12')

    const stranger = ctxIn({
      text: '/done 1',
      telegram: {
        getChatMember: async () => {
          throw new Error('403')
        },
      },
    })
    expect(await closeTask(stranger)).toBe('refused')

    setTopicTabsDbForTests(tabsDb([]) as any)
    expect(await addTask(ctxIn({ text: '/todo x', reply: failingReply }))).toBe(
      'refused'
    )
  })

  it('a command that fails and whose apology Telegram refuses still never throws', async () => {
    const h: Record<string, any> = {}
    registerOfficeTasks({
      command: (name: string, f: any) => (h[name] = f),
    } as any)
    setOfficeTasksDbForTests({
      query: async () => {
        throw new Error('db down')
      },
    })
    await expect(
      h.todos(ctxIn({ text: '/todos', reply: failingReply }))
    ).resolves.toBeUndefined()
  })
})

describe('the office speaks Russian too, and survives a throw that is no Error', () => {
  const ru = { id: 5, first_name: 'Аня', language_code: 'ru' } // cyrillic-ok: a person's name under test
  beforeEach(() => setTopicTabsDbForTests(tabsDb(office) as any))

  it('catch-up, hand-off and the tasks answer in Russian', async () => {
    const notOffice = ctxIn({ from: ru, chat: { type: 'private' } })
    await catchUp(notOffice, vi.fn() as any)
    expect(notOffice.replies[0]).toMatch(/нейроофисе/) // cyrillic-ok: Russian copy under test

    const failed = ctxIn({ from: ru })
    await catchUp(failed, async () => {
      throw 'render down'
    })
    expect(failed.replies[0]).toMatch(/catchup/)

    const handoff = ctxIn({ from: ru, thread: 11 })
    await handOffInOffice(handoff, 'x', 'Казначей, посчитай.', async () => {
      // cyrillic-ok: a person's words under test
      throw 'render down'
    })
    expect(handoff.replies[0]).toMatch(/Казначей сейчас не ответил/) // cyrillic-ok: Russian copy under test

    setOfficeTasksDbForTests(null)
    delete process.env.TOKENS_DATABASE_URL
    delete process.env.RENDER_DATABASE_URL
    const add = ctxIn({ from: ru, text: '/todo макет' }) // cyrillic-ok: a person's words under test
    await addTask(add)
    expect(add.replies[0]).toMatch(/недоступен/) // cyrillic-ok: Russian copy under test
  })

  it('/office in Russian: where it opens, what is missing, and the open office', async () => {
    const h: Record<string, any> = {}
    registerOfficeCommand({
      command: (name: string, f: any) => (h[name] = f),
    } as any)
    const priv = ctxIn({
      from: ru,
      text: '/office',
      chat: { type: 'private', id: 5 },
    })
    await h.office(priv)
    expect(priv.replies[0]).toMatch(/группу с темами/) // cyrillic-ok: Russian copy under test

    const refused = ctxIn({
      from: ru,
      text: '/office',
      chat: { is_forum: false },
      telegram: {
        getChatMember: async () => {
          throw 'forbidden'
        },
      },
    })
    await h.office(refused)
    expect(refused.replies[0]).toMatch(/пока не открыть/) // cyrillic-ok: Russian copy under test

    const opened = ctxIn({
      from: ru,
      text: '/office',
      chat: { is_forum: true },
      telegram: {
        getChatMember: async () => ({ status: 'creator' }),
        callApi: async (method: string) =>
          method === 'createForumTopic' ? { message_thread_id: 500 } : true,
      },
    })
    await h.office(opened)
    expect(opened.replies.at(-1)).toMatch(/Нейроофис открыт/) // cyrillic-ok: Russian copy under test
  })

  it('a task command that fails with no Error object is said, not thrown', async () => {
    const h: Record<string, any> = {}
    registerOfficeTasks({
      command: (name: string, f: any) => (h[name] = f),
    } as any)
    setOfficeTasksDbForTests({
      query: async () => {
        throw 'db down'
      },
    })
    const ctx = ctxIn({ from: ru, text: '/todos' })
    await h.todos(ctx)
    expect(ctx.replies.at(-1)).toMatch(/Не вышло/) // cyrillic-ok: Russian copy under test
  })
})
