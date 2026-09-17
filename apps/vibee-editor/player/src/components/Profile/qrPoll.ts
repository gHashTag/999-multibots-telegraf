/**
 * WAITING FOR THE SCAN, ONE QUESTION AT A TIME.
 *
 * The QR screen asks the server "has the phone answered?" until it has. Two
 * rules make that safe, and both are easy to lose inside a `setInterval`:
 *
 *  - never two questions at once. Finishing a login takes the server longer
 *    than the pause between polls (a data-center switch alone is three or four
 *    seconds), and an interval would fire the next poll into the middle of it.
 *    Here the next wait starts only after the previous answer has arrived.
 *
 *  - a dropped connection is not the end of the login. A phone in a lift loses
 *    one request; the token on screen is still good and the person is still
 *    holding the camera over it. Only the server saying the attempt is gone
 *    ends it.
 *
 * The clock, the request and "is the screen still there" are passed in, so the
 * loop is checked without timers, fetch or React.
 */

export const QR_POLL_MS = 2000

export interface QrAccountSeen {
  username?: string
  firstName?: string
  phoneEnding?: string
}

export type QrPollEnd =
  | { kind: 'connected'; account?: QrAccountSeen }
  | { kind: 'password' }
  | { kind: 'gone'; message: string }
  | { kind: 'left' }

export async function runQrPoll(opts: {
  poll: () => Promise<Record<string, unknown>>
  wait: (ms: number) => Promise<void>
  /** False once the person has left the QR screen. */
  alive: () => boolean
  /** The token on screen changes about every thirty seconds. */
  onUrl: (url: string) => void
  onTransientError: (message: string) => void
  /** Does this error mean the server no longer has the attempt? */
  isGone: (message: string) => boolean
}): Promise<QrPollEnd> {
  while (opts.alive()) {
    await opts.wait(QR_POLL_MS)
    if (!opts.alive()) break
    let answer: Record<string, unknown>
    try {
      answer = await opts.poll()
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (opts.isGone(message)) return { kind: 'gone', message }
      if (opts.alive()) opts.onTransientError(message)
      continue
    }
    if (!opts.alive()) break
    if (answer['подключено']) {
      return {
        kind: 'connected',
        account: (answer.account as QrAccountSeen | undefined) ?? undefined,
      }
    }
    if (answer['нужен_пароль']) return { kind: 'password' }
    if (typeof answer.url === 'string' && answer.url) opts.onUrl(answer.url)
  }
  return { kind: 'left' }
}

/** How the connected account is named on screen: the handle people recognise */
/** themselves by, then the name, then at least how the number ends. */
export function accountLabel(a: QrAccountSeen | null | undefined): string {
  if (!a) return ''
  const name = a.username ? `@${a.username}` : (a.firstName ?? '')
  const ending = a.phoneEnding ? `···${a.phoneEnding}` : ''
  return [name, ending].filter(Boolean).join(' ')
}
