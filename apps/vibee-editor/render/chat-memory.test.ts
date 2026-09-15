import { describe, it, expect, beforeEach } from 'vitest'
import {
  rememberMessages,
  rememberPerson,
  personOf,
  fullName,
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
    // Two tables, each created once per process: the messages and the people.
    expect(
      pool.queries.filter(q => q.sql.startsWith('CREATE TABLE')).length
    ).toBe(2)
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

/**
 * A REFUSAL IN WORDS MUST NOT READ AS AN INTENT TO BUY.
 *
 * The buy group matches stems for want / need / pay, and nothing looked at
 * what stood in front of them. Every phrase below was reproduced against the
 * shipped regex and came back as buy: "thanks, I do not need it" scored +3,
 * and "no, no video needed" came back as buy+service, which is the pair that
 * sets next='deliver'.
 *
 * What that costs: a person who refused in words goes to the top of the hot
 * queue with "send them an invoice" beside their name, and the brief tells the
 * model they asked about a price themselves -- so the rule about never
 * offering payment first does not save them.
 */
describe('a refusal is not a purchase', () => {
  const buys = (t: string) => intentSignals([t]).signals.includes('buy')

  it('does not read "no" as "yes"', () => {
    expect(buys('спасибо, мне не нужно')).toBe(false)
    expect(buys('не хочу, спасибо')).toBe(false)
    expect(buys('я не буду оплачивать')).toBe(false)
    expect(buys('нет, не нужно видео')).toBe(false)
  })

  it('and calls those an objection, which is what they are', () => {
    expect(intentSignals(['спасибо, мне не нужно']).signals).toContain(
      'objection'
    )
    expect(intentSignals(['не хочу, спасибо']).signals).toContain('objection')
  })

  it('a refusal about a video does not become a delivery either', () => {
    // buy + service is the pair that sets next='deliver' -- a card that draws
    // a portrait and charges the RECIPIENT's tokens when it is sent.
    expect(intentSignals(['нет, не нужно видео']).signals).not.toContain('buy')
  })

  it('still hears a real intent standing beside a refusal', () => {
    /*
     * Checked per occurrence, not per message. Cancelling the whole group on
     * any negation anywhere would be the same mistake pointing the other way:
     * the second stem here carries no denial and is a genuine ask.
     */
    expect(buys('не хочу ждать, давайте оплачу')).toBe(true)
  })

  it('leaves a plain intent alone', () => {
    expect(buys('хочу заказать')).toBe(true)
    expect(buys('готов оплатить сегодня')).toBe(true)
    expect(buys('I want to pay')).toBe(true)
  })

  it('does not disarm a price question phrased with "не"', () => {
    // A price question phrased with a "not" is still an ask, and `price` is
    // not a group a negation flips -- only `buy` is.
    expect(intentSignals(['не подскажете цену?']).signals).toContain('price')
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

  it('no intent in their words: a recent person gets TALK, not an offer; a fresh answer waits', async () => {
    /*
     * The score alone used to become an offer. The owner: the client must
     * want to buy by themselves -- so without a price or buy word there is
     * no invoice, only a continuation of the conversation, and not the
     * morning after the owner's own last word.
     */
    const rows = (lastOut: string) => [
      {
        lead_id: 'chatty',
        total: 12,
        inbound: 9,
        last_in: '2026-09-05T09:00:00Z',
        last_out: lastOut,
      },
    ]
    const words = [{ lead_id: 'chatty', text: 'как дела, что нового' }]
    const twoDaysAgo = fakePool([
      { when: /GROUP BY lead_id/, rows: rows('2026-09-06T09:00:00Z') },
      { when: /^SELECT lead_id, text FROM crm_messages/, rows: words },
    ])
    const [t] = await leadCandidates(twoDaysAgo, OWNER, { now })
    expect(t.signals).toEqual([])
    expect(t.next).toBe('talk')
    const yesterday = fakePool([
      { when: /GROUP BY lead_id/, rows: rows('2026-09-07T20:00:00Z') },
      { when: /^SELECT lead_id, text FROM crm_messages/, rows: words },
    ])
    const [y] = await leadCandidates(yesterday, OWNER, { now })
    expect(y.next).toBe('wait')
    const askedLater = fakePool([
      { when: /GROUP BY lead_id/, rows: rows('2026-09-06T09:00:00Z') },
      { when: /^SELECT lead_id, text FROM crm_messages/, rows: words },
    ])
    const [l] = await leadCandidates(askedLater, OWNER, {
      now,
      touched: new Map([
        ['chatty', { kind: 'later', at: '2026-09-06T10:00:00Z' }],
      ]),
    })
    expect(l.next).toBe('wait')
  })

  it('a high score without a price or buy word is NOT an offer: it is talk', async () => {
    const busy = fakePool([
      {
        when: /GROUP BY lead_id/,
        rows: [
          {
            lead_id: 'active',
            total: 20,
            inbound: 15,
            last_in: '2026-09-05T09:00:00Z',
            last_out: '2026-09-05T12:00:00Z',
          },
        ],
      },
      {
        when: /^SELECT lead_id, text FROM crm_messages/,
        rows: [{ lead_id: 'active', text: 'как дела, что нового' }],
      },
    ])
    // this week (+3), a live thread (+1), bought before (+2): six points and
    // not one word about price or buying -- a conversation, not an invoice.
    const [a] = await leadCandidates(busy, OWNER, {
      now,
      touched: new Map([
        ['active', { kind: 'bought', at: '2026-08-01T00:00:00Z' }],
      ]),
    })
    expect(a.score).toBeGreaterThanOrEqual(4)
    expect(a.signals).not.toContain('price')
    expect(a.next).toBe('talk')
  })

  it('quiet people are last, and the limit holds', async () => {
    const list = await leadCandidates(pool(), OWNER, { now, limit: 2 })
    expect(list.length).toBe(2)
    expect(list.map(l => l.lead)).not.toContain('old')
  })
})

describe('who they are', () => {
  it('a person is written once per id and replaced on the next ingest, cut to a name', async () => {
    const pool = fakePool()
    await rememberPerson(pool, OWNER, '555', {
      firstName: '  Ольга\n\nСсылка ' + 'x'.repeat(100),
      lastName: null,
      username: 'pilot_client',
    })
    const ins = pool.queries.find(q =>
      q.sql.startsWith('INSERT INTO crm_people')
    )!
    expect(ins.sql).toContain('ON CONFLICT (owner_id, lead_id) DO UPDATE')
    expect(ins.sql).toContain('first_name = EXCLUDED.first_name')
    expect(ins.params.slice(0, 2)).toEqual([OWNER, '555'])
    expect(String(ins.params[2])).not.toContain('\n')
    expect(String(ins.params[2]).length).toBeLessThanOrEqual(64)
    expect(ins.params[3]).toBeNull()
    expect(ins.params[4]).toBe('pilot_client')
  })

  it('personOf reads them back; fullName joins what is known', async () => {
    const pool = fakePool([
      {
        when: /FROM crm_people WHERE owner_id = \$1 AND lead_id = \$2/,
        rows: p =>
          p[1] === '555'
            ? [
                {
                  first_name: 'Ольга',
                  last_name: 'Иванова',
                  username: 'pilot_client',
                },
              ]
            : [],
      },
    ])
    const p = await personOf(pool, OWNER, '555')
    expect(p).toEqual({
      firstName: 'Ольга',
      lastName: 'Иванова',
      username: 'pilot_client',
      // Nobody has looked at this row's photo, and unknown is not "no".
      hasPhoto: null,
    })
    expect(fullName(p)).toBe('Ольга Иванова')
    expect(
      fullName({ firstName: 'Ольга', lastName: null, username: null })
    ).toBe('Ольга')
    expect(fullName(null)).toBeNull()
    expect(await personOf(pool, OWNER, '556')).toBeNull()
  })

  it('a candidate carries the name, the username and their last words', async () => {
    const pool = fakePool([
      {
        when: /GROUP BY lead_id/,
        rows: [
          {
            lead_id: '555',
            total: 3,
            inbound: 2,
            last_in: '2026-09-07T10:00:00Z',
            last_out: '2026-09-06T10:00:00Z',
          },
          {
            lead_id: '556',
            total: 1,
            inbound: 1,
            last_in: '2026-08-01T10:00:00Z',
            last_out: null,
          },
        ],
      },
      {
        when: /FROM crm_people WHERE owner_id = \$1$/,
        rows: [
          {
            lead_id: '555',
            first_name: 'Ольга',
            last_name: 'Иванова',
            username: 'pilot_client',
          },
        ],
      },
      {
        when: /SELECT DISTINCT ON \(lead_id\)/,
        rows: [
          { lead_id: '555', text: 'сколько стоит фото?' },
          { lead_id: '556', text: 'привет' },
        ],
      },
    ])
    const list = await leadCandidates(pool, OWNER, {
      now: D('2026-09-08T00:00:00Z'),
    })
    const olga = list.find(l => l.lead === '555')!
    expect(olga.name).toBe('Ольга Иванова')
    expect(olga.username).toBe('pilot_client')
    expect(olga.lastWords).toBe('сколько стоит фото?')
    const other = list.find(l => l.lead === '556')!
    expect(other.name).toBeNull()
    expect(other.username).toBeNull()
    expect(other.lastWords).toBe('привет')
  })
})

describe('a segment is chosen over the whole base', () => {
  const now = D('2026-09-08T00:00:00Z')
  it('segment=warm surfaces a quiet person that the limit alone would hide', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      lead_id: `w${i}`,
      total: 3,
      inbound: 2,
      last_in: '2026-09-07T09:00:00Z',
      last_out: '2026-09-06T09:00:00Z',
    }))
    rows.push({
      lead_id: 'warm1',
      total: 4,
      inbound: 2,
      last_in: '2026-08-15T09:00:00Z',
      last_out: '2026-08-16T09:00:00Z',
    })
    const pool = fakePool([
      { when: /GROUP BY lead_id/, rows },
      {
        when: /^SELECT lead_id, text FROM crm_messages/,
        rows: rows.map(r => ({ lead_id: r.lead_id, text: 'привет' })),
      },
    ])
    const top = await leadCandidates(pool, OWNER, { now, limit: 5 })
    expect(top.map(c => c.lead)).not.toContain('warm1')
    const warm = await leadCandidates(pool, OWNER, {
      now,
      limit: 5,
      segment: 'warm',
    })
    expect(warm.map(c => c.lead)).toEqual(['warm1'])
    expect(warm[0].segment).toBe('warm')
    expect(warm[0].daysSinceOut).toBeGreaterThanOrEqual(20)
    expect(top[0].segment).toBe('waiting')
  })
})

/**
 * A PORTRAIT NEEDS A FACE TO DRAW FROM.
 *
 * The owner, 2026-09-15: the seller proposed a photo to people with no
 * picture in Telegram. Refusing inside the tool was too late -- the plan had
 * already promised it -- so the promise is not made. The hard part is not
 * over-reaching: `service` also covers video and voice, and those people
 * must stay exactly where they were.
 */
describe('who has a face to draw', () => {
  const now = D('2026-09-08T12:00:00Z')
  const agg = (ids: string[]) =>
    ids.map(lead_id => ({
      lead_id,
      total: 4,
      inbound: 3,
      last_in: '2026-09-07T09:00:00Z',
      last_out: '2026-09-07T10:00:00Z',
    }))
  const base = (
    said: Record<string, string>,
    photos: Record<string, boolean | null>
  ) =>
    fakePool([
      { when: /GROUP BY lead_id/, rows: agg(Object.keys(said)) },
      {
        when: /^SELECT lead_id, text FROM crm_messages/,
        rows: Object.entries(said).map(([lead_id, text]) => ({
          lead_id,
          text,
        })),
      },
      {
        when: /FROM crm_people WHERE owner_id = \$1$/,
        rows: Object.entries(photos).map(([lead_id, has_photo]) => ({
          lead_id,
          first_name: 'Кто-то',
          has_photo,
        })),
      },
    ])

  it('a portrait ask with no avatar becomes an offer, and says why', async () => {
    const list = await leadCandidates(
      base(
        { '900000001': 'хочу нейрофото, сколько стоит?' },
        { '900000001': false }
      ),
      OWNER,
      { now }
    )
    expect(list[0].next).toBe('offer')
    expect(list[0].hasPhoto).toBe(false)
    expect(list[0].because).toContain('нет фото в Telegram')
  })

  it('the same ask WITH an avatar still goes to deliver', async () => {
    const list = await leadCandidates(
      base(
        { '900000002': 'хочу нейрофото, сколько стоит?' },
        { '900000002': true }
      ),
      OWNER,
      { now }
    )
    expect(list[0].next).toBe('deliver')
    expect(list[0].hasPhoto).toBe(true)
  })

  it('a voiceover ask is untouched by a missing avatar', async () => {
    // The whole reason the gate reads their words instead of the signal:
    // a voiceover needs no face, and this person must not be demoted.
    const list = await leadCandidates(
      base(
        { '900000003': 'сколько стоит озвучка ролика?' },
        { '900000003': false }
      ),
      OWNER,
      { now }
    )
    expect(list[0].next).toBe('deliver')
  })

  it('an unlooked-at person is not punished for what nobody checked', async () => {
    const list = await leadCandidates(
      base(
        { '900000004': 'хочу нейрофото, сколько стоит?' },
        { '900000004': null }
      ),
      OWNER,
      { now }
    )
    expect(list[0].hasPhoto).toBeNull()
    expect(list[0].next).toBe('deliver')
  })

  it('a caller who knows nothing about the photo does not erase what is known', async () => {
    const pool = fakePool()
    await rememberPerson(pool, OWNER, '900000005', { firstName: 'Кто-то' })
    const q = pool.queries.find(x =>
      x.sql.startsWith('INSERT INTO crm_people')
    )!
    expect(q.params[5], 'an unknown was written as a false').toBeNull()
    expect(q.sql).toContain(
      'COALESCE(EXCLUDED.has_photo, crm_people.has_photo)'
    )
  })
})
