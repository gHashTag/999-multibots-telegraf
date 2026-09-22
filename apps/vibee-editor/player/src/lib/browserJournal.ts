/**
 * WHAT THE AGENT DID HERE, UNDER THE PICTURE.
 *
 * The render journals every browser tool call (render/src/browser/journal.ts,
 * #2789) with facts already stripped of anything private: typed text by
 * length only, addresses without their query. The Queen's board shows the
 * last steps under its window (gHashTag/trinity#1107); the app's Browser tab
 * -- the one people use from a phone -- did not. Same data, same rules.
 */
import { API_BASE } from '../config'
import { apiFetch } from '@/lib/apiFetch'

export const JOURNAL_SHOWN = 6
/**
 * How many rows are read so that, after repeats are folded, the panel still
 * has JOURNAL_SHOWN distinct lines to show.
 */
export const JOURNAL_READ = 24
export const JOURNAL_POLL_MS = 5000

export interface JournalStep {
  at: string
  tool: string
  ok: boolean
  ms: number
  detail: Record<string, unknown>
}

/** Newest first; null when it cannot be read. Never throws. */
export async function readBrowserJournal(
  limit = JOURNAL_READ
): Promise<JournalStep[] | null> {
  try {
    const a = await apiFetch<{ ok?: boolean; steps?: unknown }>(
      `${API_BASE}/api/browser/journal?limit=${limit}`
    )
    return Array.isArray(a?.steps) ? (a.steps as JournalStep[]) : null
  } catch {
    return null
  }
}

type T = (key: string) => string

/**
 * One line for a step, through the dictionary. Pure. It can only say what
 * the journal kept -- typed text never reached it.
 */
export function journalLine(
  step: JournalStep,
  t: T
): { time: string; verb: string; text: string; ok: boolean } {
  const d = step.detail ?? {}
  const key = `browser.journal.verb.${step.tool.replace(/^browser_/, '')}`
  const said = t(key)
  const verb = said && said !== key ? said : step.tool
  let text = ''
  if (typeof d.error === 'string') text = d.error
  else if (typeof d.seen === 'string') text = d.seen
  else if (d.seenPending === true) text = t('browser.journal.pending')
  else if (typeof d.url === 'string') text = d.url
  else if (typeof d.title === 'string') text = d.title
  else if (typeof d.what === 'string') text = d.what
  else if (typeof d.chars === 'number')
    text = `${d.chars} ${t('browser.journal.chars')}`
  else if (typeof d.x === 'number' && typeof d.y === 'number')
    text = `${d.x}, ${d.y}`
  else if (typeof d.pages === 'number') text = String(d.pages)
  const at = new Date(step.at)
  const pad = (n: number) => String(n).padStart(2, '0')
  const time = Number.isNaN(at.getTime())
    ? ''
    : `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`
  return { time, verb, text: text.slice(0, 140), ok: step.ok !== false }
}

/**
 * REPEATS FOLDED INTO ONE LINE.
 *
 * An agent waiting for a page looks again and again; six identical "looked"
 * lines filled the whole panel and pushed out what it did before. Steps next
 * to each other with the same tool, the same outcome and the same fact
 * become one line with a count, dated by the newest. Pure; input newest
 * first, output newest first.
 */
export interface FoldedStep extends JournalStep {
  times: number
}

export function foldRepeats(
  steps: JournalStep[],
  t: T,
  max = JOURNAL_SHOWN
): FoldedStep[] {
  const out: FoldedStep[] = []
  for (const step of steps) {
    const prev = out[out.length - 1]
    if (
      prev &&
      prev.tool === step.tool &&
      prev.ok === step.ok &&
      journalLine(prev, t).text === journalLine(step, t).text
    ) {
      prev.times += 1
      continue
    }
    if (out.length === max) break
    out.push({ ...step, times: 1 })
  }
  return out
}
