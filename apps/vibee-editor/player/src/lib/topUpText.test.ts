import { describe, it, expect } from 'vitest'
import { SERVER_CODES, topUpText, type TopUpEvent } from './topUpText'

/**
 * The top-up reports on money, so an English reader gets every sentence in
 * English and a Russian reader keeps the wording they had before.
 */
const EVERY: TopUpEvent[] = [
  {
    kind: 'failedToStart',
    code: 'sign_in',
    reason: 'нужна подпись или ключ агента',
  }, // cyrillic-ok: server text
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

  it('translates by the server code, keeps the server words in Russian', () => {
    const signIn = {
      kind: 'failedToStart' as const,
      code: 'sign_in',
      reason: 'нужна подпись или ключ агента',
    } // cyrillic-ok: server text
    expect(topUpText(signIn, 'en')).toBe('Open the app from Telegram to pay')
    expect(topUpText(signIn, 'ru')).toBe('нужна подпись или ключ агента') // cyrillic-ok: server text
  })

  it('every known code has an English sentence without Cyrillic', () => {
    for (const code of Object.keys(SERVER_CODES)) {
      const text = topUpText({ kind: 'failedToStart', code, reason: 'x' }, 'en')
      expect(text, code).toBe(SERVER_CODES[code])
      expect(text, code).not.toMatch(/\p{Script=Cyrillic}/u)
    }
  })

  it('no code or an unknown one: an honest generic line, not the Russian text', () => {
    expect(
      topUpText({ kind: 'failedToStart', reason: 'касса не настроена' }, 'en') // cyrillic-ok: server text
    ).toBe("Couldn't start the payment")
    expect(
      topUpText(
        { kind: 'failedToStart', code: 'from_the_future', reason: 'что-то' },
        'en'
      ) // cyrillic-ok: server text
    ).toBe("Couldn't start the payment")
  })

  it('passes an English server reason through', () => {
    expect(
      topUpText({ kind: 'failedToStart', reason: 'pack not found' }, 'en')
    ).toBe('pack not found')
  })
})
