/**
 * VOICE ACTIVITY, judged from the mic's level alone.
 *
 * Pure: no audio graph and no clock of its own, so the session, the tests and
 * `tri vad` (scripts/vad-bench.ts, real recordings) all run the same rule.
 *
 * - The level is compared against a NOISE FLOOR: what the room sounds like
 *   when nobody talks. The floor follows quiet slowly and loud never, so
 *   speech cannot raise it.
 * - "Loud never" had a hole: a fan or an engine that STARTS above the floor
 *   was loud for good. The floor never learned it, the fan was "speech", and
 *   the session recorded it for MAX_UTTERANCE_MS before asking for the words
 *   -- a question asked over it waited up to 30 s. Speech is never steady:
 *   syllables swing its level several times over within a second, a fan's
 *   barely moves. A level that stays loud AND flat for STEADY_MS is learned
 *   as the new floor (`steady`), and whatever it started is dropped.
 */

export const TICK_MS = 40
export const SPEECH_ONSET_MS = 160
export const END_OF_TURN_MS = 850

/** Loud now, and flat for this long: the room, not a voice. */
export const STEADY_MS = 2000
/*
 * The loudest tick over the quietest in that window. Measured with `tri vad`
 * at a 43 ms frame: speech's flattest two seconds swing 8.9-93x alone and
 * 4.9-7.6x over a fan; brown, pink and white noise and a wobbling fan stay
 * at 1.07-2.09x.
 */
export const STEADY_SPREAD = 2.5

const QUIET_FLOOR = 0.014
const TALKING_FLOOR = 0.05

export type Judged = 'quiet' | 'loud' | 'steady'

export class LevelGate {
  /** What the room sounds like when nobody talks (RMS, 0..1). */
  floor = 0.01
  private window: { at: number; level: number }[] = []

  /** `steadyMs` Infinity is the gate before cycle 8, for `tri vad` to compare. */
  constructor(private readonly steadyMs = STEADY_MS) {}

  /**
   * One tick of the mic. `listening` false holds the floor (a phrase is
   * under way); `agentTalking` raises the bar over the agent's own voice.
   */
  judge(
    now: number,
    level: number,
    listening: boolean,
    agentTalking: boolean
  ): Judged {
    if (listening && level < this.floor * 2.5) {
      this.floor = this.floor * 0.97 + level * 0.03
    }
    const threshold = agentTalking
      ? Math.max(TALKING_FLOOR, this.floor * 7)
      : Math.max(QUIET_FLOOR, this.floor * 3.2)
    // Every tick, loud or not: a fan sitting on the threshold flickers.
    this.window.push({ at: now, level })
    while (now - this.window[0].at > this.steadyMs) this.window.shift()
    if (level <= threshold) return 'quiet'
    if (now - this.window[0].at < this.steadyMs - TICK_MS / 2) return 'loud'
    let lo = Infinity
    let hi = 0
    let sum = 0
    for (const w of this.window) {
      lo = Math.min(lo, w.level)
      hi = Math.max(hi, w.level)
      sum += w.level
    }
    if (hi > lo * STEADY_SPREAD) return 'loud'
    this.floor = sum / this.window.length
    this.window = []
    return 'steady'
  }
}

/** Where a phrase is: when the loud began, when the quiet began, was it speech. */
export class TurnClock {
  loudSince = 0
  quietSince = 0
  spoke = false

  reset(): void {
    this.loudSince = 0
    this.quietSince = 0
    this.spoke = false
  }

  mark(now: number, loud: boolean): void {
    if (loud) {
      if (!this.loudSince) this.loudSince = now
      this.quietSince = 0
    } else {
      this.loudSince = 0
      if (!this.quietSince) this.quietSince = now
    }
  }

  /** Loud long enough to be someone talking: true once, the tick it starts. */
  onset(now: number): boolean {
    if (this.spoke || !this.loudSince) return false
    if (now - this.loudSince <= SPEECH_ONSET_MS) return false
    this.spoke = true
    return true
  }

  /** How long the current quiet has lasted (0 while loud). */
  quiet(now: number): number {
    return this.quietSince ? now - this.quietSince : 0
  }

  ended(now: number): boolean {
    return this.spoke && this.quiet(now) > END_OF_TURN_MS
  }
}

/** RMS of a frame, as the session reads it from the analyser. */
export function rms(frame: ArrayLike<number>): number {
  let sum = 0
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i]
  return frame.length ? Math.sqrt(sum / frame.length) : 0
}
