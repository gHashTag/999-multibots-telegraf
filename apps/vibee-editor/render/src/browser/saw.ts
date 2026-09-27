/**
 * WHAT THE AGENT SAW WHEN IT ERRED.
 *
 * On 2026-09-22 the agent told the owner the screen showed "the Queen's board
 * with task cards" while it showed a Google sign-in (journal.ts tells that
 * story too). The journal already holds every step, errors included -- but
 * finding the mismatch meant scrolling fifty rows and guessing which *look*
 * came before which *error*. This pairs them: for each failed step, the last
 * thing the agent actually looked at before it, and how long before.
 *
 * A DERIVED VIEW, NOT A NEW RECORD. It writes nothing and reads nothing new --
 * it is a pure function over the journal rows readJournal already returns
 * (newest first). So it survives a deploy exactly as far as the journal does,
 * and it is tested directly, without a database.
 *
 * WHERE "SAW" COMES FROM. Only the two tools that put a page in front of the
 * agent: browser_read (an address and a title) and browser_screenshot (the
 * short line of what was on screen). A click or a type is an action, not a
 * look, so it is never the answer to "what did it see".
 *
 * THE THIRD OUTCOME IS KEPT. An error with no look before it gets `saw: null`
 * -- "nothing was looked at", which is a different fact from "it looked and
 * saw nothing". We never invent a blank observation to fill the field.
 */
import type { JournalRow } from './journal'

/** The one look that best explains an error: absent when there was none. */
export interface Saw {
  /** browser_read or browser_screenshot -- how the agent looked. */
  tool: string
  /** When that look happened (ISO). */
  at: string
  /** How long before the error the look was, in ms (>= 0). */
  agoMs: number
  /** browser_read: the address, query and fragment already stripped. */
  url?: string | null
  /** browser_read: the page's title. */
  title?: string | null
  /** browser_screenshot: the short line of what was on screen. */
  seen?: string | null
}

export interface ErrorMoment {
  /** When the failing step ran (ISO). */
  at: string
  /** The tool that failed. */
  tool: string
  /** The sanitised error message the journal kept; '' when it kept none. */
  error: string
  /** The last look before the error, or null when nothing was looked at. */
  saw: Saw | null
}

/* The only tools that count as the agent looking at a page. */
const LOOKED = new Set(['browser_read', 'browser_screenshot'])

/** A look with actual content behind it -- not a read that itself came back empty. */
function lookOf(row: JournalRow): Omit<Saw, 'at' | 'agoMs'> | null {
  const d = row.detail ?? {}
  if (row.tool === 'browser_read') {
    if (d.url == null && d.title == null) return null
    return {
      tool: row.tool,
      url: (d.url as string | null) ?? null,
      title: (d.title as string | null) ?? null,
    }
  }
  if (row.tool === 'browser_screenshot') {
    if (d.seen == null) return null
    return { tool: row.tool, seen: (d.seen as string | null) ?? null }
  }
  return null
}

/**
 * The error moments in `rows`, newest first (the order readJournal returns).
 * For each failed step, the nearest look BEFORE it in time -- which, in a
 * newest-first list, is the next row that looked at something.
 */
export function sawAtErrors(rows: JournalRow[]): ErrorMoment[] {
  const out: ErrorMoment[] = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (row.ok) continue
    let saw: Saw | null = null
    for (let j = i + 1; j < rows.length; j++) {
      if (!LOOKED.has(rows[j].tool)) continue
      const look = lookOf(rows[j])
      if (!look) continue
      const agoMs = Math.max(
        0,
        new Date(row.at).getTime() - new Date(rows[j].at).getTime()
      )
      saw = { ...look, at: rows[j].at, agoMs }
      break
    }
    out.push({
      at: row.at,
      tool: row.tool,
      error:
        typeof row.detail?.error === 'string'
          ? (row.detail.error as string)
          : '',
      saw,
    })
  }
  return out
}
