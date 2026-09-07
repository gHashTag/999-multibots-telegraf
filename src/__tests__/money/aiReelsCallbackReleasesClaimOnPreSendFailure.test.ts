/**
 * Ratchet: the AI Reels completion callback must RELEASE its delivery claim on a
 * PRE-send failure, so a legitimate at-least-once provider retry can re-deliver
 * -- but must NOT release once a send was attempted (a retry would double-send).
 *
 * handleCompletedRender claims the immutable job_id on ENTRY (serialises
 * concurrent duplicates). The claim used to be add-only, so a transient failure
 * BEFORE delivery (S3 download timeout) permanently held the claim: the provider
 * retry re-entered, the claim returned false, and the video was never delivered
 * = charged-not-delivered (charge is taken upstream, no refund on this path).
 *
 * The fix: track deliveryAttempted (set true immediately before each real
 * delivery send), and in the catch release the claim ONLY when
 * !deliveryAttempted. This ratchet pins: (a) the claimer exposes release();
 * (b) the callback calls claimVideoJobDelivery.release(); (c) that release is
 * guarded by deliveryAttempted; (d) deliveryAttempted is set true (before sends).
 *
 * Consume-once/idempotency correction (no credit, no charge change) -> autonomous.
 * Found + adversarially self-verified by wave23 + a 3-skeptic double-send panel.
 * loop-fable iter (fresh-surface review).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const CALLBACK = path.resolve(
  __dirname,
  '../../api_server/routes/ai-reels-callback.routes.ts'
)
const HELPER = path.resolve(
  __dirname,
  '../../helpers/videoDeliveryIdempotency.ts'
)

function analyzeCallback(source: string): {
  releasePresent: boolean
  releaseGuardedByFlag: boolean
  flagSetTrue: boolean
} {
  const sf = ts.createSourceFile('r.ts', source, ts.ScriptTarget.Latest, true)
  let releasePresent = false
  let releaseGuardedByFlag = false
  let flagSetTrue = false

  const ancestorIfMentionsFlag = (node: ts.Node): boolean => {
    let cur: ts.Node | undefined = node
    const start = node.getStart(sf)
    const end = node.getEnd()
    while (cur && cur.parent) {
      const p = cur.parent
      if (
        ts.isIfStatement(p) &&
        p.thenStatement.getStart(sf) <= start &&
        end <= p.thenStatement.getEnd() &&
        /deliveryAttempted/.test(p.expression.getText(sf))
      ) {
        return true
      }
      cur = p
    }
    return false
  }

  const visit = (n: ts.Node): void => {
    // claimVideoJobDelivery.release(...)
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === 'release' &&
      ts.isIdentifier(n.expression.expression) &&
      n.expression.expression.text === 'claimVideoJobDelivery'
    ) {
      releasePresent = true
      if (ancestorIfMentionsFlag(n)) releaseGuardedByFlag = true
    }
    // deliveryAttempted = true
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(n.left) &&
      n.left.text === 'deliveryAttempted' &&
      n.right.kind === ts.SyntaxKind.TrueKeyword
    ) {
      flagSetTrue = true
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return { releasePresent, releaseGuardedByFlag, flagSetTrue }
}

// The claimer must expose a release method (else the callback calls undefined).
function helperExposesRelease(source: string): boolean {
  const sf = ts.createSourceFile('h.ts', source, ts.ScriptTarget.Latest, true)
  let found = false
  const visit = (n: ts.Node): void => {
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(n.left) &&
      n.left.name.text === 'release'
    ) {
      found = true
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return found
}

describe('AI Reels callback releases its delivery claim on a pre-send failure', () => {
  const cbSource = fs.readFileSync(CALLBACK, 'utf8')
  const helperSource = fs.readFileSync(HELPER, 'utf8')
  const a = analyzeCallback(cbSource)

  it('floor: the callback claims + tracks deliveryAttempted', () => {
    expect(/claimVideoJobDelivery/.test(cbSource)).toBe(true)
    expect(a.flagSetTrue).toBe(true)
  })

  it('the claimer exposes a release() method', () => {
    expect(helperExposesRelease(helperSource)).toBe(true)
  })

  it('the callback releases the claim, guarded by deliveryAttempted', () => {
    expect(a.releasePresent).toBe(true)
    expect(a.releaseGuardedByFlag).toBe(true)
  })

  it('self-check: an unguarded or absent release is detected', () => {
    const noRelease = `async function h() {
      if (payload.job_id && !claimVideoJobDelivery(payload.job_id)) return
      let deliveryAttempted = false
      try { deliveryAttempted = true; await send() } catch (e) {}
    }`
    const rn = analyzeCallback(noRelease)
    expect(rn.releasePresent).toBe(false)
    expect(rn.releaseGuardedByFlag).toBe(false)

    const unguarded = `async function h() {
      let deliveryAttempted = false
      try { deliveryAttempted = true; await send() } catch (e) {
        claimVideoJobDelivery.release(payload.job_id)
      }
    }`
    const ru = analyzeCallback(unguarded)
    expect(ru.releasePresent).toBe(true)
    expect(ru.releaseGuardedByFlag).toBe(false)

    const good = `async function h() {
      let deliveryAttempted = false
      try { deliveryAttempted = true; await send() } catch (e) {
        if (payload.job_id && !deliveryAttempted) claimVideoJobDelivery.release(payload.job_id)
      }
    }`
    const rg = analyzeCallback(good)
    expect(rg.releaseGuardedByFlag).toBe(true)
  })

  it('mutation: dropping the deliveryAttempted guard on the real release turns it RED', () => {
    const mutated = cbSource.replace(
      'if (payload.job_id && !deliveryAttempted) {',
      'if (payload.job_id) {'
    )
    expect(mutated).not.toEqual(cbSource)
    expect(analyzeCallback(mutated).releaseGuardedByFlag).toBe(false)
  })
})
