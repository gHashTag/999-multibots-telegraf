/**
 * WHAT THE SERVER SAID ABOUT THE CODE, IN THE SHAPE THE SCREEN NEEDS.
 *
 * The code screen used to know one bit, `viaApp`, and turned it into one of two
 * sentences. Telegram has eight answers, and for two of them -- a login email
 * and "set up a login email first" -- both sentences were false. The render now
 * passes the real channel, the next one and Telegram's own wait
 * (render/src/agent/tg-code-delivery.ts); this file is the one place that
 * reads them, so the screen and its tests cannot disagree about the rules.
 */

export type CodeDelivery =
  | 'app'
  | 'sms'
  | 'call'
  | 'missed_call'
  | 'email'
  | 'email_setup'
  | 'fragment'
  | 'unknown'

/** The sentence for each channel. Every channel has its own: none is reused. */
export const WHERE_KEY: Record<CodeDelivery, string> = {
  app: 'connect.code.viaApp',
  sms: 'connect.code.viaSms',
  call: 'connect.code.viaCall',
  missed_call: 'connect.code.viaMissedCall',
  email: 'connect.code.viaEmail',
  email_setup: 'connect.code.viaEmailSetup',
  fragment: 'connect.code.viaFragment',
  unknown: 'connect.code.viaUnknown',
}

/**
 * Channels that end at the phone number. Only for these does "to +7 999..."
 * finish the sentence; after "sent to your login email" it would be nonsense.
 */
export const GOES_TO_PHONE: ReadonlySet<CodeDelivery> = new Set([
  'app',
  'sms',
  'call',
  'missed_call',
  'unknown',
])

/** Used only when Telegram named no wait of its own. */
export const DEFAULT_RESEND_S = 60

export interface SentCode {
  delivery: CodeDelivery
  emailPattern?: string
  /**
   * Telegram named a next channel. Without one `auth.resendCode` answers
   * SEND_CODE_UNAVAILABLE, so the screen must not offer a button it knows will
   * fail -- that was the owner's hour on 2026-09-16.
   */
  canResend: boolean
  resendAfter: number
  /** Grows with every code Telegram sends, so the countdown starts again. */
  round: number
}

export const NOTHING_SENT: SentCode = {
  delivery: 'app',
  canResend: false,
  resendAfter: DEFAULT_RESEND_S,
  round: 0,
}

/**
 * Read the answer of `/api/tg/connect/start` or `/resend`.
 *
 * A render older than this screen answers with `viaApp` alone: the two deploy
 * separately, so for a few minutes after a release that is what arrives. Its
 * one bit is honoured, and no resend is offered -- the old render has no route
 * for it.
 */
export function readSentCode(
  answer: Record<string, unknown> | null | undefined,
  round: number
): SentCode {
  const said = typeof answer?.delivery === 'string' ? answer.delivery : ''
  /*
   * Three cases, and the middle one is easy to get wrong. A channel this
   * screen has never heard of comes from a NEWER render: it is 'unknown', not
   * whatever the legacy bit suggests -- guessing a channel is the fault this
   * file exists to remove. Only a render that says nothing falls back to the
   * bit.
   */
  const delivery: CodeDelivery = Object.hasOwn(WHERE_KEY, said)
    ? (said as CodeDelivery)
    : said
      ? 'unknown'
      : answer?.viaApp === false
        ? 'sms'
        : 'app'
  const timeout = Number(answer?.timeout)
  const sent: SentCode = {
    delivery,
    canResend: typeof answer?.next === 'string' && answer.next !== '',
    resendAfter:
      Number.isFinite(timeout) && timeout > 0
        ? Math.ceil(timeout)
        : DEFAULT_RESEND_S,
    round,
  }
  if (delivery === 'email' && answer?.emailPattern) {
    sent.emailPattern = String(answer.emailPattern)
  }
  return sent
}
