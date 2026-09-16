/**
 * A PROVIDER REFUSING THE CUSTOMER'S PROMPT OR PHOTO IS NOT AN INCIDENT.
 *
 * `utils/logger.ts` binds the Telegram transport at level 'error', so the level
 * a line is written at is a ROUTING decision: every `logger.error` in this
 * process is a push notification to the owner's phone. Ask of every line "what
 * would an operator DO with this at 3am?" -- and when Replicate, Kling or
 * Google refuse somebody's selfie on their own safety filter the answer is
 * nothing. There is no key to rotate, no service to restart, no quota to
 * raise. The machinery worked; the picture was not allowed.
 *
 * This predicate answers that one question at every site that decides how
 * loudly to complain, the way `price/helpers/isBalanceRefusal.ts` answers
 * "was this the customer's wallet?".
 *
 * WHY IT IS DELIBERATELY NARROWER THAN THE CLASSIFIERS IT SERVES.
 *
 * Several generators already sort errors by substring, and their content
 * branch reads:
 *
 *     errorMsgLower.includes('e005') || errorMsgLower.includes('flagged as
 *       sensitive') || errorMsgLower.includes('nsfw') ||
 *       errorMsgLower.includes('safety')
 *
 * The bare words are the hazard. "NSFW classifier unavailable", "nsfw filter
 * timed out" and "safety checker service unavailable" are OUR machinery
 * breaking, and a loose match would silence all three as "the customer posted
 * something rude". That was harmless while every branch ended in the same
 * logger.error. It stops being harmless the moment this answer decides whether
 * the owner hears about something at all.
 *
 * Hence: the content word must appear NEXT TO a word of verdict. The bare
 * 'safety' is not in the list at all. Anything this cannot recognise is
 * machinery until proven otherwise -- being told about a refused photo costs a
 * notification, missing an outage costs the service.
 *
 * Every pattern below is anchored on wording this repository has actually
 * seen: 'E005' and 'flagged as sensitive' are the Replicate/Kling refusal
 * (localMorphingProcessor.ts, generateSeeDream45.ts), and 'Content rejected by
 * Google policy' is thrown by video-providers/KieAiProvider.ts on Veo's
 * successFlag 3.
 */

/**
 * A refusal we classified ourselves, at the moment we read the provider's
 * verdict. Message matching is a fallback for errors that arrive as prose from
 * a third party; where WE know the cause, we say so in the type, and the outer
 * catch blocks that re-log the throw can tell a customer verdict from a broken
 * poll without re-deriving it.
 */
export class ContentRefusalError extends Error {
  readonly contentRefusal = true

  constructor(message: string) {
    super(message)
    this.name = 'ContentRefusalError'
    // Required for `instanceof` to survive the ES5 target downlevelling.
    Object.setPrototypeOf(this, ContentRefusalError.prototype)
  }
}

/** Words a provider uses when it has REFUSED something. */
const VERDICT =
  '(?:refus\\w*|reject\\w*|block\\w*|flag(?:ged|s)?|violat\\w*|detected|triggered|disallowed|not allowed)'

/**
 * Words that name the CONTENT rule. Note what is missing: a bare 'safety' and
 * a bare 'content'. Both appear in machinery failures ("safety checker service
 * unavailable", "Content-Length mismatch") and neither carries a verdict.
 */
const CONTENT =
  '(?:nsfw|sensitive (?:content|image|imagery|material)|content polic\\w*|safety (?:system|filter|filters|checker)|moderation)'

const CONTENT_REFUSAL_PATTERNS: RegExp[] = [
  /\be005\b/i,
  /flagged as sensitive/i,
  /\bcontent (?:was )?(?:rejected|refused|blocked|flagged)\b/i,
  new RegExp(`${CONTENT}[\\s\\S]{0,40}${VERDICT}`, 'i'),
  new RegExp(`${VERDICT}[\\s\\S]{0,40}${CONTENT}`, 'i'),
]

/** The text to test, whatever shape the failure arrived in. */
function messageOf(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message || ''
  if (error && typeof error === 'object') {
    const bag = error as Record<string, unknown>
    for (const key of ['message', 'error', 'reason', 'errorMessage']) {
      const value = bag[key]
      if (typeof value === 'string') return value
      if (value instanceof Error) return value.message || ''
    }
  }
  return ''
}

/**
 * Did this failure happen because a provider refused the customer's prompt or
 * photo on a content rule?
 *
 * True means: tell the customer what to change, and keep it out of the owner's
 * alert group. False means everything else, including every failure this
 * cannot recognise.
 */
export function isContentRefusal(error: unknown): boolean {
  if (error instanceof ContentRefusalError) return true
  if (
    error &&
    typeof error === 'object' &&
    (error as { contentRefusal?: unknown }).contentRefusal === true
  ) {
    return true
  }

  const text = messageOf(error)
  if (!text) return false
  return CONTENT_REFUSAL_PATTERNS.some(pattern => pattern.test(text))
}
