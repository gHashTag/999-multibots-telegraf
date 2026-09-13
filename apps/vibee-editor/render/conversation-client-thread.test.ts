/**
 * A CLIENT THREAD NEVER MIXES WITH THE OWNER'S OWN THREAD.
 * Spec: t27 specs/automation/crm-client-workspace.t27
 *
 * The owner's complaint: every client landed in one conversation. The fix is
 * a `thread` key on agent_messages -- 'self' for the pre-existing personal
 * thread, 'client:<id>' for the owner's thread about one client. The fake pool
 * records the SQL and obeys the WHERE it is given, so dropping the thread
 * predicate from any query turns red here rather than in production.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  записатьРеплику as writeTurn, // cyrillic-ok: pre-existing identifier
  прочитатьРазговор as readThread, // cyrillic-ok: pre-existing identifier
  очиститьРазговор as clearThread, // cyrillic-ok: pre-existing identifier
  удалитьРеплику as deleteTurn, // cyrillic-ok: pre-existing identifier
  забытьТаблицу as forgetTable, // cyrillic-ok: pre-existing identifier
  clientThread,
  SELF_THREAD,
  type Пул as Pool, // cyrillic-ok: pre-existing identifier
} from './src/agent/conversation'

const OWNER = '144022504'
const CLIENT = '435572800'

function recordingPool() {
  const rows: any[] = []
  const sql: string[] = []
  let n = 0
  const pool: Pool = {
    async query(q: string, params: unknown[] = []) {
      const text = q.replace(/\s+/g, ' ').trim()
      sql.push(text)
      if (/^(CREATE|ALTER)/i.test(text)) return { rows: [] }
      if (/^INSERT INTO agent_messages/i.test(text)) {
        rows.push({
          id: ++n,
          telegram_id: params[0],
          role: params[1],
          content: params[2],
          surface: params[3],
          thread: params[4],
          created_at: 'x',
        })
        return { rows: [] }
      }
      if (/^SELECT/i.test(text)) {
        if (!/AND thread = \$3/.test(text))
          throw new Error('SELECT without thread: ' + text)
        const mine = rows.filter(
          r => r.telegram_id === params[0] && r.thread === params[2]
        )
        return {
          rows: mine.sort((a, b) => b.id - a.id).slice(0, Number(params[1])),
        }
      }
      if (/^DELETE FROM agent_messages/i.test(text)) {
        const before = rows.length
        let keep: any[] | null = null
        if (/WHERE id = \$1 AND telegram_id = \$2 AND thread = \$3$/.test(text))
          keep = rows.filter(
            r =>
              !(
                r.id === params[0] &&
                r.telegram_id === params[1] &&
                r.thread === params[2]
              )
          )
        else if (/WHERE telegram_id = \$1 AND thread = \$2$/.test(text))
          keep = rows.filter(
            r => !(r.telegram_id === params[0] && r.thread === params[1])
          )
        if (keep === null) throw new Error('DELETE without thread: ' + text)
        rows.length = 0
        rows.push(...keep)
        return { rows: [], rowCount: before - rows.length } as any
      }
      throw new Error('unknown sql: ' + text)
    },
  }
  return { pool, rows, sql }
}

beforeEach(() => forgetTable())

describe('the client thread', () => {
  it('adds the thread column by ALTER and indexes (telegram_id, thread, id)', async () => {
    const { pool, sql } = recordingPool()
    await writeTurn(pool, OWNER, {
      role: 'user',
      content: 'hi',
      surface: 'miniapp',
    })
    expect(
      sql.some(s =>
        /ALTER TABLE agent_messages ADD COLUMN IF NOT EXISTS thread text NOT NULL DEFAULT 'self'/.test(
          s
        )
      )
    ).toBe(true)
    expect(
      sql.some(s =>
        /agent_messages_owner_thread_time ON agent_messages \(telegram_id, thread, id\)/.test(
          s
        )
      )
    ).toBe(true)
  })

  it('defaults to self, so every existing caller is unchanged', async () => {
    const { pool, rows } = recordingPool()
    await writeTurn(pool, OWNER, {
      role: 'user',
      content: 'mine',
      surface: 'bot',
    })
    expect(rows[0].thread).toBe(SELF_THREAD)
    const back = await readThread(pool, OWNER)
    expect(back.map(m => m.content)).toEqual(['mine'])
    expect(back[0].thread).toBe('self')
  })

  it('never mixes a client thread with the self thread', async () => {
    const { pool } = recordingPool()
    const t = clientThread(CLIENT)
    await writeTurn(pool, OWNER, {
      role: 'user',
      content: 'about me',
      surface: 'miniapp',
    })
    await writeTurn(
      pool,
      OWNER,
      { role: 'user', content: 'about her', surface: 'miniapp' },
      t
    )
    await writeTurn(
      pool,
      OWNER,
      { role: 'assistant', content: 'her profile', surface: 'miniapp' },
      t
    )
    const self = await readThread(pool, OWNER)
    const client = await readThread(pool, OWNER, 100, t)
    expect(self.map(m => m.content)).toEqual(['about me'])
    expect(client.map(m => m.content)).toEqual(['about her', 'her profile'])
    expect(client.every(m => m.thread === 'client:' + CLIENT)).toBe(true)
  })

  it('clearing a client thread leaves the self thread intact, and the other way round', async () => {
    const { pool } = recordingPool()
    const t = clientThread(CLIENT)
    await writeTurn(pool, OWNER, {
      role: 'user',
      content: 'about me',
      surface: 'miniapp',
    })
    await writeTurn(
      pool,
      OWNER,
      { role: 'user', content: 'about her', surface: 'miniapp' },
      t
    )
    expect(await clearThread(pool, OWNER, t)).toBe(1)
    expect((await readThread(pool, OWNER)).map(m => m.content)).toEqual([
      'about me',
    ])
    expect(await readThread(pool, OWNER, 100, t)).toEqual([])
    await writeTurn(
      pool,
      OWNER,
      { role: 'user', content: 'about her again', surface: 'miniapp' },
      t
    )
    expect(await clearThread(pool, OWNER)).toBe(1)
    expect((await readThread(pool, OWNER, 100, t)).map(m => m.content)).toEqual(
      ['about her again']
    )
  })

  it('deleting one turn by id is scoped to its thread', async () => {
    const { pool } = recordingPool()
    const t = clientThread(CLIENT)
    await writeTurn(pool, OWNER, {
      role: 'user',
      content: 'about me',
      surface: 'miniapp',
    })
    const [mine] = await readThread(pool, OWNER)
    // The self turn's id, asked through the client thread: nothing happens.
    expect(await deleteTurn(pool, OWNER, mine.id!, t)).toBe(0)
    expect(await deleteTurn(pool, OWNER, mine.id!)).toBe(1)
  })
})
