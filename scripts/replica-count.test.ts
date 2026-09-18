/**
 * THE COUNT IS TESTED ON INVENTED MANIFESTS, BECAUSE THE DANGEROUS ONES CANNOT
 * BE ARRANGED.
 *
 * Production runs one replica in one region, which is the only shape a live
 * test would ever see. The shapes that matter -- two replicas, or one replica
 * in each of two regions -- are exactly the ones nobody can produce on demand,
 * and the second is the trap: `numReplicas: 1` next to a two-region config is
 * TWO processes, and every per-process money guard (in-flight flags, step.run,
 * consume-once) fails silently there.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import path from 'node:path'

const { processCount, MUST_BE_ONE } = createRequire(__filename)(
  path.join(__dirname, 'replica-count.cjs')
) as {
  processCount: (manifest: unknown) => number | null
  MUST_BE_ONE: string
}

describe('how many processes a deployment describes', () => {
  it('reads a plain single replica', () => {
    expect(processCount({ deploy: { numReplicas: 1 } })).toBe(1)
  })

  it('reads a scaled service', () => {
    expect(processCount({ deploy: { numReplicas: 3 } })).toBe(3)
  })

  /*
   * THE TRAP. Railway writes both, and the per-region numbers are the real
   * ones: this manifest says "1" at the top and runs two processes.
   */
  it('adds the regions up rather than believing the top-level number', () => {
    expect(
      processCount({
        deploy: {
          numReplicas: 1,
          multiRegionConfig: {
            sfo: { numReplicas: 1 },
            ams: { numReplicas: 1 },
          },
        },
      })
    ).toBe(2)
  })

  it('matches production shape: one region, one replica', () => {
    expect(
      processCount({
        deploy: {
          numReplicas: 1,
          multiRegionConfig: { sfo: { numReplicas: 1 } },
        },
      })
    ).toBe(1)
  })

  /*
   * UNKNOWN IS NOT ONE. A manifest without the field tells us nothing, and
   * answering 1 there would be the tool inventing the reassurance it exists to
   * check.
   */
  it('says nothing rather than one when the manifest is silent', () => {
    expect(processCount({})).toBeNull()
    expect(processCount({ deploy: {} })).toBeNull()
    expect(processCount(null)).toBeNull()
  })

  it('judges the service whose guards depend on it', () => {
    expect(MUST_BE_ONE).toBe('999-multibots-telegraf')
  })
})
