import { describe, it, expect, beforeEach } from 'vitest'
import {
  rememberMessages,
  leadContext,
  leadCandidates,
  intentSignals,
  forgetMemoryTableForTests,
} from './src/agent/chat-memory'

/**
 * The correspondence memory: what is kept, what is skipped, and how "who
 * next" is decided -- as rules the owner can read, not a model's mood.
 */
const OWNER = '144022504'
const D = (iso: string) => new Date(iso)

function fakePool(
  answers: Array<{
    when: RegExp
    rows: unknown[] | ((params: unknown[]) => unknown[])
  }> = []
) {
  const queries: Array<{ sql: string; params: unknown[] }> = []
  return {
    queries,
    query: async (sql: string, params: unknown[] = []) => {
      const flat = sql.replace(/\s+/g, ' ').trim()
      queries.push({ sql: flat, params })
      for (const a of answers)
        if (a.when.test(flat))
          return {
            rows: typeof a.rows === 'function' ? a.rows(params) : a.rows,
          }
      return { rows: [] }
    },
  }
}
beforeEach(() => forgetMemoryTableForTests())

describe('what is kept', () => {
  it('writes every non-empty message once, idempotently, and reports only the new ones', async () => {
    const pool = fakePool([
      { when: /^INSERT INTO crm_messages/, rows: p => [{ msg_id: p[2] }] },
    ])
    const n = await rememberMessages(pool, OWNER, '555', [
      { msgId: 1, at: D('2026-09-01T10:00:00Z'), out: false, text: 'привет' },
      { msgId: 2, at: D('2026-09-01T10:01:00Z'), out: true, text: '' },
      {
        msgId: 3,
        at: D('2026-09-01T10:02:00Z'),
        out: true,
        text: 'здравствуйте',
      },
    ])
    expect(n).toBe(1)
    const ins = pool.queries.find(q =>
      q.sql.startsWith('INSERT INTO crm_messages')
    )!
    expect(ins.sql).toContain(
      'ON CONFLICT (owner_id, lead_id, msg_id) DO NOTHING'
    )
    expect(ins.sql).toContain('RETURNING msg_id')
    // two rows of six params: the empty one never reached the database
    expect(ins.params.length).toBe(12)
    expect(ins.params.slice(0, 3)).toEqual([OWNER, '555', 1])
  })

  it('cuts a text to the cap and creates the table once', async () => {
    const pool = fakePool()
    await rememberMessages(pool, OWNER, '555', [
      {
        msgId: 1,
        at: D('2026-09-01T00:00:00Z'),
        out: false,
        text: 'я'.repeat(9000),
      },
    ])
    await rememberMessages(pool, OWNER, '555', [
      { msgId: 2, at: D('2026-09-01T00:00:00Z'), out: false, text: 'x' },
    ])
    const ins = pool.queries.filter(q =>
      q.sql.startsWith('INSERT INTO crm_messages')
    )
    expect(String(ins[0].params[5]).length).toBe(4000)
    expect(
      pool.queries.filter(q => q.sql.startsWith('CREATE TABLE')).length
    ).toBe(1)
  })

  it('nothing to write touches nothing', async () => {
    const pool = fakePool()
    expect(
      await rememberMessages(pool, OWNER, '555', [
        { msgId: 1, at: D('2026-09-01T00:00:00Z'), out: false, text: '   ' },
      ])
    ).toBe(0)
    expect(pool.queries).toEqual([])
  })
})

describe('what the words say', () => {
  it('price and buying intent score high, an objection scores negative, each group once', () => {
    expect(
      intentSignals(['сколько стоит рилс?', 'хочу заказать', 'и ещё хочу'])
        .score
    ).toBe(3 + 3 + 2)
    expect(intentSignals(['дорого, подумаю'])).toEqual({
      score: -2,
      signals: ['objection'],
    })
    expect(intentSignals([])).toEqual({ score: 0, signals: [] })
    expect(intentSignals(['HOW MUCH is a video?']).signals).toEqual([
      'price',
      'service',
    ])
  })
})

describe('a word is a word, not a prefix of another', () => {
  it('the commonest conjunction is not an objection, a centre is not a price, bathing is not buying', () => {
    expect(
      intentSignals(['потому что мне понравился ваш рилс']).signals
    ).toEqual(['service'])
    expect(intentSignals(['мы в центре города']).signals).toEqual([])
    expect(intentSignals(['вчера купались']).signals).toEqual([])
    expect(intentSignals(['какая цена?']).signals).toEqual(['price'])
    expect(intentSignals(['хочу купить видео']).signals).toEqual([
      'buy',
      'service',
    ])
    expect(intentSignals(['подумаю, потом']).signals).toEqual(['objection'])
  })
})

describe('what is new', () => {
  it('rememberMessagesFresh hands back only the rows the database took', async () => {
    const { rememberMessagesFresh } = await import('./src/agent/chat-memory')
    const pool = fakePool([
      { when: /^INSERT INTO crm_messages/, rows: () => [{ msg_id: 2 }] },
    ])
    const fresh = await rememberMessagesFresh(pool, OWNER, '555', [
      { msgId: 1, at: D('2026-09-01T10:00:00Z'), out: false, text: 'a' },
      { msgId: 2, at: D('2026-09-01T10:01:00Z'), out: false, text: 'b' },
    ])
    expect(fresh.map(m => m.msgId)).toEqual([2])
  })
})

describe('the story of one person', () => {
  const rows = [
    { msg_id: 3, at: '2026-09-07T10:00:00Z', out: false, text: 'а цена?' },
    {
      msg_id: 2,
      at: '2026-09-06T10:00:00Z',
      out: true,
      text: 'могу сделать рилс',
    },
    { msg_id: 1, at: '2026-09-05T10:00:00Z', out: false, text: 'привет' },
  ]
  it('comes newest last, knows they are waiting, and reads their words only', async () => {
    const pool = fakePool([
      { when: /^SELECT msg_id, at/, rows },
      {
        when: /count\(\*\)::int AS total/,
        rows: [
          {
            total: 3,
            inbound: 2,
            last_in: '2026-09-07T10:00:00Z',
            last_out: '2026-09-06T10:00:00Z',
          },
        ],
      },
    ])
    const s = await leadContext(pool, OWNER, '555')
    expect(s.messages.map(m => m.msgId)).toEqual([1, 2, 3])
    expect(s.unanswered).toBe(true)
    expect(s.signals).toEqual(['price'])
    expect(s.total).toBe(3)
  })
  it('an answered person is not waiting', async () => {
    const pool = fakePool([
      { when: /^SELECT msg_id, at/, rows: [] },
      {
        when: /count\(\*\)::int AS total/,
        rows: [
          {
            total: 2,
            inbound: 1,
            last_in: '2026-09-05T10:00:00Z',
            last_out: '2026-09-06T10:00:00Z',
          },
        ],
      },
    ])
    expect((await leadContext(pool, OWNER, '555')).unanswered).toBe(false)
  })
})

describe('who next', () => {
  const now = D('2026-09-08T12:00:00Z')
  const agg = [
    {
      lead_id: 'waiting',
      total: 4,
      inbound: 3,
      last_in: '2026-09-08T09:00:00Z',
      last_out: '2026-09-07T09:00:00Z',
    },
    {
      lead_id: 'answered',
      total: 6,
      inbound: 5,
      last_in: '2026-09-06T09:00:00Z',
      last_out: '2026-09-07T09:00:00Z',
    },
    {
      lead_id: 'old',
      total: 2,
      inbound: 1,
      last_in: '2026-05-01T09:00:00Z',
      last_out: '2026-05-02T09:00:00Z',
    },
    {
      lead_id: 'refuser',
      total: 4,
      inbound: 3,
      last_in: '2026-09-07T08:00:00Z',
      last_out: '2026-09-07T09:00:00Z',
    },
  ]
  const recent = [
    { lead_id: 'waiting', text: 'сколько стоит фото?' },
    { lead_id: 'answered', text: 'хочу видео' },
    { lead_id: 'refuser', text: 'сколько стоит' },
  ]
  const pool = () =>
    fakePool([
      { when: /GROUP BY lead_id/, rows: agg },
      { when: /^SELECT lead_id, text FROM crm_messages/, rows: recent },
    ])

  it('an unanswered price question comes first; a fresh refusal sinks below zero and waits', async () => {
    const touched = new Map([
      ['refuser', { kind: 'refused', at: '2026-09-05T00:00:00Z' }],
    ])
    const list = await leadCandidates(pool(), OWNER, { touched, now })
    expect(list[0].lead).toBe('waiting')
    expect(list[0].next).toBe('reply')
    expect(list[0].because).toContain('ждёт ответа')
    const r = list.find(l => l.lead === 'refuser')!
    expect(r.score).toBeLessThan(0)
    expect(r.next).toBe('wait')
    expect(r.because).toContain('отказался')
  })

  it('a service wish with a price question is a delivery; a buyer is invited again', async () => {
    const touched = new Map([
      ['answered', { kind: 'bought', at: '2026-08-01T00:00:00Z' }],
    ])
    const list = await leadCandidates(pool(), OWNER, { touched, now })
    const a = list.find(l => l.lead === 'answered')!
    expect(a.because).toContain('допродажа')
    expect(a.signals).toEqual(expect.arrayContaining(['buy', 'service']))
    expect(a.next).toBe('deliver')
    const w = list.find(l => l.lead === 'waiting')!
    expect(w.signals).toEqual(expect.arrayContaining(['price', 'service']))
  })

  it('a refuser who writes AGAIN is answered: their word is the last one', async () => {
    const again = fakePool([
      {
        when: /GROUP BY lead_id/,
        rows: [
          {
            lead_id: 'refuser',
            total: 5,
            inbound: 4,
            last_in: '2026-09-08T08:00:00Z',
            last_out: '2026-09-07T09:00:00Z',
          },
        ],
      },
      {
        when: /^SELECT lead_id, text FROM crm_messages/,
        rows: [{ lead_id: 'refuser', text: 'а всё-таки сколько?' }],
      },
    ])
    const touched = new Map([
      ['refuser', { kind: 'refused', at: '2026-09-05T00:00:00Z' }],
    ])
    const [r] = await leadCandidates(again, OWNER, { touched, now })
    expect(r.next).toBe('reply')
  })

  it('quiet people are last, and the limit holds', async () => {
    const list = await leadCandidates(pool(), OWNER, { now, limit: 2 })
    expect(list.length).toBe(2)
    expect(list.map(l => l.lead)).not.toContain('old')
  })
})
