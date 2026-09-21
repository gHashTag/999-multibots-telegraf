/**
 * THE SAME TURN TWICE IN A ROW IS NEVER A SECOND TURN.
 *
 * In a live client's transcript, 20.09.2026, one word of
 * hers stands twice -- 17:07:45 and 17:11:10 -- with nothing in between.
 * She typed it once. The bot retries a turn the render dropped, and a retry
 * resends the same messages array, so the arrival write stored her question
 * again. Every retry that day cost the conversation one turn of the window
 * that is the whole of what the agent remembers.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  записатьРеплику as record, // cyrillic-ok: pre-existing export
  забытьТаблицу as forgetTable, // cyrillic-ok: pre-existing export
} from './conversation'

const WHO = '900000012'

/** Just enough Postgres: an ordered table and the two queries this uses. */
function fakePool() {
  const rows: Array<{ id: number; role: string; content: string }> = []
  return {
    rows,
    async query(sql: string, params: unknown[] = []) {
      if (/^\s*(CREATE|ALTER)/i.test(sql)) return { rows: [] }
      if (/^\s*SELECT/i.test(sql)) {
        const last = rows[rows.length - 1]
        return { rows: last ? [last] : [] }
      }
      rows.push({
        id: rows.length + 1,
        role: String(params[1]),
        content: String(params[2]),
      })
      return { rows: [] }
    },
  }
}

beforeEach(() => forgetTable())

const ask = (pool: unknown, role: string, content: string) =>
  record(pool as never, WHO, { role, content } as never)

describe('a question the render was handed twice', () => {
  it('is stored once, and says so', async () => {
    const pool = fakePool()
    expect(await ask(pool, 'user', 'Давай')).toBe(true)
    expect(await ask(pool, 'user', 'Давай')).toBe(false)
    expect(pool.rows).toHaveLength(1)
  })

  it('is stored again once it has been answered in between', async () => {
    const pool = fakePool()
    await ask(pool, 'user', 'Давай')
    await ask(pool, 'assistant', 'Запускаю.')
    // She really did say it twice: the answer stands between the two, so both
    // lines are hers and both belong in the transcript.
    expect(await ask(pool, 'user', 'Давай')).toBe(true)
    expect(pool.rows.map(r => r.role)).toEqual(['user', 'assistant', 'user'])
  })

  it('does not confuse her word with the same word from the agent', async () => {
    const pool = fakePool()
    await ask(pool, 'user', 'Давай')
    expect(await ask(pool, 'assistant', 'Давай')).toBe(true)
    expect(pool.rows).toHaveLength(2)
  })

  it('leaves two different questions alone', async () => {
    const pool = fakePool()
    await ask(pool, 'user', 'Давай')
    await ask(pool, 'user', 'Фото')
    expect(pool.rows).toHaveLength(2)
  })
})

describe('the pair the fallback sends after a failed turn', () => {
  it('adds only the answer when the question is already the newest row', async () => {
    const pool = fakePool()
    // The render stored her question on arrival, then failed with no answer.
    await ask(pool, 'user', 'Давай')

    // The bot sends both turns and lets this rule settle which are new.
    await ask(pool, 'user', 'Давай')
    await ask(pool, 'assistant', 'Запускаю, Вера.')

    expect(pool.rows.map(r => [r.role, r.content])).toEqual([
      ['user', 'Давай'],
      ['assistant', 'Запускаю, Вера.'],
    ])
  })

  it('adds both when the turn never reached the render at all', async () => {
    const pool = fakePool()
    await ask(pool, 'assistant', 'Вот план на месяц.')

    await ask(pool, 'user', 'Давай')
    await ask(pool, 'assistant', 'Запускаю, Вера.')

    expect(pool.rows).toHaveLength(3)
  })
})
