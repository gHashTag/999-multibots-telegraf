import { describe, it, expect } from 'vitest'
import {
  buildPlanText,
  planKeyboard,
  planDue,
  localDayKey,
  localHour,
  isStale,
  planFingerprint,
  planMarker,
} from '@/services/crmPlan'
import {
  CRM_ROOT_RE,
  CRM_LEAD_RE,
  CRM_SCOPE_RE,
  allCallbacks,
} from '@/navigation/helpers/crmMenu'

/**
 * The plan for the day: by data, every segment printed, a button only where
 * there is somebody, nothing drafted or sent by the plan itself.
 */
const NOW = Date.parse('2026-09-09T06:30:00Z') // 09:30 in Moscow
const TZ = 'Europe/Moscow'
const summary = {
  people_with_messages: 855,
  paid: 125,
  last_ingest_at: '2026-09-09T03:04:22.159Z',
  zep: 'ce',
  segments: {
    hot: 10,
    objection: 2,
    waiting: 306,
    talk: 1,
    due: 4,
    ours: 3,
    warm: 12,
    winback: 6,
    quiet: 511,
  },
  caps: {
    hot: 10,
    objection: 3,
    waiting: 20,
    talk: 5,
    due: 5,
    ours: 5,
    warm: 10,
    winback: 3,
    day: 30,
  },
  seller_sends_recent: 2,
  pending_card: {
    id: 'p1',
    action: 'send',
    target: '900000001',
    age_minutes: 12,
  },
  top: [
    {
      lead: '900000001',
      display: 'Pilot (@pilot_client)',
      next: 'reply',
      stage: 'talking',
      days_since_their_last_word: 0,
    },
    {
      lead: '900000002',
      display: null,
      next: 'wait',
      stage: 'new',
      days_since_their_last_word: 5,
    },
  ],
  objections: [
    {
      lead: '900000006',
      display: 'Anna',
      next: 'reply',
      days_since_their_last_word: 3,
    },
  ],
}
const matches = (d: string) =>
  CRM_ROOT_RE.test(d) || CRM_LEAD_RE.test(d) || CRM_SCOPE_RE.test(d)

describe('the plan text', () => {
  it('prints the date, the memory line, every segment with its count and cap, what went out, the card, the people', () => {
    const t = buildPlanText(
      summary,
      'Обход «waiting»: 3 из 10 · жду кнопку',
      NOW,
      TZ
    )
    expect(t).toContain('🗓 План продавца · 9 сентября')
    expect(t).toContain(
      'Память: 855 чел. с перепиской · платили 125 · диалоги обходил 2026-09-09 · Zep: ce'
    )
    expect(t).toContain('1. 🔥 Горячие: 10 — сами спрашивали цену')
    expect(t).toContain(
      '3. ✉️ Ждут ответа: 306 — по одному: карточка → кнопка в очередь первые 20'
    )
    expect(t).toContain('7. 📣 Прогрев: 12 —')
    expect(t).toContain('8. 💎 Вернуть: 6 —')
    expect(t).toContain('Не трогаю: 511')
    expect(t).toContain('Сегодня ушло: 2 из 30.')
    expect(t).toContain('Карточка ждёт: send → 900000001, 12 мин.')
    expect(t).toContain('Обход «waiting»: 3 из 10')
    expect(t).toContain(
      '1. Pilot (@pilot_client) · 900000001 · ответить · в разговоре · сегодня'
    )
    expect(t).toContain(
      '🤔 3. Anna · 900000006 · ответить · возражение · 3 дн. назад'
    )
    expect(t).toContain('Ничего не уйдёт без твоей кнопки')
    expect(t.length).toBeLessThan(4096)
  })

  it('an empty memory still prints every segment as zero and no people block', () => {
    const t = buildPlanText({}, null, NOW, TZ)
    expect(t).toContain('1. 🔥 Горячие: 0')
    expect(t).toContain('Не трогаю: 0')
    expect(t).toContain('Сегодня ушло: 0 из 30.')
    expect(t).not.toContain('Персонально')
    expect(t).not.toContain('Карточка ждёт')
  })
})

describe('the plan keyboard', () => {
  it('a person row per top and objection entry, a segment button only where there is somebody, the hub last', () => {
    const kb = planKeyboard(summary, { scopeActive: true, stale: false })
    const data = allCallbacks(kb)
    for (const d of data) expect(matches(d), d).toBe(true)
    expect(data.slice(0, 4)).toEqual([
      'crm:lead:900000001',
      'crm:prep:900000001',
      'crm:lead:900000002',
      'crm:lead:900000006',
    ])
    const labels = kb.reply_markup.inline_keyboard
      .flat()
      .map(b => (b as any).text)
    expect(labels).toContain('🤔 3. Anna')
    expect(labels).toContain('✉️ Ответить ждущим (20 из 306)')
    expect(labels).toContain('🔥 Горячие (10)')
    expect(labels).toContain('💎 Вернуть (3 из 6)')
    expect(labels).not.toContain(expect.stringContaining('Прогрев'))
    expect(data).toContain('crm:scope:stop')
    expect(data).not.toContain('crm:ingest')
    expect(data.slice(-3)).toEqual(['crm:leads', 'crm:summary', 'crm:sweep'])
  })

  it('zero segments draw no button; a stale memory offers the ingest', () => {
    const kb = planKeyboard(
      {
        segments: { hot: 0, waiting: 0 },
        last_ingest_at: '2026-09-01T00:00:00Z',
      },
      { stale: true }
    )
    const data = allCallbacks(kb)
    expect(data).toEqual([
      'crm:ingest',
      'crm:leads',
      'crm:summary',
      'crm:sweep',
    ])
  })

  it('no objection button exists: objections are hand only', () => {
    const data = allCallbacks(planKeyboard({ segments: { objection: 5 } }))
    expect(data.some(d => d.includes('objection'))).toBe(false)
  })
})

describe('when the plan is due', () => {
  it('inside the window and not yet sent today; never twice; not before the hour', () => {
    expect(localDayKey(NOW, TZ)).toBe('2026-09-09')
    expect(localHour(NOW, TZ)).toBe(9)
    expect(planDue({ now: NOW, tz: TZ, hour: 9, sentDay: null })).toBe(true)
    expect(planDue({ now: NOW, tz: TZ, hour: 9, sentDay: '2026-09-09' })).toBe(
      false
    )
    expect(planDue({ now: NOW, tz: TZ, hour: 10, sentDay: null })).toBe(false)
    expect(planDue({ now: NOW, tz: TZ, hour: 9, sentDay: '2026-09-08' })).toBe(
      true
    )
    // 21:30 Moscow is past the window.
    expect(
      planDue({
        now: Date.parse('2026-09-09T18:30:00Z'),
        tz: TZ,
        hour: 9,
        sentDay: null,
      })
    ).toBe(false)
    // A broken zone falls back to UTC rather than throwing.
    expect(typeof localDayKey(NOW, 'Nowhere/Land')).toBe('string')
  })

  it('stale after two days without an ingest; the fingerprint follows the counts', () => {
    expect(isStale({ last_ingest_at: '2026-09-09T03:00:00Z' }, NOW)).toBe(false)
    expect(isStale({ last_ingest_at: '2026-09-06T03:00:00Z' }, NOW)).toBe(true)
    expect(isStale({}, NOW)).toBe(true)
    expect(planFingerprint(summary)).toBe('10-2-306-1-4-3-12-6:2')
    expect(planMarker('2026-09-09')).toBe('[план продавца 2026-09-09]')
  })
})

describe('the morning line stops framing the day as capacity unused', () => {
  /*
   * MEASURED 2026-09-16. "Сегодня ушло: 4 из 30" is the first line the owner
   * reads every morning, and it says 26 more could go. In those same days the
   * seller prepared SIXTY-THREE cards, each replacing the last unpressed one.
   * The constraint is not capacity; it is that cards die before a press, and
   * the screen said the opposite.
   */
  it('names the cards prepared when more were made than sent', () => {
    const t = buildPlanText(summary, null, NOW, TZ, 63)
    expect(t).toContain('Подготовлено карточек: 63')
    expect(t).toContain('остальные заменены')
  })

  it('says nothing extra when everything prepared was sent', () => {
    // No lecture where there is no leak: the line stays as it was.
    const sent = Number(
      (summary as { seller_sends_recent?: number }).seller_sends_recent ?? 0
    )
    const t = buildPlanText(summary, null, NOW, TZ, sent)
    expect(t).not.toContain('Подготовлено карточек')
  })

  it('and nothing at all when the journal could not be read', () => {
    // The plan worked without this number for months; a failing second call
    // must not take the morning screen with it.
    const t = buildPlanText(summary, null, NOW, TZ, null)
    expect(t).not.toContain('Подготовлено карточек')
    expect(t).toContain('Сегодня ушло:')
  })
})
