/**
 * EVERY BOT ERROR REACHES THE HIVE, ROLLED UP RATHER THAN POURED IN.
 *
 * Owner, 2026-09-20: "all the bots' error logs must reach the board, with top
 * priority". They did not reach it at all. An error went two places: a line in
 * the Railway log, which nobody reads, and -- for the errors that survive the
 * alert throttle -- a push to the owner's phone. Neither is a record. Nothing
 * could answer "what has been breaking this week", because nothing kept it.
 *
 * ── WHY A ROLL-UP AND NOT ONE NOTE PER ERROR ───────────────────────────────
 *
 * One note per error is the obvious design and it is wrong here for a reason
 * this journal has already paid for twice. A single broken dependency in a
 * shared handler fails on EVERY update: at one note each, a quiet week and a
 * storm look the same in the journal -- a wall -- and the storm buries the one
 * unrelated failure that mattered. So errors are counted by signature inside a
 * window and written as one line: how many, of how many kinds, and the worst
 * few by name.
 *
 * The signature is the alert throttle's own `fingerprint` (alertThrottle.ts),
 * so "one incident" means the same thing here as it does in the push the owner
 * gets. Two definitions of sameness would disagree exactly when it matters.
 *
 * ── WHY IT DOES NOT SPEAK WHEN THERE IS NOTHING ────────────────────────────
 *
 * A window with no errors writes nothing. That is the opposite of the money
 * watches, which say "I looked and found nothing" precisely because their
 * silence is ambiguous -- and it is right here for the opposite reason: this
 * collector is armed by the logger itself, so it cannot be alive-but-silent
 * unless the whole process is down, and a process that is down is visible from
 * ten other places.
 *
 * ── WHAT NEVER GOES IN ─────────────────────────────────────────────────────
 *
 * The text is redacted (a provider error can quote the key it was called with)
 * and carries no telegram id, no @handle and no message text. A journal line is
 * read by the owner and by the agent; it says what is broken, not who was
 * unlucky enough to hit it.
 */
import { fingerprint } from '@/utils/alertThrottle'

/** How long a window lasts before it is written. */
export const WINDOW_MS = 10 * 60_000

/**
 * How many distinct signatures are held at once.
 *
 * A storm invents new signatures faster than a window closes -- every
 * `fingerprint` keeps the prose, so twenty different provider messages are
 * twenty keys. Beyond the cap the counting continues but the names stop being
 * kept: the line would only have room for the worst few anyway, and unbounded
 * memory in a process that serves every bot is a worse bug than a lost name.
 */
export const MAX_SIGNATURES = 200

/** How many are named in the line. The rest are counted into "and N more". */
const NAMED = 3

/**
 * THE REAL CAP IS 200, NOT 300.
 *
 * The note route slices `what` at 300 and `record` slices it again at 200
 * before the INSERT, so 200 is what the journal keeps. Everything in this file
 * puts the part that says something was LEFT OUT -- the "+N" -- at the end,
 * which is exactly the part a cut at 200 eats. Measured, not read off the
 * route: the two numbers disagree and only the smaller one is true.
 */
const LINE_MAX = 190

interface Tally {
  /** The message as first seen, already redacted and trimmed. */
  sample: string
  count: number
}

export interface Rolled {
  /** Total errors in the window, including the ones whose names were dropped. */
  total: number
  /** Distinct signatures counted, including the dropped ones. */
  kinds: number
  what: string
}

export class ErrorCollector {
  private tallies = new Map<string, Tally>()
  /** Errors counted after the signature cap was reached. */
  private overflow = 0
  private windowStartedAt: number | null = null

  /**
   * Count one error. Cheap on purpose: it runs inside the logger, on the path
   * of every failure, and must cost nothing worth measuring.
   */
  add(message: string, context: string | undefined, now: number): void {
    if (this.windowStartedAt === null) this.windowStartedAt = now
    const key = fingerprint(message, context)
    const seen = this.tallies.get(key)
    if (seen) {
      seen.count++
      return
    }
    if (this.tallies.size >= MAX_SIGNATURES) {
      this.overflow++
      return
    }
    this.tallies.set(key, { sample: shorten(message), count: 1 })
  }

  /** Is there something to write, and has the window closed? */
  due(now: number): boolean {
    if (this.windowStartedAt === null) return false
    return now - this.windowStartedAt >= WINDOW_MS
  }

  /** Whether anything at all has been counted since the last drain. */
  get pending(): number {
    let sum = this.overflow
    for (const t of this.tallies.values()) sum += t.count
    return sum
  }

  /**
   * Take the window and start a new one. Returns null when there is nothing,
   * so a caller can write `const r = drain(); if (r) …` without a second test
   * that could disagree with this one.
   */
  drain(): Rolled | null {
    const total = this.pending
    if (total === 0) {
      this.windowStartedAt = null
      return null
    }
    const worst = [...this.tallies.values()].sort((a, b) => b.count - a.count)
    const kinds = this.tallies.size + this.overflow

    const named: string[] = []
    let used = 0
    for (const t of worst.slice(0, NAMED)) {
      const piece = t.count > 1 ? `${t.sample} ×${t.count}` : t.sample
      if (used + piece.length > LINE_MAX - 60) break
      named.push(piece)
      used += piece.length
    }
    const rest = kinds - named.length
    const tail = rest > 0 ? `; +${rest}` : ''
    // cyrillic-ok-next-line: journal text
    const head = `${total} ошибок, видов ${kinds}: `
    const what = (head + named.join('; ') + tail).slice(0, LINE_MAX)

    this.tallies.clear()
    this.overflow = 0
    this.windowStartedAt = null
    return { total, kinds, what }
  }
}

/**
 * One line of a message, short enough that three of them fit.
 *
 * The first line only: a stack trace in a journal entry is a wall, and the
 * first line is what the alert to the owner carries too.
 */
function shorten(message: string): string {
  return String(message ?? '')
    .split('\n')[0]
    .trim()
    .slice(0, 70)
}
