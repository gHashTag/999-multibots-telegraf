/**
 * CARLOS'S HYPOTHESIS, WITH A TEST ATTACHED.
 *
 * A reader on X told the owner on 2026-09-23 that posts carrying an
 * external link reach fewer people on X, and that a thread -- words first,
 * link in the post below -- does better. He called it possibly superstition
 * and asked for a test. The owner promised him the numbers either way.
 *
 * A promise like that is worth nothing without a record, so every share
 * writes down HOW it was posted and WHEN, and the reach of each post is
 * filled in later by the person or the agent reading it off X. Nothing here
 * estimates or models anything: a row with no number is an unanswered
 * question, and it says so.
 *
 * The comparison is deliberately crude and honest: the median reach of the
 * threads against the median of the single posts, only when there are at
 * least three of each. Fewer than that is not a result, and saying so is the
 * whole point of writing it down.
 */
export type Shape = 'thread' | 'single'

export interface Posted {
  slug: string
  shape: Shape
  at: string
  /** Views, as X reports them; null until somebody reads it off. */
  reach: number | null
}

/** How many of each shape before the comparison means anything. */
export const ENOUGH = 3

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  const half = Math.floor(s.length / 2)
  return s.length % 2 ? s[half] : Math.round((s[half - 1] + s[half]) / 2)
}

export interface Verdict {
  threads: number
  singles: number
  medianThread: number | null
  medianSingle: number | null
  /** What can honestly be said today. */
  says: string
}

/** What the numbers say so far. Pure. */
export function whatTheNumbersSay(posts: Posted[]): Verdict {
  const measured = posts.filter(
    p => typeof p.reach === 'number' && Number.isFinite(p.reach)
  )
  const threads = measured.filter(p => p.shape === 'thread')
  const singles = measured.filter(p => p.shape === 'single')
  const medianThread = threads.length
    ? median(threads.map(p => p.reach as number))
    : null
  const medianSingle = singles.length
    ? median(singles.map(p => p.reach as number))
    : null
  if (threads.length < ENOUGH || singles.length < ENOUGH) {
    return {
      threads: threads.length,
      singles: singles.length,
      medianThread,
      medianSingle,
      says:
        `Пока нечего сравнивать: ${threads.length} тредов и ` + // cyrillic-ok: shown to the owner
        `${singles.length} одиночных постов с числами, нужно хотя бы по ${ENOUGH}.`, // cyrillic-ok
    }
  }
  const t = medianThread as number
  const s = medianSingle as number
  const diff = s === 0 ? 0 : Math.round(((t - s) / s) * 100)
  return {
    threads: threads.length,
    singles: singles.length,
    medianThread,
    medianSingle,
    says:
      `Медиана охвата: тред ${t}, одиночный пост ${s} ` + // cyrillic-ok
      `(${diff >= 0 ? '+' : ''}${diff}%), по ${threads.length} и ${singles.length} постам.`, // cyrillic-ok
  }
}
