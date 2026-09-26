/**
 * A NUMBER KEPT BY HAND GOES STALE IN THE DIRECTION NOBODY IS WATCHING.
 *
 * `STUCK_SWEEP_MS` decides when a running sweep is declared hung. Declaring
 * it does two things: it pages ("sweep stuck, releasing the flag") and it
 * FALLS THROUGH, starting a second sweep beside the first. So a ceiling
 * below the honest worst case is not a conservative choice -- it is a false
 * alarm that doubles the work on exactly the slow days when that hurts.
 *
 * The ceiling was derived from a table of the sweep's steps, kept by hand,
 * and it went stale twice:
 *
 *   - the model turn is bounded by TURN_CEILING_MS, 420 s, while the table
 *     said 180 -- nothing in the sweep sets a deadline of its own on the ask;
 *   - the faces step (24.09.2026) added sixty seconds and nobody added a row.
 *
 * So the sum is computed HERE, from the constants themselves. A step added
 * to the sweep without a row in the table fails this test on the day it is
 * added, instead of re-arming the alarm months later.
 */
import { describe, it, expect } from 'vitest'
import {
  STUCK_SWEEP_MS,
  INGEST_TIMEOUT_MS,
  FACES_TIMEOUT_MS,
} from '@/services/crmProactive'
import { TOOL_TIMEOUT_MS } from '@/services/modelSwitch'
import { TURN_CEILING_MS } from '@/services/trinityAgent'

/**
 * Every deadline a single honest sweep can spend, in the order it spends
 * them. The retry budget is ONE per sweep, shared by the transport retry,
 * the no-tools retry and the abort -- so the model turn counts twice, not
 * four times.
 */
const STEPS = [
  { what: 'ingest', ms: INGEST_TIMEOUT_MS },
  { what: 'faces', ms: FACES_TIMEOUT_MS },
  { what: 'crm_leads', ms: TOOL_TIMEOUT_MS },
  { what: 'model turn', ms: TURN_CEILING_MS },
  { what: 'one retry', ms: TURN_CEILING_MS },
]
const WORST = STEPS.reduce((s, x) => s + x.ms, 0)

describe('the stuck-sweep ceiling covers the steps it is made of', () => {
  it('clears the honest worst case', () => {
    expect(
      STUCK_SWEEP_MS,
      `the ceiling is ${Math.round(STUCK_SWEEP_MS / 1000)} s and an honest ` +
        `sweep can take ${Math.round(WORST / 1000)} s:\n` +
        STEPS.map(s => `  ${s.what}: ${Math.round(s.ms / 1000)} s`).join('\n') +
        '\nA ceiling under the sum pages AND starts a second concurrent sweep.'
    ).toBeGreaterThanOrEqual(WORST)
  })

  it('and is not so far above it that a real hang goes unnoticed', () => {
    // The flag's whole job is to release a sweep that died holding it. Room
    // for the push, not an hour of patience.
    expect(STUCK_SWEEP_MS).toBeLessThan(WORST + 5 * 60_000)
  })

  it('the steps are real numbers, not zeroes that would satisfy anything', () => {
    // Negative control: if an import went missing the sum would be NaN or 0
    // and the first assertion would pass for the wrong reason.
    for (const s of STEPS) expect(s.ms).toBeGreaterThan(30_000)
    expect(WORST).toBeGreaterThan(15 * 60_000)
  })
})
