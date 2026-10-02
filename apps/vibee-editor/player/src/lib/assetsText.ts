/**
 * WHAT A FAILED /api/assets CALL SAYS, IN THE READER'S LANGUAGE.
 *
 * The avatar profile and the generation history (atoms/avatarPhotos.ts,
 * atoms/botAssets.ts) used to throw `HTTP 401 — {"error":"..."}` and show
 * the message as it came: raw JSON, in Russian, on an English screen -- the
 * person saw the server's envelope instead of a sentence.
 *
 * Since 2026-10-03 every refusal on those routes also carries a `code`. An
 * English reader gets the sentence for the code; a Russian one keeps the
 * server's own words, which are the most precise. No code, or one this file
 * does not know (an older or newer server), gives a plain "did not work" with
 * the status -- never the body. The codes are checked against the server by
 * `assets-route-codes.test.ts` in render.
 */
import type { Language } from '@/atoms/language'
import { getErrorMessage } from '@/features/script/utils/errorMessages'

/** What each server `code` means, for a reader who is not Russian. */
export const ASSET_CODES: Record<string, string> = {
  sign_in: 'Open the app from Telegram to see your files',
  bad_id: 'That file could not be found',
  bad_body: 'The request was damaged on the way — try again',
  bad_url: 'That is not a link to a file',
  not_found: 'Only photos from your own avatar profile can be removed',
  failed: "Couldn't reach your files — try again",
}

const CYRILLIC = /\p{Script=Cyrillic}/u

/** The sentence for a failed response, from its status and its raw body. */
export function assetsFailureText(
  status: number,
  body: string,
  lang: Language
): string {
  let code: unknown
  let reason: unknown
  try {
    const parsed = JSON.parse(body)
    code = parsed?.code
    reason = parsed?.error
  } catch {
    // Not JSON: a proxy page or an empty body. Neither is shown.
  }
  const text = typeof reason === 'string' ? reason : ''
  if (lang === 'ru') return text || `Не получилось (HTTP ${status})` // cyrillic-ok: the russian branch
  const known = typeof code === 'string' ? ASSET_CODES[code] : undefined
  if (known) return known
  if (text && !CYRILLIC.test(text)) return text
  return `Couldn't reach your files (HTTP ${status})`
}

/** A refusal already worded for the reader: its message is shown as it is. */
export class AssetsRefusal extends Error {}

/** Read a failed response into a refusal the atoms can throw. */
export async function assetsRefusal(
  res: Response,
  lang: Language
): Promise<AssetsRefusal> {
  const body = await res.text().catch(() => '')
  return new AssetsRefusal(assetsFailureText(res.status, body, lang))
}

/** What the atoms show: a worded refusal as it is, anything else (a dropped
 *  connection, a broken JSON reply) through the shared error wording. */
export const assetsErrorText = (e: unknown, lang: Language): string =>
  e instanceof AssetsRefusal ? e.message : getErrorMessage(e, lang)
