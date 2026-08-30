/**
 * Regression ratchet: render wizards must not refund AFTER the render job is
 * dispatched (#1331; sibling-sweep of the veed-fabric mint #1330).
 *
 * ai-reels-render / hedra-render / fal-render charge upfront, then dispatch via
 * sendRenderAvatarVideoEvent and (in the SAME try) send a confirmation reply.
 * If that reply throws after a successful dispatch, the catch refunded while the
 * job kept running -> video delivered + refunded = mint. Fix: a `dispatched`
 * flag set right after the dispatch; refund only when `!dispatched`.
 *
 * heygen-render is the ORACLE: it isolates the dispatch in its own try/catch and
 * never refunds post-dispatch. These are integration-heavy wizards (render-server
 * + inngest + videoTaskStore), so this is a STRUCTURAL guard + a class ratchet;
 * the behavioral proof of the pattern lives in veedFabricDispatchRefund.test.ts.
 * Removing any `if (!dispatched)` guard fails this test.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const read = (f: string) =>
  readFileSync(join(process.cwd(), 'src/scenes/lipSyncWizard', f), 'utf8')

const FIXED = [
  'ai-reels-render-wizard.ts',
  'hedra-render-wizard.ts',
  'fal-render-wizard.ts',
]

describe('render wizards: refund is guarded by !dispatched', () => {
  for (const f of FIXED) {
    it(`${f} sets dispatched after the dispatch and guards the refund`, () => {
      const s = read(f)
      const iDispatch = s.indexOf('sendRenderAvatarVideoEvent(payload)')
      const iSet = s.indexOf('dispatched = true')
      const iGuard = s.indexOf('if (!dispatched) {')
      expect(iDispatch).toBeGreaterThan(-1)
      expect(iSet).toBeGreaterThan(iDispatch) // set AFTER the dispatch
      expect(iGuard).toBeGreaterThan(-1)
      // the guarded refund: the guard precedes a refundAndTell
      expect(s).toMatch(
        /if \(!dispatched\) \{[\s\S]{0,120}await refundAndTell\(/
      )
    })
  }

  it('heygen-render is the oracle: dispatch isolated in its own try/catch', () => {
    const s = read('heygen-render-wizard.ts')
    // dispatch alone in a try whose catch handles the send error
    expect(s).toMatch(
      /await sendRenderAvatarVideoEvent\(payload\)\)\s*\n\s*\} catch \(sendError\)/
    )
  })

  // Class ratchet: any render wizard that BOTH dispatches and refunds must
  // either carry the !dispatched guard or use heygen's isolated-dispatch shape.
  it('no render wizard refunds post-dispatch without a guard', () => {
    const all = [...FIXED, 'heygen-render-wizard.ts']
    const offenders: string[] = []
    for (const f of all) {
      const s = read(f)
      const dispatches = s.includes('sendRenderAvatarVideoEvent(')
      const refunds = s.includes('refundAndTell(') || s.includes('MONEY_INCOME')
      if (!dispatches || !refunds) continue
      const guarded = s.includes('if (!dispatched) {')
      const isolated =
        /await sendRenderAvatarVideoEvent\(payload\)\)\s*\n\s*\} catch \(sendError\)/.test(
          s
        )
      if (!guarded && !isolated) offenders.push(f)
    }
    expect(offenders).toEqual([])
  })
})
