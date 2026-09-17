/**
 * WHERE TELEGRAM SENT THE LOGIN CODE -- REPORTED, NOT GUESSED.
 *
 * The owner, 2026-09-16, on the code screen of the Mini App: the screen said
 * "look for the Telegram chat", nothing arrived, and "Request a new code"
 * changed nothing however often it was pressed.
 *
 * Two things were wrong, and both lived in what we asked GramJS for.
 *
 * 1. `client.sendCode()` returns `{ phoneCodeHash, isCodeViaApp }` and throws
 *    the rest of `auth.sentCode` away: the real delivery type, `next_type` and
 *    `timeout`. So the screen could only say "app" or "SMS". A login email, a
 *    voice call and "set up a login email first" were all shown as "SMS", and
 *    the wait before a resend was a constant of ours rather than Telegram's.
 *
 * 2. The resend button called `auth.sendCode` a second time. That is not a
 *    resend: it asks for the same code through the same channel. The method
 *    that moves to the NEXT channel is `auth.resendCode`, and it only works
 *    when `next_type` says there is one.
 *
 * For a third-party api_id Telegram delivers codes inside Telegram only: "the
 * code was sent as a Telegram service notification to all other logged-in
 * sessions" (core.telegram.org/api/auth). A person whose account is signed in
 * nowhere else gets nothing, and `next_type` is usually absent. The screen has
 * to be able to say that instead of offering a button that cannot help.
 *
 * Everything here reads `className` strings rather than `instanceof Api.*`, so
 * the mapping is checked without `telegram` loaded and without a network.
 */

export type DeliveryKind =
  | 'app'
  | 'sms'
  | 'call'
  | 'missed_call'
  | 'email'
  | 'email_setup'
  | 'fragment'
  | 'unknown'

export type NextKind = 'sms' | 'call' | 'missed_call' | 'fragment'

export interface CodeDelivery {
  /** Where this code went. */
  delivery: DeliveryKind
  /** Digits in the code, when Telegram says. */
  length?: number
  /** Masked login email ("d***@gmail.com"), only for `delivery: 'email'`. */
  emailPattern?: string
  /**
   * The channel `auth.resendCode` would use. `null` means Telegram offers no
   * other channel for this number: a resend would fail with
   * SEND_CODE_UNAVAILABLE, so the screen must not promise one.
   */
  next: NextKind | null
  /** Seconds Telegram asks to wait before a resend; absent when it did not say. */
  timeout?: number
}

const DELIVERY_BY_CLASS: Record<string, DeliveryKind> = {
  'auth.SentCodeTypeApp': 'app',
  'auth.SentCodeTypeSms': 'sms',
  // Official-app SMS flavours. A third-party api_id does not receive them, but
  // if one ever arrives the code is still in the person's SMS inbox.
  'auth.SentCodeTypeFirebaseSms': 'sms',
  'auth.SentCodeTypeSmsWord': 'sms',
  'auth.SentCodeTypeSmsPhrase': 'sms',
  'auth.SentCodeTypeCall': 'call',
  // Both need `allow_flashcall` / `allow_missed_call` in CodeSettings, which we
  // never set. Mapped for completeness: the person is told to watch for a call.
  'auth.SentCodeTypeFlashCall': 'missed_call',
  'auth.SentCodeTypeMissedCall': 'missed_call',
  'auth.SentCodeTypeEmailCode': 'email',
  'auth.SentCodeTypeSetUpEmailRequired': 'email_setup',
  'auth.SentCodeTypeFragmentSms': 'fragment',
}

const NEXT_BY_CLASS: Record<string, NextKind> = {
  'auth.CodeTypeSms': 'sms',
  'auth.CodeTypeCall': 'call',
  'auth.CodeTypeFlashCall': 'missed_call',
  'auth.CodeTypeMissedCall': 'missed_call',
  'auth.CodeTypeFragmentSms': 'fragment',
}

/**
 * Turn an `auth.sentCode` into what the screen needs, plus the hash.
 *
 * An unknown delivery class becomes `'unknown'` rather than `'sms'`: a new
 * Telegram type must not be reported as a channel we merely assumed.
 */
export function describeSentCode(
  sent: any
): CodeDelivery & { phoneCodeHash: string } {
  if (sent?.className === 'auth.SentCodeSuccess') {
    // Only happens with future-auth tokens, which we do not send. If Telegram
    // ever answers this way there is no code to type and no hash to keep.
    throw new Error(
      'Telegram signed the session in without a code; start the login again'
    )
  }
  if (sent?.className !== 'auth.SentCode' || !sent.phoneCodeHash) {
    throw new Error('Telegram did not confirm that a code was sent')
  }
  const out: CodeDelivery & { phoneCodeHash: string } = {
    phoneCodeHash: String(sent.phoneCodeHash),
    delivery: DELIVERY_BY_CLASS[String(sent.type?.className)] ?? 'unknown',
    next: NEXT_BY_CLASS[String(sent.nextType?.className)] ?? null,
  }
  const length = Number(sent.type?.length)
  if (Number.isInteger(length) && length > 0) out.length = length
  if (out.delivery === 'email' && sent.type?.emailPattern) {
    out.emailPattern = String(sent.type.emailPattern)
  }
  const timeout = Number(sent.timeout)
  if (Number.isFinite(timeout) && timeout > 0) out.timeout = timeout
  return out
}

/**
 * `auth.sendCode`, raw, so the whole answer survives.
 *
 * `AUTH_RESTART` is retried once, exactly as GramJS's own helper does: Telegram
 * sends it when the half-open authorization has to begin again, and the second
 * call is the documented reaction. DC migration needs nothing here --
 * `client.invoke` switches DC on PHONE_MIGRATE by itself.
 *
 * `telegram` is imported inside the function for the reason the rest of
 * tg-connect does it: the module stays loadable without the package present.
 */
export async function requestCode(
  client: any,
  phone: string
): Promise<CodeDelivery & { phoneCodeHash: string }> {
  const { Api } = await import('telegram')
  const build = () =>
    new Api.auth.SendCode({
      phoneNumber: phone,
      apiId: client.apiId,
      apiHash: client.apiHash,
      settings: new Api.CodeSettings({}),
    })
  let sent: unknown
  try {
    sent = await client.invoke(build())
  } catch (e) {
    if (!/AUTH_RESTART/.test(String((e as any)?.errorMessage ?? e))) throw e
    sent = await client.invoke(build())
  }
  return describeSentCode(sent)
}

/** `auth.resendCode`: the same login attempt, through Telegram's next channel. */
export async function requestResend(
  client: any,
  phone: string,
  phoneCodeHash: string
): Promise<CodeDelivery & { phoneCodeHash: string }> {
  const { Api } = await import('telegram')
  const sent = await client.invoke(
    new Api.auth.ResendCode({ phoneNumber: phone, phoneCodeHash })
  )
  return describeSentCode(sent)
}
