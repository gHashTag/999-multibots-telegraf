import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Replicate can report a training as succeeded while the output carries no
 * usable version. The handler has to do two things at once there, and they pull
 * in opposite directions:
 *
 *   flip the status to a terminal value, or the stuck-training watchdog
 *   re-selects the row every thirty minutes forever;
 *
 *   and NOT make the record look finished, because there is no model_url to
 *   use -- the row is a training the user paid for that produced nothing
 *   usable, and it should be findable as such.
 *
 * The comment in that branch says "result stays unset so the record is visibly
 * incomplete". The code underneath it set result = 'SUCCESS', which is the
 * opposite. Nothing in src reads that column today, so this is about the record
 * telling the truth to whoever reads it next -- an owner query, a dashboard, or
 * the next person debugging a user with no models.
 *
 * Asserted against the source: this branch lives inside an inngest step, and
 * driving it would mean standing up the whole function. A structural check that
 * can fail beats a behavioural one that cannot run.
 */
const HANDLER = path.join(
  __dirname,
  '..',
  '..',
  'inngest_app',
  'functions',
  'existing',
  'handleModelTrainingCompleted.ts'
)

const source = () => fs.readFileSync(HANDLER, 'utf8')

/** The `else` branch taken when a succeeded training has no usable version. */
function noVersionBranch(src: string): string {
  const marker = 'Succeeded with no usable model version'
  const at = src.indexOf(marker)
  if (at === -1) return ''
  // Walk back to the `} else {` that opens this branch, then take up to the log.
  const open = src.lastIndexOf('} else {', at)
  return open === -1 ? '' : src.slice(open, at)
}

describe('a training that produced no usable model does not report itself finished', () => {
  it('the branch is still there to inspect', () => {
    // Without this the rest passes by finding nothing, which is how a guard
    // quietly stops guarding when the code it watches is rewritten.
    const branch = noVersionBranch(source())
    expect(branch.length).toBeGreaterThan(0)
    expect(branch).toContain('else')
  })

  it('does not mark the record SUCCESS when there is no model to show', () => {
    const branch = noVersionBranch(source())
    expect(branch).not.toMatch(/updateData\.result\s*=\s*['"]SUCCESS['"]/)
  })

  it('does not write a model_url it could not build', () => {
    const branch = noVersionBranch(source())
    expect(branch).not.toMatch(/updateData\.model_url\s*=/)
  })

  it('still flips the status out of pending, so the watchdog stops', () => {
    // The status is assigned once, above both branches, from the status map --
    // that is what makes the row terminal. If the map stopped mapping
    // `succeeded`, the row would be re-swept every thirty minutes forever.
    const src = source()
    expect(src).toMatch(/succeeded:\s*['"]SUCCESS['"]/)
    expect(src).toMatch(/status:\s*\n?\s*statusMap\[eventData\.status\]/)
  })
})
