/**
 * A CUSTOMER WITH AN EMPTY WALLET IS NOT AN INCIDENT.
 *
 * On 2026-09-15 at 08:56 one person (balance 0, price 4 stars) tapped one
 * avatar transform and the owner's alert group received FOUR pages in the same
 * minute -- two from SeeDream-4.5, two from FLUX Kontext -- the last of them
 * carrying the customer's entire prompt. Nobody was paged about a broken
 * system: the system worked, the person had no stars. The one message that
 * SHOULD have gone out, to the customer, with a top-up button under it, is the
 * one the fallback chain suppressed.
 *
 * So this predicate exists to answer one question at every place that decides
 * how loudly to complain: WAS THIS THE CUSTOMER'S WALLET, OR OUR MACHINERY?
 *
 * WHY IT IS DELIBERATELY NARROWER THAN THE CLASSIFIERS IT SERVES.
 *
 * Three generators already classify errors by substring, and their money branch
 * reads:
 *
 *     errorMsgLower.includes('balance') || errorMsgLower.includes('insufficient')
 *       || errorMsgLower.includes('funds') || errorMsgLower.includes('not enough')
 *
 * `'balance'` alone matches "Failed to fetch user balance" and "balance check
 * timed out" -- real machinery failures. That was harmless while every branch
 * ended in the same logger.error. It stops being harmless the moment this
 * answer decides whether the owner hears about something at all: a loose match
 * would silence a database outage as "the customer is poor".
 *
 * Hence: the word for money must appear NEXT TO the word for the thing there
 * is not enough of. "insufficient permissions", "not enough memory" and
 * "failed to fetch balance" are all false, on purpose, and each has a fixture
 * in isBalanceRefusal.test.ts. The direction of the error matters -- being told
 * about a customer's empty wallet costs a notification, missing an outage costs
 * the service.
 */

/**
 * Every wording this repository uses to say the customer cannot pay.
 *
 * The Russian one is built from a string literal rather than written as a
 * regular expression literal on purpose: `scripts/no-cyrillic-guard.cjs` strips
 * complete string literals before looking for Cyrillic, and does not strip
 * regular expressions, so `/<ru>/i` would trip the gate this way round.
 */
const REFUSAL_PATTERNS: RegExp[] = [
  /\binsufficient\s+(stars?|balance|funds)\b/i,
  /\bnot\s+enough\s+(stars?|balance|funds)\b/i,
  new RegExp('недостаточно\\s+(звёзд|звезд|средств)', 'i'),
]

/** The text to test, whatever shape the failure arrived in. */
function messageOf(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message || ''
  if (error && typeof error === 'object') {
    const bag = error as Record<string, unknown>
    for (const key of ['message', 'error', 'reason']) {
      const value = bag[key]
      if (typeof value === 'string') return value
      if (value instanceof Error) return value.message || ''
    }
  }
  return ''
}

/**
 * Did this failure happen because the person has no stars?
 *
 * True means: tell the customer, with the way to pay under it, and keep it out
 * of the owner's alert group. False means: everything else, including every
 * failure this cannot recognise -- an unknown error is machinery until proven
 * otherwise.
 */
export function isBalanceRefusal(error: unknown): boolean {
  const text = messageOf(error)
  if (!text) return false
  return REFUSAL_PATTERNS.some(pattern => pattern.test(text))
}
