/**
 * WHAT WENT WRONG, IN ONE WORD, FOR THE LINE THE OWNER READS AT 3AM.
 *
 * The image generators end their catch with a sentence built from this label:
 * `[SeeDream4.5] RATE_LIMIT - <automatic retry via fallback>`. The label
 * changes no control flow -- it is read by the log line and nothing else --
 * which is precisely why it was allowed to drift into a lie.
 *
 * THE LIE. The rate-limit branch used to test the bare substring 'rate', and
 * 'rate' is inside 'generated'. The download/save wrapper this very file's
 * callers throw --
 *
 *     throw new Error(`Failed to process generated image: ${originalMsg}`)
 *
 * -- therefore matched it, so a provider CDN that was unreachable, a disk that
 * was full or a broken write path was reported to the owner as a provider
 * throttling us, with the reassurance that an automatic retry was already
 * under way. DOWNLOAD_ERROR, the branch written for exactly that failure, was
 * unreachable for it. The one incident that costs the service was dressed up
 * as the one incident that needs no operator.
 *
 * THE SECOND HALF OF THE SAME HOLE. Removing the bare 'rate' is not enough:
 * `helpers/downloadFile.ts` throws `File size (N bytes) exceeds Telegram limit
 * of M bytes`, and the sibling bare `includes('limit')` caught that too. So
 * the rate branch now demands a rate-limit PHRASE -- 'rate limit', 'rate
 * exceeded', 'limit exceeded', 'limit reached', '429', 'too many', 'throttl'
 * -- none of which appears in 'limit of 50000000 bytes'.
 *
 * Anything this cannot place lands in UNKNOWN, and the callers append the
 * first 100 characters of the real message for UNKNOWN only. An honest
 * "UNKNOWN | ENOSPC: no space left on device" beats a confident wrong noun.
 *
 * THE TWO BRANCHES THAT KEPT THEIRS. The label stopped being inert the moment
 * the same failure also chose a LEVEL. generateSeeDream45.ts builds the
 * headline from `errorType` and routes the line through `isContentRefusal` /
 * `isBalanceRefusal`, and those two answers used to be computed from different
 * rules -- so they could contradict each other on the same string:
 *
 *   'Failed to process generated image: safety checker service unavailable'
 *     -> bare includes('safety') said NSFW_DETECTED, retriable
 *     -> isContentRefusal said false ('unavailable' is no verdict)
 *
 * which is an outage in OUR safety hop, paged to the owner -- correctly -- under
 * a headline blaming the customer's picture and promising a retry nobody had
 * scheduled. The bare includes('balance') is the same shape: the message
 * core/supabase/getUserBalance.ts:74 throws names the missing RPC
 * ('get_user_balance ...', the one failure that means the balance is UNKNOWN
 * rather than zero), and the substring inside that identifier announced it as
 * a customer who is out of stars.
 *
 * So both branches now ask the SAME predicate the level is routed by. The
 * narrowness is the point: those predicates want the content word next to a
 * word of verdict, and the money word next to the thing there is not enough of.
 * What they refuse falls through to the honest UNKNOWN above.
 */
import { isContentRefusal } from '@/helpers/isContentRefusal'
import { isBalanceRefusal } from '@/price/helpers/isBalanceRefusal'

export interface GenerationFailureClass {
  /** The single word printed in the alert. */
  errorType: string
  /** Whether the fallback chain is expected to try something else after this. */
  isRetriable: boolean
}

/** A rate limit, worded every way the providers word it. */
const RATE_LIMIT_PATTERNS: RegExp[] = [
  /rate[ _-]?limit/,
  /rate[ _-]?exceed/,
  /limit exceeded/,
  /limit reached/,
  /\b429\b/,
  /too many/,
  /throttl/,
]

/**
 * Sort a generation failure into one label. Pure: the message in, a label out,
 * so the collision above can be pinned by a test that feeds it the exact
 * colliding string.
 */
export function classifyGenerationFailure(
  errorMessage: string
): GenerationFailureClass {
  const raw = errorMessage || ''
  const text = raw.toLowerCase()

  // The predicate, not the bare words: 'e005' and 'flagged as sensitive' are
  // both inside it, and 'safety'/'nsfw' now have to sit next to a verdict. The
  // caller routes the level by this same answer, so the two cannot disagree.
  if (isContentRefusal(raw)) {
    return { errorType: 'NSFW_DETECTED', isRetriable: true }
  }

  if (RATE_LIMIT_PATTERNS.some(pattern => pattern.test(text))) {
    return { errorType: 'RATE_LIMIT', isRetriable: true }
  }

  if (
    text.includes('timeout') ||
    text.includes('etimedout') ||
    text.includes('econnreset') ||
    text.includes('socket')
  ) {
    return { errorType: 'TIMEOUT', isRetriable: true }
  }

  // Ditto for the wallet. A bare 'insufficient' is in "insufficient
  // permissions" and a bare 'not enough' is in "not enough memory"; neither is
  // a customer, and calling one of them INSUFFICIENT_BALANCE tells the owner
  // the one thing he can do nothing about.
  if (isBalanceRefusal(raw)) {
    return { errorType: 'INSUFFICIENT_BALANCE', isRetriable: false }
  }

  if (text.includes('user') && text.includes('not') && text.includes('exist')) {
    return { errorType: 'USER_NOT_FOUND', isRetriable: false }
  }

  if (
    text.includes('invalid') ||
    text.includes('validation') ||
    text.includes('parse')
  ) {
    return { errorType: 'VALIDATION_ERROR', isRetriable: false }
  }

  if (
    text.includes('download') ||
    text.includes('fetch') ||
    text.includes('enotfound')
  ) {
    return { errorType: 'DOWNLOAD_ERROR', isRetriable: true }
  }

  if (
    text.includes('api') ||
    text.includes('500') ||
    text.includes('502') ||
    text.includes('503')
  ) {
    return { errorType: 'API_ERROR', isRetriable: true }
  }

  if (text.includes('cancel')) {
    return { errorType: 'CANCELLED', isRetriable: false }
  }

  if (text.includes('1k') || text.includes('resolution not supported')) {
    return { errorType: 'UNSUPPORTED_RESOLUTION', isRetriable: false }
  }

  return { errorType: 'UNKNOWN', isRetriable: false }
}
