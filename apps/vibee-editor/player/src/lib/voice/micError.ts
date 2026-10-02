/**
 * WHY THE MICROPHONE DID NOT OPEN -- IN WORDS THAT SAY WHAT TO DO.
 *
 * "No access to the microphone" was the one answer to five different causes,
 * and for four of them the advice it gave ("allow it in the browser") was
 * wrong: a phone with no microphone, a microphone held by a call in another
 * app, and a WebView that has no microphone API at all cannot be fixed by
 * allowing anything. getUserMedia names the cause in `error.name`; this reads
 * it.
 */

export type MicErrorKey =
  | 'voice.error.mic'
  | 'voice.error.mic.denied'
  | 'voice.error.mic.none'
  | 'voice.error.mic.busy'
  | 'voice.error.mic.unsupported'

/**
 * @param err what getUserMedia threw (or rejected with)
 * @param hasApi whether this window has navigator.mediaDevices.getUserMedia
 *   at all: a WebView or a page over plain http does not, and then the
 *   TypeError thrown by calling it says nothing useful.
 */
export function micErrorKey(err: unknown, hasApi: boolean): MicErrorKey {
  if (!hasApi) return 'voice.error.mic.unsupported'
  const name =
    err && typeof err === 'object' && 'name' in err
      ? String((err as { name: unknown }).name)
      : ''
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'voice.error.mic.denied'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'voice.error.mic.none'
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'voice.error.mic.busy'
    default:
      return 'voice.error.mic'
  }
}

/** Every key above is a microphone failure: the overlay offers the way out. */
export function isMicError(key: string | null | undefined): boolean {
  return !!key && key.startsWith('voice.error.mic')
}

/**
 * The words to show for an error. Inside Telegram there is no address bar
 * and no lock icon to tap, so "allow it for this site" is advice that cannot
 * be followed: a refusal there is Telegram's (or the phone's) and the way out
 * is the phone's settings or the browser. A missing or busy microphone is the
 * same everywhere and keeps its own words.
 */
export function micErrorText(key: string, inTelegram: boolean): string {
  if (!inTelegram || !isMicError(key)) return key
  if (key === 'voice.error.mic.none' || key === 'voice.error.mic.busy')
    return key
  return 'voice.mic.inTelegram'
}

export function hasMicApi(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  )
}
