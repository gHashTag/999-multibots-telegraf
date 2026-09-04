import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { trainingAgeHours } from '@/inngest_app/functions/training/checkStuckTrainings'

/**
 * The stuck-training watchdog runs every thirty minutes and is the only thing
 * that notices a training the webhook lost. A row it does not mention is a
 * person who paid, is waiting, and whom nobody is looking for.
 *
 * The age was computed as (now - new Date(created_at)) / hour, and an unreadable
 * timestamp makes that NaN. `NaN > threshold` is false, so the row produced no
 * alert -- silence identical to "nothing is stuck". The one row nobody can date
 * is exactly the row worth saying out loud.
 */
describe('a training whose age cannot be read is still reported', () => {
  const NOW = Date.parse('2026-09-10T12:00:00Z')

  it('measures a readable age in hours', () => {
    expect(trainingAgeHours('2026-09-10T06:00:00Z', NOW)).toBe(6)
    expect(trainingAgeHours('2026-09-10T11:00:00Z', NOW)).toBe(1)
  })

  it('answers null rather than NaN when the timestamp cannot be read', () => {
    // Each of these used to yield NaN and slip silently past the threshold.
    for (const bad of ['not a date', '', null, undefined]) {
      expect(trainingAgeHours(bad as string, NOW)).toBeNull()
    }
  })

  it('null is distinguishable from an age below the alert threshold', () => {
    // The distinction the caller depends on: a young training is a number and
    // legitimately produces no alert; an unreadable one must not look the same.
    const young = trainingAgeHours('2026-09-10T11:00:00Z', NOW)
    const unknown = trainingAgeHours('nope', NOW)
    expect(typeof young).toBe('number')
    expect(unknown).toBeNull()
    expect(young).not.toBe(unknown)
  })

  /**
   * The caller lives inside a cron function's step, out of reach here. Asserted
   * against the source: it must branch on null and push an alert, rather than
   * letting the value fall into the numeric comparison as before.
   */
  it('the watchdog alerts on an unknown age instead of skipping it', () => {
    const src = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        '..',
        'inngest_app',
        'functions',
        'training',
        'checkStuckTrainings.ts'
      ),
      'utf8'
    )
    const at = src.indexOf('const ageHours = trainingAgeHours(')
    expect(at).toBeGreaterThan(0)
    const after = src.slice(at, at + 700)
    expect(after).toMatch(/if \(ageHours === null\)/)
    // and that branch must actually raise something, not merely log
    const nullBranch = after.slice(
      after.indexOf('if (ageHours === null)'),
      after.indexOf('} else if')
    )
    expect(nullBranch).toContain('alerts.push')
  })
})
