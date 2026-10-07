/**
 * WHAT THE TOP-UP SAYS, IN THE READER'S LANGUAGE.
 *
 * `useTokenTopUp` is where money changes hands, and every sentence it showed
 * was Russian whatever the interface language was: an English reader who paid
 * was told "Оплачено! Проверяю зачисление…" and, if the credit failed, an  // cyrillic-ok: quotes the old text
 * instruction to write to support that they could not read. Of all the places
 * to be unreadable, the one that reports on a payment is the worst.
 *
 * The sentences live here as a pure function so both languages are tested;
 * the hook only picks which one to show.
 *
 * SERVER REASONS. `/api/tokens/invoice` words its errors in Russian and,
 * since 2026-10-02, also names them with a `code`. An English reader gets the
 * sentence for the code; a Russian one keeps the server's own words, which
 * are the most precise. No code, or one this file does not know (an older or
 * newer server), gives a plain "could not start" -- a translated guess about
 * money is worse than an honest "it did not work". The codes are checked
 * against the server by `money-route-codes.test.ts` in render.
 */
import type { Language } from '@/atoms/language'

export type TopUpEvent =
  | { kind: 'failedToStart'; code?: unknown; reason?: unknown }
  | { kind: 'paidChecking' }
  | { kind: 'credited'; tokens: unknown; balance: unknown }
  | { kind: 'creditFailed' }
  | { kind: 'paidRetrying' }
  | { kind: 'paidPending' }
  | { kind: 'paidLater' }
  | { kind: 'paymentFailed' }
  | { kind: 'telegramOnly' }
  | { kind: 'network' }
  | { kind: 'lastVisitCredited'; tokens: unknown }

/** What each server `code` means, for a reader who is not Russian. */
export const SERVER_CODES: Record<string, string> = {
  sign_in: 'Open the app from Telegram to pay',
  cashier_off: 'Payments are switched off right now — try again later',
  bad_amount: 'That amount cannot be bought — pick a pack',
  failed: "Couldn't start the payment — try again",
}

function serverReason(code: unknown, reason: unknown, lang: Language): string {
  const text = reason == null ? '' : String(reason)
  if (lang === 'ru') return text || 'не получилось' // cyrillic-ok: the russian branch
  const known = typeof code === 'string' ? SERVER_CODES[code] : undefined
  if (known) return known
  if (text && !/\p{Script=Cyrillic}/u.test(text)) return text
  return "Couldn't start the payment"
}

export function topUpText(e: TopUpEvent, lang: Language): string {
  const ru = lang === 'ru'
  switch (e.kind) {
    case 'failedToStart':
      return serverReason(e.code, e.reason, lang)
    case 'paidChecking':
      return ru
        ? 'Оплачено! Проверяю зачисление…'
        : 'Paid! Checking the credit…' // cyrillic-ok: the russian branch
    case 'credited':
      return ru
        ? `Зачислено ${e.tokens} токенов! Баланс: ${e.balance}` // cyrillic-ok: the russian branch
        : `${e.tokens} tokens added! Balance: ${e.balance}`
    case 'creditFailed':
      return ru
        ? 'Оплата прошла, но токены не зачислены. Мы уже знаем — напишите в поддержку, вернём или начислим руками.' // cyrillic-ok: the russian branch
        : "The payment went through, but the tokens were not added. We already know — write to support and we'll refund or add them by hand."
    case 'paidRetrying':
      return ru
        ? 'Оплата прошла — проверяю зачисление ещё пару раз…' // cyrillic-ok: the russian branch
        : 'Payment received — checking the credit a couple more times…'
    case 'paidPending':
      return ru
        ? 'Оплата видна Telegram — зачисление догонит при следующем входе в чат' // cyrillic-ok: the russian branch
        : 'Telegram sees the payment — the tokens will arrive the next time you open the chat'
    case 'paidLater':
      return ru
        ? 'Оплата прошла — зачисление подтвердится чуть позже' // cyrillic-ok: the russian branch
        : 'Payment received — the credit will be confirmed a little later'
    case 'paymentFailed':
      return ru ? 'Оплата не прошла' : "The payment didn't go through" // cyrillic-ok: the russian branch
    case 'telegramOnly':
      return ru
        ? 'Покупка доступна внутри Telegram' // cyrillic-ok: the russian branch
        : 'Buying works inside Telegram'
    case 'network':
      return ru
        ? 'сеть подвела — попробуй ещё' // cyrillic-ok: the russian branch
        : 'The network failed — try again'
    case 'lastVisitCredited':
      return ru
        ? `Зачислено ${e.tokens} токенов — оплата прошлого визита дошла` // cyrillic-ok: the russian branch
        : `${e.tokens} tokens added — your payment from last time arrived`
  }
}
