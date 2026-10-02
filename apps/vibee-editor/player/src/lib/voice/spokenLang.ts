/**
 * WHICH LANGUAGE IS BEING SPOKEN, so the transcriber need not work it out.
 *
 * Measured in the whisper pod on 2026-10-02: a 2.7 s Russian phrase took
 * 5.5 s to transcribe when whisper had to detect the language and 3.2 s when
 * it was told. Detection is a second pass over the audio, paid on every
 * phrase -- so a session learns the language once and names it after that.
 *
 * Naming the WRONG language is worse than naming none: whisper then writes
 * English speech out as Russian words. So the guess is cautious (a mixed or
 * too-short transcript teaches nothing), the session seeds it only when the
 * app and the browser agree, and every few phrases it listens without a hint
 * again (RELEARN_EVERY) so somebody who switches language is caught up.
 */
import type { Language } from '@/atoms/language'

/** One phrase in this many is transcribed without a hint, to re-check. */
export const RELEARN_EVERY = 6

const CYRILLIC = /[\u0400-\u04ff]/g
const LATIN = /[A-Za-z]/g

/** The language a transcript is written in, or null when it is not clear. */
export function guessSpokenLang(text: string): Language | null {
  const cyr = (text.match(CYRILLIC) || []).length
  const lat = (text.match(LATIN) || []).length
  if (cyr + lat < 3) return null
  // Russian speech routinely carries Latin names ("open Zoom"); English
  // speech carries no Cyrillic at all.
  if (cyr >= lat * 2) return 'ru'
  if (cyr === 0) return 'en'
  return null
}

/**
 * The voice to read a sentence with. Looser than guessSpokenLang on purpose,
 * and lopsided: a Russian voice reading "Google Docs" stays understandable,
 * an English voice reading Russian is noise -- so ANY Cyrillic makes it
 * Russian. Null when the sentence has no letters at all ("42.", an emoji).
 */
export function sentenceLang(text: string): Language | null {
  if (/[\u0400-\u04ff]/.test(text)) return 'ru'
  if (/[A-Za-z]/.test(text)) return 'en'
  return null
}

/**
 * The language to assume before anything was heard: the app's own, but only
 * when the browser's first language says the same.
 */
export function seedSpokenLang(
  ui: Language,
  browser: readonly string[] | undefined
): Language | null {
  const first = (browser?.[0] || '').slice(0, 2).toLowerCase()
  return first === ui ? ui : null
}
