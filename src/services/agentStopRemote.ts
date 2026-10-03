/**
 * THE PRESS, SENT WHERE THE SOCKET CANNOT REACH.
 *
 * `stopOwnerRun` ends the sweep this process is running, and the aborted
 * fetch ends the render turn the person is waiting on. Between them they
 * cover every turn somebody is WATCHING -- and no others.
 *
 * The turns nobody watches are the expensive ones: the duet writes into a
 * chat of its own, an a2a call leaves its run behind it. Neither has a socket
 * to close, so neither ever saw the press. This asks the render to write the
 * stop down instead; running turns read it at their step boundary.
 *
 * Never throws. The press already did something locally, and a render that
 * did not answer must not turn a working button into an error.
 */
const BASE = 'https://vibee-render-production.up.railway.app'

/** How long one try waits; the render answers a stop in well under a second. */
export const STOP_TIMEOUT_MS = 10_000
/** One quiet second try after this pause: a deploy swap lasts a few seconds. */
export const STOP_RETRY_AFTER_MS = 3_000

/**
 * Why a stop was not written down. 'nobody' is the only one that means
 * "nothing to stop": every other reason means the render may still be
 * running a turn we could not reach, and the person must hear THAT.
 */
export type StopWhy =
  | 'written'
  | 'nobody'
  | 'noKey'
  | 'refused'
  | 'timeout'
  | 'offline'

/** What the person reads when the stop did not reach the render. */
export const STOP_NOT_SENT: Record<
  Exclude<StopWhy, 'written' | 'nobody'>,
  string
> = {
  noKey:
    '⚠️ Сервер не принял ключ бота — «Стоп» до него не дошёл, и повтор тут не поможет. Ход на сервере, если он идёт, продолжается.', // cyrillic-ok: user-facing
  refused:
    '⚠️ Сервер не записал «Стоп» (он перезапускается). Ход на сервере, если он идёт, может продолжиться — нажмите «Стоп» ещё раз через полминуты.', // cyrillic-ok: user-facing
  timeout:
    '⚠️ Сервер не ответил на «Стоп» вовремя. Ход на сервере, если он идёт, может продолжиться — нажмите «Стоп» ещё раз.', // cyrillic-ok: user-facing
  offline:
    '⚠️ Нет связи с сервером — «Стоп» не дошёл. Ход на сервере, если он идёт, может продолжиться — нажмите «Стоп» ещё раз через минуту.', // cyrillic-ok: user-facing
}

interface StopOptions {
  base?: string
  key?: string
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

/*
 * A QUIET SECOND TRY IS SAFE HERE.
 *
 * Writing a stop twice is the same stop: the render keeps one row per person
 * (agent-stops.ts), and a running turn reads "stopped" either way. So, unlike
 * a meeting snooze, a lost answer may be retried without asking. A refused
 * KEY is not retried: three seconds do not fix a wrong key.
 */
export async function requestRemoteStopWhy(
  owner: string,
  opts: StopOptions = {}
): Promise<StopWhy> {
  const id = String(owner ?? '').trim()
  if (!id) return 'nobody'
  const key = opts.key ?? process.env.RENDER_API_KEY ?? ''
  if (!key) {
    console.error('[agent-stop] RENDER_API_KEY is empty: the stop stays local')
    return 'noKey'
  }
  const send = opts.fetchImpl ?? fetch
  const once = async (): Promise<StopWhy> => {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), STOP_TIMEOUT_MS)
    try {
      const r = await send(
        `${opts.base ?? BASE}/api/agent/stop?telegram_id=${encodeURIComponent(id)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
          signal: ac.signal,
        }
      )
      if (r.ok) return 'written'
      if (r.status === 401 || r.status === 403) return 'noKey'
      return 'refused'
    } catch {
      return ac.signal.aborted ? 'timeout' : 'offline'
    } finally {
      clearTimeout(timer)
    }
  }
  const first = await once()
  if (first === 'written' || first === 'noKey') {
    if (first === 'noKey')
      console.error(
        '[agent-stop] the render refused the bot key: stop not written'
      )
    return first
  }
  await (opts.sleep ?? (ms => new Promise(r => setTimeout(r, ms))))(
    STOP_RETRY_AFTER_MS
  )
  const second = await once()
  if (second !== 'written')
    console.warn('[agent-stop] the stop did not reach the render', {
      first,
      second,
    })
  return second
}

/** The old two-word answer, kept for callers that only need yes or no. */
export async function requestRemoteStop(
  owner: string,
  opts: StopOptions = {}
): Promise<'written' | 'not written'> {
  return (await requestRemoteStopWhy(owner, opts)) === 'written'
    ? 'written'
    : 'not written'
}

/**
 * What the press answers. "Nothing to stop" is said ONLY when it is known:
 * no local run AND the render wrote the stop or there is nobody to stop for.
 * Before this, a render that never heard the press also read as "nothing to
 * stop" -- while the duet it should have ended kept spending.
 */
export function stopReply(hadLocalRun: boolean, why: StopWhy): string {
  if (hadLocalRun) return '⏹ Останавливаю — ничего не отправлю.' // cyrillic-ok: user-facing
  if (why === 'written')
    return '⏹ Принял. Если ход идёт на сервере — он прервётся.' // cyrillic-ok: user-facing
  if (why === 'nobody') return 'Сейчас нечего останавливать.' // cyrillic-ok: user-facing
  return STOP_NOT_SENT[why]
}
