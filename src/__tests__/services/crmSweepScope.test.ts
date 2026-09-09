import { describe, it, expect } from 'vitest'
import {
  SWEEP_HEAD,
  SWEEP_RULES,
  SWEEP_TAIL,
  parseSweepArgs,
  matchRow,
  filterRows,
  isHotRow,
  itemsFromChats,
  itemsFromRows,
  scopedPrompt,
  itemMarker,
  progressLine,
  SYNTAX,
} from '@/services/crmSweepScope'

/**
 * The seller, pointed at somebody: what the owner may type after /sweep,
 * which rows a filter keeps, and the brief the agent gets for ONE person.
 */
const rows = [
  {
    lead: '111111111',
    display: 'Pilot (@pilot_client)',
    username: 'pilot_client',
    next: 'reply',
    stage: 'client',
    paid: true,
    signals: ['price', 'service'],
    waiting_for_reply: true,
    days_since_their_last_word: 0,
  },
  {
    lead: '222222222',
    display: 'Second',
    username: 'second_client',
    next: 'offer',
    stage: 'new',
    paid: false,
    signals: ['buy'],
    waiting_for_reply: false,
    days_since_their_last_word: 3,
  },
  {
    lead: '333333333',
    display: 'Third',
    username: 'third_client',
    next: 'talk',
    stage: 'new',
    paid: false,
    signals: [],
    waiting_for_reply: false,
    days_since_their_last_word: 6,
  },
  {
    lead: '444444444',
    display: 'Quiet',
    username: null,
    next: 'wait',
    stage: 'winback',
    paid: true,
    signals: ['price'],
    waiting_for_reply: false,
    days_since_their_last_word: 40,
  },
  {
    lead: '555555555',
    display: 'Never wrote',
    username: null,
    next: 'wait',
    stage: 'new',
    paid: false,
    signals: [],
    waiting_for_reply: false,
    days_since_their_last_word: null,
  },
  {
    lead: '666666666',
    display: 'Talker',
    username: null,
    next: 'talk',
    stage: 'talking',
    paid: false,
    signals: [],
    waiting_for_reply: false,
    days_since_their_last_word: 8,
  },
]

describe('parseSweepArgs', () => {
  it('nothing is the generic sweep; где and stop are their own', () => {
    expect(parseSweepArgs([])).toEqual({ kind: 'generic' })
    expect(parseSweepArgs(['где'])).toEqual({ kind: 'status' })
    expect(parseSweepArgs(['status'])).toEqual({ kind: 'status' })
    expect(parseSweepArgs(['стоп'])).toEqual({ kind: 'stop' })
    expect(parseSweepArgs(['STOP'])).toEqual({ kind: 'stop' })
  })

  it('people: a @username, a numeric id, a list in the order given', () => {
    expect(parseSweepArgs(['@pilot_client'])).toEqual({
      kind: 'list',
      chats: ['@pilot_client'],
      label: '@pilot_client',
    })
    expect(parseSweepArgs(['900000001', '@pilot_client'])).toEqual({
      kind: 'list',
      chats: ['900000001', '@pilot_client'],
      label: '900000001 @pilot_client',
    })
  })

  it('filters AND together, presets have Russian names, limit is bounded', () => {
    const f = parseSweepArgs(['next=reply', 'days<=7'])
    expect(f).toEqual({
      kind: 'filter',
      predicates: [
        { field: 'next', value: 'reply' },
        { field: 'days', op: '<=', value: 7 },
      ],
      limit: 10,
      limitGiven: false,
      label: 'next=reply days<=7',
    })
    expect(parseSweepArgs(['days=7'])).toMatchObject({
      predicates: [{ field: 'days', op: '<=', value: 7 }],
    })
    expect(parseSweepArgs(['горячие'])).toMatchObject({
      predicates: [{ field: 'preset', value: 'hot' }],
      label: 'hot',
    })
    expect(parseSweepArgs(['ждут', 'limit=3'])).toMatchObject({
      limit: 3,
      limitGiven: true,
      label: 'waiting limit=3',
    })
    expect(parseSweepArgs(['пора'])).toMatchObject({
      predicates: [{ field: 'preset', value: 'due' }],
    })
    expect(parseSweepArgs(['молчим'])).toMatchObject({
      predicates: [{ field: 'preset', value: 'ours' }],
    })
    expect(parseSweepArgs(['вернуть'])).toMatchObject({
      predicates: [{ field: 'preset', value: 'winback' }],
    })
    expect(parseSweepArgs(['прогрев'])).toMatchObject({
      kind: 'error',
      message: expect.stringContaining('только пакетом'),
    })
    expect(parseSweepArgs(['limit=0'])).toMatchObject({ kind: 'error' })
    expect(parseSweepArgs(['limit=51'])).toMatchObject({ kind: 'error' })
  })

  it('refuses mixing people with filters, unknown keys, unknown values, and bare words', () => {
    expect(parseSweepArgs(['@pilot_client', 'next=reply'])).toMatchObject({
      kind: 'error',
      message: expect.stringContaining('не вместе'),
    })
    expect(parseSweepArgs(['color=red'])).toMatchObject({
      kind: 'error',
      message: expect.stringContaining(SYNTAX),
    })
    expect(parseSweepArgs(['next=sell'])).toMatchObject({
      kind: 'error',
      message: 'next: reply, deliver, offer, talk, wait',
    })
    expect(parseSweepArgs(['ivan'])).toMatchObject({ kind: 'error' })
    expect(parseSweepArgs(['@iv'])).toMatchObject({
      kind: 'error',
      message: expect.stringContaining('от 5 знаков'),
    })
  })
})

describe('the row filters', () => {
  it('each field means what the list means', () => {
    expect(
      filterRows(rows, [{ field: 'next', value: 'talk' }], 10).map(r => r.lead)
    ).toEqual(['333333333', '666666666'])
    expect(
      filterRows(rows, [{ field: 'stage', value: 'new' }], 10)
    ).toHaveLength(3)
    expect(
      filterRows(rows, [{ field: 'signal', value: 'price' }], 10).map(
        r => r.lead
      )
    ).toEqual(['111111111', '444444444'])
    expect(
      filterRows(rows, [{ field: 'paid', value: 'yes' }], 10).map(r => r.lead)
    ).toEqual(['111111111', '444444444'])
    expect(
      filterRows(rows, [{ field: 'days', op: '<=', value: 7 }], 10).map(
        r => r.lead
      )
    ).toEqual(['111111111', '222222222', '333333333'])
    expect(
      filterRows(rows, [{ field: 'days', op: '>=', value: 7 }], 10).map(
        r => r.lead
      )
    ).toEqual(['444444444', '666666666'])
  })

  it('presets: waiting is the unanswered, hot is their own price or buy word recently, talk is talk', () => {
    expect(
      filterRows(rows, [{ field: 'preset', value: 'waiting' }], 10).map(
        r => r.lead
      )
    ).toEqual(['111111111'])
    expect(
      filterRows(rows, [{ field: 'preset', value: 'hot' }], 10).map(r => r.lead)
    ).toEqual(['111111111', '222222222'])
    expect(isHotRow(rows[3])).toBe(false)
    expect(
      filterRows(rows, [{ field: 'preset', value: 'talk' }], 10).map(
        r => r.lead
      )
    ).toEqual(['333333333', '666666666'])
  })

  it('predicates AND together and the limit cuts from the top', () => {
    expect(
      filterRows(
        rows,
        [
          { field: 'stage', value: 'new' },
          { field: 'days', op: '<=', value: 7 },
        ],
        10
      ).map(r => r.lead)
    ).toEqual(['222222222', '333333333'])
    expect(filterRows(rows, [], 2).map(r => r.lead)).toEqual([
      '111111111',
      '222222222',
    ])
    expect(matchRow(rows[4], { field: 'days', op: '<=', value: 100 })).toBe(
      false
    )
  })
})

describe('the items and the brief', () => {
  it('explicit chats keep their order and pick up the name and the step when known', () => {
    const items = itemsFromChats(
      ['@PILOT_CLIENT', '222222222', '@nobody'],
      rows
    )
    expect(items).toEqual([
      {
        chat: '@PILOT_CLIENT',
        display: 'Pilot (@pilot_client)',
        next: 'reply',
      },
      { chat: '222222222', display: 'Second', next: 'offer' },
      { chat: '@nobody', display: null, next: null },
    ])
    expect(itemsFromRows(rows.slice(0, 2)).map(i => i.chat)).toEqual([
      '111111111',
      '222222222',
    ])
  })

  it('the scoped brief names the one person, forbids the list, reuses the rules, and forbids pay-first', () => {
    const p = scopedPrompt({
      chat: '@pilot_client',
      display: 'Pilot (@pilot_client)',
      next: 'talk',
    })
    expect(p).toContain('ОДИН человек — @pilot_client (Pilot (@pilot_client))')
    expect(p).toContain('crm_leads НЕ вызывай')
    expect(p).toContain('crm_lead_context с chat=@pilot_client')
    expect(p).toContain('next=talk')
    expect(p).toContain(SWEEP_RULES)
    expect(p).toContain('НЕ ПРЕДЛАГАЙ ОПЛАТУ ПЕРВЫМ')
    expect(p).toContain('НИЧЕГО НЕ ОТПРАВЛЯЙ САМ')
    expect(p).toContain('«тихо»')
    expect(
      itemMarker({ chat: '@pilot_client', display: null, next: null })
    ).toBe('[обход по выбору владельца: @pilot_client]')
  })

  it('the generic brief is head + rules + tail, and the progress line reads like a list row', () => {
    const generic = SWEEP_HEAD + SWEEP_RULES + SWEEP_TAIL
    expect(generic).toContain('crm_leads с limit 5')
    expect(generic).toContain('4) Если кандидатов нет')
    expect(
      progressLine(1, 7, {
        chat: '900000001',
        display: 'Pilot (@pilot_client)',
        next: 'reply',
      })
    ).toBe('2 из 7 · Pilot (@pilot_client) · 900000001 · ответить')
    expect(
      progressLine(0, 1, { chat: '@pilot_client', display: null, next: null })
    ).toBe('1 из 1 · @pilot_client')
  })
})
