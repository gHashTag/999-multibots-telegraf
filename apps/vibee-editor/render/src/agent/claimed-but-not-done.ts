/**
 * "I OPENED THE PAGE" -- WITHOUT OPENING ANYTHING.
 *
 * 2026-09-22, tri a2a: asked to sign into X, the agent answered in 11
 * seconds with zero tool calls -- and described a whole session: "opening
 * the login page", "taking a screenshot", "the Google button is in the DOM
 * at zero size". None of it happened. A client reading that would believe
 * the work was done.
 *
 * The streamed words cannot be taken back, so the turn ends with a plain
 * note saying so, stored with the answer: the person is not misled, and the
 * model sees its own mistake in the history of the next turn.
 *
 * Deliberately narrow: first-person present or past actions IN the browser.
 * "I will open", "shall I open?" and "open it yourself" are not claims.
 */

/* Claimed browser actions, as the agent says them. */
const CLAIMS: RegExp[] = [
  /(^|[\s.,:;—-])(открываю|открыл|открылась|открылся)\s+(страниц|сайт|вкладк|linkedin|x\.com|google)/i, // cyrillic-ok: matched text
  /(^|[\s.,:;—-])(делаю|сделал)\s+(снимок|скриншот)/i, // cyrillic-ok: matched text
  /(^|[\s.,:;—-])(нажимаю|нажал|жму)\s/i, // cyrillic-ok: matched text
  /(^|[\s.,:;—-])(прокручиваю|прокрутил)\s/i, // cyrillic-ok: matched text
  /(^|[\s.,:;—-])на экране (сейчас )?(вижу|видно|отображается)/i, // cyrillic-ok: matched text
  /(^|[\s.,:;—-])(ищу|нашёл|нашел) (кнопку|поле|ссылку)/i, // cyrillic-ok: matched text
  /\b(I'm |I am |I )(opening|opened|clicking|clicked|taking a screenshot|took a screenshot|scrolling|scrolled)\b/i,
]

/** Does the answer claim it acted in the browser? Pure. */
export function claimsBrowserWork(text: string): boolean {
  return CLAIMS.some(re => re.test(text))
}

/** How many browser tools the turn really called, from its events. Pure. */
export function browserCalls(events: Array<Record<string, unknown>>): number {
  return events.filter(
    e =>
      e['тип'] === 'инструмент' && // cyrillic-ok: the event envelope's field
      typeof e['имя'] === 'string' && // cyrillic-ok: the event envelope's field
      (e['имя'] as string).startsWith('browser_') // cyrillic-ok: the event envelope's field
  ).length
}

export const HONESTY_NOTE =
  '\n\n⚠️ Проверка: в этом ответе агент описал действия в браузере, но не ' + // cyrillic-ok: shown to the person
  'выполнил ни одного — ничего из описанного не произошло. Попросите его ' + // cyrillic-ok
  'повторить, и он сделает это по-настоящему.' // cyrillic-ok

/** The note to append, or '' when the answer is honest. Pure. */
export function honestyNote(
  text: string,
  events: Array<Record<string, unknown>>
): string {
  return claimsBrowserWork(text) && browserCalls(events) === 0
    ? HONESTY_NOTE
    : ''
}
