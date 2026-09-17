import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchSummary, formatSummary } from '@/services/crmSummary'

/**
 * The overview as the owner reads it: every bucket in Russian, zeros
 * printed, the seller's own sends named, the card and the scope in flight.
 */
const sample = {
  window_days: 7,
  people_known: 132,
  people_with_messages: 118,
  paid: 9,
  messages: { total: 4210, inbound: 2380, outbound: 1830 },
  last_inbound_at: '2026-09-08T16:09:43.000Z',
  last_ingest_at: '2026-09-08T14:02:00.000Z',
  zep: 'ce',
  waiting_for_reply: 7,
  hot: 3,
  by_next: { reply: 7, deliver: 1, offer: 2, talk: 12, wait: 96 },
  by_stage: {
    client: 9,
    talking: 4,
    written: 11,
    later: 2,
    refused: 3,
    winback: 1,
    new: 88,
  },
  by_signal: { price: 6, buy: 3, service: 9, urgency: 1, objection: 2 },
  touches_by_kind: {
    written: { total: 23, recent: 6 },
    replied: { total: 5, recent: 2 },
    later: { total: 2, recent: 1 },
    refused: { total: 3, recent: 0 },
    bought: { total: 4, recent: 1 },
  },
  seller_sends_recent: 4,
  waiting_by_touch: { ours: 3, due: 2, theirs: 8 },
  top: [
    {
      lead: '900000001',
      display: 'Pilot (@pilot_client)',
      next: 'reply',
      stage: 'talking',
      days_since_their_last_word: 2,
    },
    {
      lead: '900000002',
      display: null,
      next: 'talk',
      stage: 'new',
      days_since_their_last_word: 5,
    },
  ],
  pending_card: {
    id: 'p1',
    action: 'send',
    target: '900000001',
    age_minutes: 4,
  },
}

afterEach(() => vi.unstubAllGlobals())

describe('formatSummary', () => {
  it('lays out the brief with every label in Russian, zeros included', () => {
    const t = formatSummary(
      sample,
      'Обход «next=reply»: 3 из 7 · жду кнопку по Pilot (@pilot_client) 12 мин.'
    )
    expect(t).toContain('Сводка по переписке · окно 7 дн.')
    expect(t).toContain('Людей в памяти: 132 (с сообщениями 118) · платили 9')
    expect(t).toContain('Сообщений: 4210 (от них 2380 · от меня 1830)')
    expect(t).toContain('память обходила диалоги: 2026-09-08 14:02 · Zep: ce')
    expect(t).toContain('Ждут ответа (по сообщениям): 7 · горячие: 3')
    expect(t).toContain(
      'Шаги: ответить 7 · сделать и отправить 1 · предложить счёт 2 · поговорить 12 · не трогать 96'
    )
    expect(t).toContain(
      'Этапы: клиент 9 · в разговоре 4 · написали 11 · просил позже 2 · отказ 3 · вернуть 1 · новый 88'
    )
    expect(t).toContain(
      'Сигналы: цена 6 · покупка 3 · услуга 9 · срочно 1 · возражение 2'
    )
    expect(t).toContain(
      'Касания всего: написали 23 · ответил 5 · позже 2 · отказ 3 · купил 4'
    )
    expect(t).toContain(
      'За 7 дн.: написали 6 (из продавца 4) · ответил 2 · позже 1 · отказ 0 · купил 1'
    )
    expect(t).toContain('По касаниям ждём: мы 3 · пора 2 · они 8')
    expect(t).toContain(
      '1. Pilot (@pilot_client) · 900000001 · ответить · в разговоре · 2 дн. назад'
    )
    expect(t).toContain(
      '2. id 900000002 · 900000002 · поговорить · новый · 5 дн. назад'
    )
    expect(t).toContain('Карточка ждёт: send → 900000001, 4 мин.')
    expect(t).toContain('Обход «next=reply»: 3 из 7')
    expect(t).toContain('/sweep ждут | горячие | разговор')
  })

  it('an empty memory still reads: zeros, no card, no scope, the hint', () => {
    const t = formatSummary({})
    expect(t).toContain('Людей в памяти: 0 (с сообщениями 0) · платили 0')
    expect(t).toContain(
      'Шаги: ответить 0 · сделать и отправить 0 · предложить счёт 0 · поговорить 0 · не трогать 0'
    )
    expect(t).not.toContain('Карточка ждёт')
    expect(t).not.toContain('Обход «')
    expect(t).not.toContain('Первые пять')
  })
})

describe('fetchSummary', () => {
  it('asks crm_summary as the owner with the window', async () => {
    process.env.RENDER_API_KEY = 'k' // secret-guard-ok: invented for this test
    const calls: any[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: any) => {
        calls.push({ url: String(url), body: JSON.parse(init.body) })
        return {
          ok: true,
          status: 200,
          json: async () => ({ result: { structuredContent: { hot: 2 } } }),
        }
      })
    )
    const s = await fetchSummary('144022504', 30)
    expect(s.hot).toBe(2)
    expect(calls[0].url).toContain('/mcp?telegram_id=144022504')
    expect(calls[0].body.params).toEqual({
      name: 'crm_summary',
      arguments: { days: 30 },
    })
  })
})

describe('the screen shows what happens between a card and a press', () => {
  /*
   * MEASURED 2026-09-16: 63 cards prepared in five and a half days against
   * five `written` touches in the whole CRM -- and nobody saw it for five
   * days, because this screen said how many people are at each stage and
   * nothing about the cards in between.
   */
  it('prints prepared, sent and died', () => {
    const t = formatSummary(sample as never, null, {
      prepared: 63,
      dropped: 57,
      giftRefused: 0,
    })
    expect(t).toContain('подготовлено 63')
    expect(t).toContain('умерло 57')
  })

  it('says UNKNOWN, not zero, while the journal cannot answer', () => {
    // A zero from an unwired counter reads exactly like a zero from a healthy
    // funnel. Until the card-journal listener ships, the honest word is
    // "unknown".
    const t = formatSummary(sample as never, null, {
      prepared: 63,
      dropped: null,
      giftRefused: 0,
    })
    expect(t).toContain('умерло неизвестно')
    expect(t).not.toContain('умерло 0')
  })

  it('names the leak when preparing outruns sending threefold', () => {
    // The sample holds 23 `written` touches, so the leak line needs more
    // than 69 prepared. Production on 2026-09-16 was the real shape of it:
    // 63 prepared against FIVE sends.
    const t = formatSummary(sample as never, null, {
      prepared: 100,
      dropped: null,
      giftRefused: 0,
    })
    expect(t).toContain('теряется между карточкой и нажатием')
  })

  it('and says nothing of the sort when they are comparable', () => {
    const t = formatSummary(sample as never, null, {
      prepared: 4,
      dropped: 1,
      giftRefused: 0,
    })
    expect(t).not.toContain('теряется между карточкой')
  })

  it('the screen without the card numbers is exactly what it was', () => {
    // The second call can fail; half a screen beats an error.
    const t = formatSummary(sample as never, null, null)
    expect(t).not.toContain('Карточки (в окне журнала)')
    expect(t).toContain('Сводка по переписке')
  })

  it('a refused gift is counted where the owner can see it', () => {
    const t = formatSummary(sample as never, null, {
      prepared: 10,
      dropped: 2,
      giftRefused: 4,
    })
    expect(t).toContain('подарок отказан 4')
  })
})
