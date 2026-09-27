/**
 * "I OPENED THE PAGE" -- WITHOUT OPENING ANYTHING.
 *
 * 2026-09-22, tri a2a: asked to sign into X, the agent answered in 11
 * seconds with zero tool calls -- and described a whole session: "opening
 * the login page", "taking a screenshot", "the Google button is in the DOM
 * at zero size". None of it happened. The next invented session, the same
 * day, had ONE refused click and a paragraph of "opening the page, taking a
 * screenshot, reading the page, checking the tabs" -- so each claimed action
 * is matched to the tool that would have done it, not to "any tool at all".
 *
 * The streamed words cannot be taken back, so the turn ends with a plain
 * note saying so, stored with the answer: the person is not misled, and the
 * model sees its own mistake in the history of the next turn.
 *
 * Deliberately narrow: first-person present or past actions IN the browser.
 * "I will open", "shall I open?" and "open it yourself" are not claims.
 */

/* Claimed browser actions, each with the tool(s) that would have done it. */
const CLAIMS: Array<{ re: RegExp; tools: string[] }> = [
  {
    re: /(^|[\s.,:;—-])(открываю|открыл|открылась|открылся)\s+(страниц|сайт|вкладк|linkedin|x\.com|google)/i, // cyrillic-ok: matched text
    tools: ['browser_open'],
  },
  {
    re: /(^|[\s.,:;—-])(делаю|сделал)\s+(снимок|скриншот)/i, // cyrillic-ok: matched text
    tools: ['browser_screenshot'],
  },
  {
    re: /(^|[\s.,:;—-])(читаю|прочитал)\s+(текст|страниц)/i, // cyrillic-ok: matched text
    tools: ['browser_read'],
  },
  {
    re: /(^|[\s.,:;—-])(нажимаю|нажал|жму)\s/i, // cyrillic-ok: matched text
    tools: ['browser_click'],
  },
  {
    re: /(^|[\s.,:;—-])(прокручиваю|прокрутил)\s/i, // cyrillic-ok: matched text
    tools: ['browser_evaluate', 'browser_click'],
  },
  {
    re: /(^|[\s.,:;—-])(проверяю|смотрю) (все )?вкладки/i, // cyrillic-ok: matched text
    tools: ['browser_status'],
  },
  {
    re: /(^|[\s.,:;—-])на экране (сейчас )?(вижу|видно|отображается)/i, // cyrillic-ok: matched text
    tools: ['browser_screenshot', 'browser_read'],
  },
  { re: /\b(I'm |I am |I )(opening|opened)\b/i, tools: ['browser_open'] },
  { re: /\b(I'm |I am |I )(clicking|clicked)\b/i, tools: ['browser_click'] },
  {
    re: /\b(I'm |I am |I )(taking|took) a screenshot\b/i,
    tools: ['browser_screenshot'],
  },
]

function calledTools(events: Array<Record<string, unknown>>): string[] {
  return events
    .filter(
      e => e['тип'] === 'инструмент' && typeof e['имя'] === 'string' // cyrillic-ok: the event envelope's fields
    )
    .map(e => e['имя'] as string) // cyrillic-ok: the event envelope's field
}

/** Does the answer claim it acted in the browser? Pure. */
export function claimsBrowserWork(text: string): boolean {
  return CLAIMS.some(c => c.re.test(text))
}

/** How many browser tools the turn really called, from its events. Pure. */
export function browserCalls(events: Array<Record<string, unknown>>): number {
  return calledTools(events).filter(n => n.startsWith('browser_')).length
}

/** The claimed actions no call of their own tool backs. Pure. */
export function unbackedClaims(
  text: string,
  events: Array<Record<string, unknown>>
): string[] {
  const called = new Set(calledTools(events))
  return CLAIMS.filter(c => c.re.test(text))
    .filter(c => !c.tools.some(t => called.has(t)))
    .map(c => c.tools[0])
}

/**
 * What the server log says about a flagged turn. Loop turn 6 (27.09.2026):
 * the log line carried `toolCalls: 0` written as a constant, and a turn with
 * seven calls (browser_ask_permission among them) was logged as having none
 * -- a flag nobody could tell from a false positive. The log now names the
 * claimed actions no call backed, and the browser calls the turn really made.
 * No words of the answer: they are the person's conversation. Pure.
 */
export function honestyLogFields(
  text: string,
  events: Array<Record<string, unknown>>
): { unbacked: string[]; browserCalls: number; toolCalls: number } {
  return {
    unbacked: unbackedClaims(text, events),
    browserCalls: browserCalls(events),
    toolCalls: calledTools(events).length,
  }
}

export const HONESTY_NOTE =
  '\n\n⚠️ Проверка: в этом ответе агент описал действия в браузере, но не ' + // cyrillic-ok: shown to the person
  'выполнил их — часть описанного не происходила. Попросите его ' + // cyrillic-ok
  'повторить, и он сделает это по-настоящему.' // cyrillic-ok

/** The note to append, or '' when every claimed action really ran. Pure. */
export function honestyNote(
  text: string,
  events: Array<Record<string, unknown>>
): string {
  return unbackedClaims(text, events).length ? HONESTY_NOTE : ''
}
