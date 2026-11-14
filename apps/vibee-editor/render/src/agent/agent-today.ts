/**
 * TODAY IN THE PROMPT (spec agent-claims-honest.t27 prompt_dated, #3921).
 *
 * Owner, 2026-10-09: "a poster for the Lila game tomorrow" came out with the
 * word "TOMORROW" on it -- the agent's prompt carried no date, so "tomorrow"
 * could not become one. Now every turn that answers a person is told today's
 * date (UTC) and tomorrow's, and that a date it prints is confirmed first
 * (printed-facts.ts already refuses a date the person never said).
 */
import { promptDated } from '../spec/agent-claims-honest.logic'

/** The surfaces where a person reads the answer (the sweep is not one). */
const PEOPLE_SURFACES = ['bot', 'miniapp', 'business', 'ios']

const WEEKDAY_RU = [
  'воскресенье', // cyrillic-ok: prompt copy
  'понедельник', // cyrillic-ok: prompt copy
  'вторник', // cyrillic-ok: prompt copy
  'среда', // cyrillic-ok: prompt copy
  'четверг', // cyrillic-ok: prompt copy
  'пятница', // cyrillic-ok: prompt copy
  'суббота', // cyrillic-ok: prompt copy
]

const day = (d: Date) => d.toISOString().slice(0, 10)

/** The date line for this turn's prompt, or '' where nobody reads it. */
export function todayLine(
  surface: string | undefined,
  toolsOnly: boolean,
  now: Date = new Date()
): string {
  if (!promptDated(PEOPLE_SURFACES.includes(String(surface)) && !toolsOnly))
    return ''
  const tomorrow = new Date(now.getTime() + 86_400_000)
  return (
    `\n\nСЕГОДНЯ: ${day(now)}, ${WEEKDAY_RU[now.getUTCDay()]} (UTC). ` + // cyrillic-ok: prompt copy
    `«Завтра» — это ${day(tomorrow)}, ${WEEKDAY_RU[tomorrow.getUTCDay()]}. ` + // cyrillic-ok: prompt copy
    'На афише и в посте пиши дату числом, а не словом «завтра», и сначала ' + // cyrillic-ok: prompt copy
    'спроси человека, верна ли она.' // cyrillic-ok: prompt copy
  )
}
