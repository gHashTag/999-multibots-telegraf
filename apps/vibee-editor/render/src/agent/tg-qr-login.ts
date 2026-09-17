/**
 * QR LOGIN: THE ONE WAY IN THAT DOES NOT DEPEND ON A CODE ARRIVING.
 *
 * The owner, 2026-09-16 and 17: two days on the code screen. Every request
 * reached Telegram, Telegram answered "sent to the app" every time, and no
 * message ever came -- not after the resend was fixed, not after the service
 * chat was unblocked. From our side it cannot be told apart whether the typed
 * number belongs to another of his accounts or Telegram is quietly dropping
 * codes for a third-party api_id (octopot/indexit#79 documents exactly that,
 * and QR login was the only thing that worked there). QR login removes both
 * questions: no number is typed, no code is delivered. The account that scans
 * is the account that connects, and the approval happens inside the official
 * app, on Telegram's own confirmation screen.
 *
 * ── THE PROTOCOL, AS GRAMJS ITSELF WALKS IT (client/auth.js) ───────────────
 *
 *   auth.exportLoginToken            -> auth.loginToken { token, expires }
 *   show  tg://login?token=<base64url(token)>  as a QR code
 *   the phone scans it (Settings > Devices > Link Desktop Device)
 *   we receive updateLoginToken, and ask again:
 *   auth.exportLoginToken            -> auth.loginTokenSuccess
 *                                    |  auth.loginTokenMigrateTo { dc_id, token }
 *                                         -> switch DC, auth.importLoginToken
 *                                    |  SESSION_PASSWORD_NEEDED -> 2FA password
 *
 * GramJS wraps this in one long promise with callbacks, which suits a terminal
 * and not an HTTP screen that polls. So the steps are taken apart here: one
 * call begins, one call advances, and the state between them is a plain object
 * kept with the rest of the login attempt.
 *
 * ── WHY TELEGRAM IS NOT ASKED ON EVERY POLL ────────────────────────────────
 *
 * The screen polls every couple of seconds for ten minutes. Forwarding each
 * poll to Telegram would be three hundred auth calls per login, and a flood
 * wait for the person who needs it least. `advanceQr` talks to Telegram only
 * when there is something to learn: the phone has accepted (the update said
 * so) or the token on screen has run out and a fresh one is needed.
 *
 * Everything reads `className` strings rather than `instanceof Api.*`, like
 * tg-code-delivery.ts, so the rules are checked without a network.
 */

/** A token is refreshed this long BEFORE it expires: a QR that dies mid-scan */
/** sends the person back to the start for no reason they can see. */
const REFRESH_MARGIN_MS = 3_000

export interface QrState {
  token: Uint8Array
  /** Unix seconds, as Telegram gives it. */
  expires: number
  /** The phone has accepted: set by the update handler, read by the poll. */
  accepted: boolean
  /** 2FA stands between the scan and the session; polls stop asking Telegram. */
  passwordNeeded: boolean
  /**
   * A question to Telegram is in flight. The screen polls every two seconds
   * and finishing a login takes longer than that (a DC switch alone is three
   * or four): without this, a second poll would export, switch and import on
   * the same client in the middle of the first one doing it.
   */
  busy: boolean
}

export interface QrAccount {
  id: string
  username?: string
  firstName?: string
  /** With the leading plus, the way the rest of tg-connect stores it. */
  phone?: string
}

export type QrStep =
  | { state: 'waiting'; url: string; expires: number }
  | { state: 'password' }
  | { state: 'done'; account: QrAccount }

/** What a logged-in Telegram app expects to find inside the QR code. */
export function loginUrl(token: Uint8Array): string {
  return `tg://login?token=${Buffer.from(token).toString('base64url')}`
}

/** The account that scanned, as far as the authorization tells. */
export function accountOf(user: any): QrAccount {
  const account: QrAccount = { id: String(user?.id ?? '') }
  if (user?.username) account.username = String(user.username)
  if (user?.firstName) account.firstName = String(user.firstName)
  const digits = String(user?.phone ?? '').replace(/\D/g, '')
  if (digits) account.phone = `+${digits}`
  return account
}

function isPasswordNeeded(e: unknown): boolean {
  return /SESSION_PASSWORD_NEEDED/.test(String((e as any)?.errorMessage ?? e))
}

async function exportToken(client: any): Promise<any> {
  const { Api } = await import('telegram')
  return client.invoke(
    new Api.auth.ExportLoginToken({
      apiId: Number(client.apiId),
      apiHash: client.apiHash,
      exceptIds: [],
    })
  )
}

/**
 * Begin: the first token, and an ear for the phone's answer.
 *
 * The handler is registered BEFORE the token is requested. The other order
 * leaves a window in which a very fast scan is accepted and the update that
 * says so has nobody listening -- the screen would then sit on a used token
 * until it expired.
 */
export async function beginQr(client: any): Promise<QrState> {
  const qr: QrState = {
    token: new Uint8Array(),
    expires: 0,
    accepted: false,
    passwordNeeded: false,
    busy: false,
  }
  client.addEventHandler((update: any) => {
    if (update?.className === 'UpdateLoginToken') qr.accepted = true
  })
  const first = await exportToken(client)
  if (first?.className !== 'auth.LoginToken' || !first.token?.length) {
    throw new Error('Telegram did not issue a login token')
  }
  qr.token = first.token
  qr.expires = Number(first.expires)
  return qr
}

function success(result: any): QrStep {
  const user = result?.authorization?.user
  if (!user?.id) {
    // auth.authorizationSignUpRequired lands here: the number has no account.
    throw new Error('Telegram accepted the scan but returned no account')
  }
  return { state: 'done', account: accountOf(user) }
}

/**
 * Advance: answer the screen's poll, asking Telegram only when it matters.
 *
 * `now` is passed in so the expiry rule is checked on the same clock the test
 * sets, not on whatever the machine running it says.
 */
export async function advanceQr(
  client: any,
  qr: QrState,
  now: number
): Promise<QrStep> {
  if (qr.passwordNeeded) return { state: 'password' }

  const fresh = now < qr.expires * 1000 - REFRESH_MARGIN_MS
  if (qr.busy || (!qr.accepted && fresh)) {
    return { state: 'waiting', url: loginUrl(qr.token), expires: qr.expires }
  }

  qr.busy = true
  try {
    const result = await exportToken(client)
    if (result?.className === 'auth.LoginTokenSuccess') return success(result)
    if (result?.className === 'auth.LoginTokenMigrateTo') {
      /*
       * The account lives on another data center (the owner's is on DC2, a
       * fresh client starts on DC4). The token only finishes the login THERE:
       * same two steps GramJS takes, in the same order.
       */
      const { Api } = await import('telegram')
      await client._switchDC(result.dcId)
      const moved = await client.invoke(
        new Api.auth.ImportLoginToken({ token: result.token })
      )
      if (moved?.className === 'auth.LoginTokenSuccess') return success(moved)
      throw new Error(
        `Telegram answered ${String(moved?.className)} to the migrated token`
      )
    }
    if (result?.className === 'auth.LoginToken' && result.token?.length) {
      // Not accepted after all, or the old token ran out: show the new one.
      qr.token = result.token
      qr.expires = Number(result.expires)
      qr.accepted = false
      return { state: 'waiting', url: loginUrl(qr.token), expires: qr.expires }
    }
    throw new Error(
      `Telegram answered ${String(result?.className)} to the scan`
    )
  } catch (e) {
    if (isPasswordNeeded(e)) {
      qr.passwordNeeded = true
      return { state: 'password' }
    }
    throw e
  } finally {
    qr.busy = false
  }
}
