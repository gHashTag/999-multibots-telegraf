/**
 * WHAT A GRAMJS ERROR ACTUALLY SAYS.
 *
 * gramjs does not keep Telegram's code in `message`. An RPCError's message is
 * "<http code>: <CODE> (caused by ...)" with the bare code in `errorMessage`,
 * and the classes it knows rewrite `message` entirely: FloodWaitError reads
 * "A wait of N seconds is required" and carries the number in `.seconds`
 * (node_modules/telegram/errors/RPCErrorList.js). A pattern written against
 * "FLOOD_WAIT_N" therefore never matched a real flood. Both readers below look
 * at every field the error has.
 */

/** Every field a gramjs error spreads its meaning over, joined. */
export function telegramErrorText(e: unknown): string {
  if (!(e instanceof Error)) return String(e)
  const code = (e as { errorMessage?: unknown }).errorMessage
  return typeof code === 'string' && !e.message.includes(code)
    ? `${code} ${e.message}`
    : e.message
}

/**
 * The login itself is gone: the key was dropped, the session was revoked from
 * another device, the key is used twice, or the account is deactivated.
 * Reconnecting is the only cure. Anything else -- a timeout, a dropped socket,
 * a busy data centre -- is not a reason to send a person to log in again.
 */
const DEAD_SESSION =
  /AUTH_KEY_UNREGISTERED|SESSION_REVOKED|AUTH_KEY_DUPLICATED|USER_DEACTIVATED(?:_BAN)?|SESSION_EXPIRED/

export function isDeadSession(e: unknown): boolean {
  return DEAD_SESSION.test(telegramErrorText(e))
}

/** The short code worth naming next to a temporary failure (no request tail). */
export function shortTelegramCode(e: unknown): string {
  const code = (e as { errorMessage?: unknown })?.errorMessage
  if (typeof code === 'string' && code) return code
  const raw = telegramErrorText(e)
  return (/[A-Z][A-Z0-9_]{3,}/.exec(raw)?.[0] ?? raw).slice(0, 60)
}

/** Seconds Telegram asked us to wait, or null when this is not a wait. */
export function telegramWaitSeconds(e: unknown): number | null {
  const s = (e as { seconds?: unknown })?.seconds
  if (typeof s === 'number' && Number.isFinite(s)) return s
  const raw = telegramErrorText(e)
  const m =
    /(?:FLOOD|SLOWMODE)_WAIT_(\d+)/i.exec(raw) ??
    /A wait of (\d+) seconds is required/i.exec(raw)
  return m ? Number(m[1]) : null
}
