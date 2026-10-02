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
 * SERVER REASONS. `/api/tokens/invoice` answers its errors in Russian. The
 * known ones are translated by their exact wording; an unknown one is shown
 * as-is to a Russian reader and replaced by a plain "could not start" for an
 * English one -- a translated guess about money is worse than an honest
 * "it did not work".
 */
import type { Language } from '@/atoms/language'

export type TopUpEvent =
  | { kind: 'failedToStart'; reason?: unknown }
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

/** Server reasons we know by wording, keyed by the server's exact text. */
const SERVER_REASONS: Record<string, string> = {
  'нужна подпись или ключ агента': 'Open the app from Telegram to pay', // cyrillic-ok: the server's exact text
}

function serverReason(reason: unknown, lang: Language): string {
  const text = reason == null ? '' : String(reason)
  if (lang === 'ru') return text || 'не получилось' // cyrillic-ok: the russian branch
  if (SERVER_REASONS[text]) return SERVER_REASONS[text]
  if (text && !/\p{Script=Cyrillic}/u.test(text)) return text
  return "Couldn't start the payment"
}

export function topUpText(e: TopUpEvent, lang: Language): string {
  const ru = lang === 'ru'
  switch (e.kind) {
    case 'failedToStart':
      return serverReason(e.reason, lang)
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
