/**
 * SEVERAL CONVERSATIONS WITH ONE AGENT (owner, 2026-09-26: "so I can keep
 * several chats going").
 *
 * A conversation is the base thread plus `~<id>`. What must hold:
 *   - no id, no change: the bot and every existing caller keep their thread;
 *   - an id opens nothing its base thread did not (threadFor decides first);
 *   - a client's thread and a room are one conversation, never split;
 *   - turns in one conversation are never read from another;
 *   - the list names each conversation by the person's title, else by the
 *     first thing they asked there.
 *
 * The list's SQL is checked against a real Postgres when CONVERSATIONS_PG_URL
 * is set (a fake would only agree with itself about array_agg ... FILTER).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  CONVERSATION_RE,
  SELF_THREAD,
  conversationThread,
  forgetConversationTitle,
  forgetTitlesTableForTests,
  listConversations,
  marketplaceAgentThread,
  renameConversation,
  splittable,
  записатьРеплику as writeTurn, // cyrillic-ok: pre-existing identifier
  прочитатьРазговор as readThread, // cyrillic-ok: pre-existing identifier
  очиститьРазговор as clearThread, // cyrillic-ok: pre-existing identifier
  забытьТаблицу as forgetTable, // cyrillic-ok: pre-existing identifier
  type Пул as Pool, // cyrillic-ok: pre-existing identifier
} from './src/agent/conversation'
import { withConversation, type ThreadGate } from './src/agent/routes'

const self: ThreadGate = { ok: true, thread: SELF_THREAD, client: null }
const rtl: ThreadGate = {
  ok: true,
  thread: marketplaceAgentThread('rtl'),
  client: null,
  agent: 'rtl',
}

describe('which conversation a request names', () => {
  it('no id: the gate is untouched, so every existing caller keeps its thread', () => {
    expect(withConversation(self, undefined)).toBe(self)
    expect(withConversation(self, '')).toBe(self)
    expect(withConversation(rtl, null)).toBe(rtl)
  })

  it('an id splits the own thread and a specialist thread', () => {
    expect(withConversation(self, 'k3x9')).toMatchObject({
      ok: true,
      thread: 'self~k3x9',
      conversation: 'k3x9',
    })
    expect(withConversation(rtl, 'a1b2c3')).toMatchObject({
      ok: true,
      thread: 'agent:rtl~a1b2c3',
      agent: 'rtl',
    })
  })

  it('a malformed id is 400, never a thread name', () => {
    for (const bad of [
      'ab',
      'A1B2',
      'x~y1',
      '../self',
      'a'.repeat(25),
      'ab cd',
    ])
      expect(withConversation(self, bad)).toMatchObject({
        ok: false,
        status: 400,
      })
    expect(CONVERSATION_RE.test('k3x9')).toBe(true)
  })

  it('a client thread, a room and the Queen are one conversation each', () => {
    const client: ThreadGate = {
      ok: true,
      thread: 'client:435572800',
      client: '435572800',
    }
    const room: ThreadGate = {
      ok: true,
      thread: 'room:-1001234567',
      client: null,
      room: '-1001234567',
    }
    expect(withConversation(client, 'k3x9')).toMatchObject({ status: 400 })
    expect(withConversation(room, 'k3x9')).toMatchObject({ status: 400 })
    expect(splittable('client:435572800:queen')).toBe(false)
    expect(splittable('self~k3x9')).toBe(false)
  })

  it('a refused gate stays refused whatever id comes with it', () => {
    const refused: ThreadGate = {
      ok: false,
      status: 403,
      error: 'not a seller',
    }
    expect(withConversation(refused, 'k3x9')).toBe(refused)
  })
})

describe('conversations keep their own turns', () => {
  it('a turn in one conversation is never read from another or the base', async () => {
    const rows: any[] = []
    let n = 0
    const pool: Pool = {
      async query(q: string, params: unknown[] = []) {
        const text = q.replace(/\s+/g, ' ').trim()
        if (/^(CREATE|ALTER)/i.test(text)) return { rows: [] }
        if (/^INSERT INTO agent_messages/i.test(text)) {
          rows.push({
            id: ++n,
            telegram_id: params[0],
            role: params[1],
            content: params[2],
            surface: params[3],
            thread: params[4],
          })
          return { rows: [] }
        }
        if (/^SELECT/i.test(text)) {
          const probe = /LIMIT 1$/.test(text)
          const wanted = probe ? params[1] : params[2]
          return {
            rows: rows
              .filter(r => r.telegram_id === params[0] && r.thread === wanted)
              .sort((a, b) => b.id - a.id)
              .slice(0, probe ? 1 : Number(params[1])),
          }
        }
        if (/^DELETE/i.test(text)) {
          const keep = rows.filter(
            r => !(r.telegram_id === params[0] && r.thread === params[1])
          )
          const gone = rows.length - keep.length
          rows.length = 0
          rows.push(...keep)
          return { rows: [], rowCount: gone } as any
        }
        return { rows: [] }
      },
    }
    forgetTable()
    const a = conversationThread(SELF_THREAD, 'aaaa')
    await writeTurn(pool, '1', { role: 'user', content: 'base', surface: 'x' })
    await writeTurn(
      pool,
      '1',
      { role: 'user', content: 'in a', surface: 'x' },
      a
    )
    expect((await readThread(pool, '1', 10)).map(t => t.content)).toEqual([
      'base',
    ])
    expect((await readThread(pool, '1', 10, a)).map(t => t.content)).toEqual([
      'in a',
    ])
    // Deleting conversation a leaves the base conversation alone.
    expect(await clearThread(pool, '1', a)).toBe(1)
    expect((await readThread(pool, '1', 10)).map(t => t.content)).toEqual([
      'base',
    ])
  })
})

const PG = process.env.CONVERSATIONS_PG_URL

describe.skipIf(!PG)('the list, against a real Postgres', () => {
  let pool: Pool & { end: () => Promise<void> }
  const who = `t${Date.now()}`

  beforeAll(async () => {
    const { Pool: PgPool } = await import('pg')
    pool = new PgPool({ connectionString: PG }) as never
    forgetTable()
    forgetTitlesTableForTests()
    const b = marketplaceAgentThread('rtl')
    const x = conversationThread(b, 'xxxx')
    const y = conversationThread(b, 'yyyy')
    await writeTurn(
      pool,
      who,
      { role: 'user', content: 'first', surface: 'm' },
      b
    )
    await writeTurn(
      pool,
      who,
      { role: 'assistant', content: 'ok', surface: 'm' },
      b
    )
    await writeTurn(
      pool,
      who,
      { role: 'user', content: 'lint my FIFO', surface: 'm' },
      x
    )
    await writeTurn(
      pool,
      who,
      { role: 'assistant', content: 'done: 0 warnings', surface: 'm' },
      x
    )
    await writeTurn(
      pool,
      who,
      { role: 'user', content: 'a UART', surface: 'm' },
      y
    )
    // Neither the own thread nor another specialist is in rtl's list.
    await writeTurn(pool, who, { role: 'user', content: 'mine', surface: 'm' })
    await writeTurn(
      pool,
      who,
      { role: 'user', content: 'fpga', surface: 'm' },
      marketplaceAgentThread('fpga')
    )
  })

  afterAll(async () => {
    await pool.query(`DELETE FROM agent_messages WHERE telegram_id = $1`, [who])
    await pool.query(
      `DELETE FROM agent_conversation_titles WHERE telegram_id = $1`,
      [who]
    )
    await pool.end()
  })

  it('most recent first, titled by the first question, base thread as null', async () => {
    const list = await listConversations(
      pool,
      who,
      marketplaceAgentThread('rtl')
    )
    expect(list.map(c => c.conversation)).toEqual(['yyyy', 'xxxx', null])
    expect(list[1]).toMatchObject({
      title: 'lint my FIFO',
      turns: 2,
      preview: 'done: 0 warnings',
    })
    expect(list[2].title).toBe('first')
  })

  it("the person's name wins; an empty name goes back to the first question; delete forgets it", async () => {
    const b = marketplaceAgentThread('rtl')
    const x = conversationThread(b, 'xxxx')
    await renameConversation(pool, who, x, '  FIFO   review ')
    let list = await listConversations(pool, who, b)
    expect(list.find(c => c.conversation === 'xxxx')?.title).toBe('FIFO review')
    await renameConversation(pool, who, x, '')
    list = await listConversations(pool, who, b)
    expect(list.find(c => c.conversation === 'xxxx')?.title).toBe(
      'lint my FIFO'
    )
    await renameConversation(pool, who, x, 'again')
    await forgetConversationTitle(pool, who, x)
    list = await listConversations(pool, who, b)
    expect(list.find(c => c.conversation === 'xxxx')?.title).toBe(
      'lint my FIFO'
    )
  })

  it('the own list holds only the own thread', async () => {
    const list = await listConversations(pool, who, SELF_THREAD)
    expect(list.map(c => c.title)).toEqual(['mine'])
  })

  it('a thread that cannot split has no list', async () => {
    expect(await listConversations(pool, who, 'client:435572800')).toEqual([])
  })
})
