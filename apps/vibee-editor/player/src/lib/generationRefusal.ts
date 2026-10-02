/**
 * WHAT A FAILED GENERATION SAYS, IN THE READER'S LANGUAGE.
 *
 * `generateApi` used to put the whole response body into `error`, so the
 * panel showed `{"success":false,"error":"no image provider delivered: ..."}`
 * -- braces, quotes and a provider's English, to a Russian reader as much as
 * an English one.
 *
 * Since 2026-10-02 the server names every failure with a `code`
 * (render/generation-refusal.ts). The reader gets the sentence for the code
 * first; the server's own words follow as a second line, because they are the
 * diagnosis ("the ElevenLabs key is an identifier, not a key") and a person
 * reporting a problem needs them. When those words are Russian, the reader
 * is Russian and the failure is the caller's to fix (a 4xx), they are the
 * most precise sentence there is ("need 20, have 16"), so they stand alone.
 * Only Russian: the server writes its sentences for people in Russian, and
 * its English is a developer's line ("unauthorized: <reason>", "verified
 * owner required") -- passed alone, it hid "sign in again" from every
 * English reader with an expired session. The codes are checked against the
 * server by
 * `generation-refusal-codes.test.ts` in render.
 */
import type { Language } from '@/atoms/language'

export const GENERATION_REFUSALS: Record<string, { en: string; ru: string }> = {
  bad_input: {
    en: 'Something is missing in the request — check the fields',
    ru: 'В запросе чего-то не хватает — проверь поля', // cyrillic-ok: the russian sentence
  },
  sign_in: {
    en: 'Sign in again to generate',
    ru: 'Войди заново, чтобы генерировать', // cyrillic-ok: the russian sentence
  },
  not_enough_tokens: {
    en: 'Not enough tokens — top up to continue',
    ru: 'Не хватает токенов — пополни баланс', // cyrillic-ok: the russian sentence
  },
  forbidden: {
    en: "This model isn't available to your account",
    ru: 'Эта модель недоступна для твоего аккаунта', // cyrillic-ok: the russian sentence
  },
  unavailable: {
    en: 'The service is busy — try again in a minute',
    ru: 'Сервис занят — попробуй через минуту', // cyrillic-ok: the russian sentence
  },
  too_long: {
    en: 'Too long for this model — trim it and try again',
    ru: 'Слишком длинно для этой модели — обрежь и попробуй снова', // cyrillic-ok: the russian sentence
  },
  generation_failed: {
    en: "The generation didn't go through — try again or pick another model",
    ru: 'Генерация не получилась — попробуй ещё раз или другую модель', // cyrillic-ok: the russian sentence
  },
}

/** Codes for failures the caller can fix; their detail may stand alone. */
const CALLERS_TO_FIX = new Set([
  'bad_input',
  'sign_in',
  'not_enough_tokens',
  'forbidden',
  'too_long',
])

const DETAIL_MAX = 200

export interface Refusal {
  code?: string
  /** The server's own words, never a raw JSON body. */
  detail: string
}

/**
 * Read a failed response body. JSON gives `code` and `error` (+ `detail`).
 * Plain text is kept as the detail; markup (a proxy's HTML error page) is
 * dropped -- a page of tags is not something to show a person.
 */
export function readRefusal(body: string): Refusal {
  try {
    const o = JSON.parse(body)
    if (o && typeof o === 'object') {
      const error = typeof o.error === 'string' ? o.error : ''
      const extra = typeof o.detail === 'string' ? o.detail : ''
      return {
        code: typeof o.code === 'string' ? o.code : undefined,
        detail: extra ? `${error}: ${extra}` : error,
      }
    }
  } catch {
    // Not JSON.
  }
  const text = body.trim()
  return { detail: text.startsWith('<') ? '' : text }
}

const cyrillic = /\p{Script=Cyrillic}/u

export function generationRefusalText(r: Refusal, lang: Language): string {
  const ru = lang === 'ru'
  const detail = r.detail.trim().slice(0, DETAIL_MAX)
  const known = r.code ? GENERATION_REFUSALS[r.code] : undefined
  if (
    detail &&
    ru &&
    r.code &&
    CALLERS_TO_FIX.has(r.code) &&
    cyrillic.test(detail)
  )
    return detail
  const headline = known
    ? known[ru ? 'ru' : 'en']
    : ru
      ? 'Не получилось — попробуй ещё раз' // cyrillic-ok: the russian branch
      : "It didn't work — try again"
  return detail ? `${headline}\n${detail}` : headline
}
