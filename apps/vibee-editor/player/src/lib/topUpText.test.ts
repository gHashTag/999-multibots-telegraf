import { describe, it, expect } from 'vitest'
import { topUpText, type TopUpEvent } from './topUpText'

/**
 * The top-up reports on money, so an English reader gets every sentence in
 * English and a Russian reader keeps the wording they had before.
 */
const EVERY: TopUpEvent[] = [
  { kind: 'failedToStart', reason: 'нужна подпись или ключ агента' }, // cyrillic-ok: server text
  { kind: 'failedToStart' },
  { kind: 'paidChecking' },
  { kind: 'credited', tokens: 100, balance: 250 },
  { kind: 'creditFailed' },
  { kind: 'paidRetrying' },
  { kind: 'paidPending' },
  { kind: 'paidLater' },
  { kind: 'paymentFailed' },
  { kind: 'telegramOnly' },
  { kind: 'network' },
  { kind: 'lastVisitCredited', tokens: 100 },
]

describe('topUpText', () => {
  it('has no Cyrillic in English, for every event', () => {
    for (const e of EVERY) {
      const text = topUpText(e, 'en')
      expect(text, e.kind).not.toMatch(/\p{Script=Cyrillic}/u)
      expect(text.length, e.kind).toBeGreaterThan(0)
    }
  })

  it('keeps the Russian wording for a Russian reader', () => {
    expect(topUpText({ kind: 'paidChecking' }, 'ru')).toBe(
      'Оплачено! Проверяю зачисление…' // cyrillic-ok: the old wording
    )
    expect(
      topUpText({ kind: 'credited', tokens: 100, balance: 250 }, 'ru')
    ).toBe('Зачислено 100 токенов! Баланс: 250') // cyrillic-ok: the old wording
  })

  it('puts the numbers in the English sentence', () => {
    expect(
      topUpText({ kind: 'credited', tokens: 100, balance: 250 }, 'en')
    ).toBe('100 tokens added! Balance: 250')
  })

  it('translates a known server reason and hides an unknown Russian one', () => {
    expect(
      topUpText(
        { kind: 'failedToStart', reason: 'нужна подпись или ключ агента' },
        'en'
      ) // cyrillic-ok: server text
    ).toBe('Open the app from Telegram to pay')
    expect(
      topUpText({ kind: 'failedToStart', reason: 'касса не настроена' }, 'en') // cyrillic-ok: server text
    ).toBe("Couldn't start the payment")
    expect(
      topUpText({ kind: 'failedToStart', reason: 'касса не настроена' }, 'ru') // cyrillic-ok: server text
    ).toBe('касса не настроена') // cyrillic-ok: server text
  })

  it('passes an English server reason through', () => {
    expect(
      topUpText({ kind: 'failedToStart', reason: 'pack not found' }, 'en')
    ).toBe('pack not found')
  })
})
