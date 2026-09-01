/**
 * Ratchet: in aiPhotoshopScene ALL_MODELS batch mode, every service call that
 * sets `skipBalanceCheck: true` must let a post-charge failure refund the EXACT
 * amount the scene charged -- not the service's own divergent base.
 *
 * The batch path charges up front: costPerImage = modelCost * qualityMultiplier
 * (2K -> x4, 4K -> x6), one processBalanceOperation for the whole model. It then
 * calls each service with `skipBalanceCheck: true` (the service must NOT charge
 * again). But the service still owns the REFUND: on a provider/API failure it
 * refunds. If it refunds its own flat service base, a 2K image charged 12 stars
 * is refunded 3 -- the user loses 9 (15 at 4K). That is the #1267 / #1263 class
 * (generateQwenImageEdit had exactly this gap; see qwenRefundQualityMultiplier).
 *
 * Two sound reconciliations exist, and every batch call must use one:
 *   (A) pass `chargedCostOverride: costPerImage` -- the service refunds THIS
 *       exact batch amount (flux_kontext_pro / flux_kontext_max / seededit_3).
 *   (B) generateQwenImageEdit reconciles differently: it re-derives the same
 *       size multiplier from its `size` arg and applies it to its own totalCost
 *       (pinned numerically + by mutation in qwenRefundQualityMultiplier.test.ts).
 *       So a qwen batch call is reconciled iff it passes `size`.
 *
 * This ratchet guards the DISPATCH SITE (complementary to the per-service qwen
 * ratchet): a future model wired into the batch with `skipBalanceCheck: true` but
 * no `chargedCostOverride` -- the natural copy-paste -- silently under-refunds at
 * 2K/4K. Here it turns the suite RED instead.
 *
 * loop-fable iter227 (fn-liveness sweep spun into a batch-reconciliation audit;
 * the invariant held 4/4 at write time but was unguarded against regression).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(__dirname, '../../scenes/aiPhotoshopScene/index.ts')

interface BatchCall {
  callee: string
  line: number
  hasOverride: boolean
  hasSize: boolean
}

/** A service call (generateX({...})) that opts into the pre-charged batch. */
function isServiceCallee(name: string): boolean {
  return /^generate[A-Z]/.test(name)
}

/** Read the object-literal arg of a call and report the props we care about. */
function inspectArgObject(obj: ts.ObjectLiteralExpression): {
  skipBalanceCheck: boolean
  hasOverride: boolean
  hasSize: boolean
} {
  let skipBalanceCheck = false
  let hasOverride = false
  let hasSize = false
  for (const p of obj.properties) {
    if (!ts.isPropertyAssignment(p) || !p.name) continue
    const key = ts.isIdentifier(p.name)
      ? p.name.text
      : ts.isStringLiteral(p.name)
        ? p.name.text
        : ''
    if (key === 'skipBalanceCheck') {
      skipBalanceCheck = p.initializer.kind === ts.SyntaxKind.TrueKeyword
    } else if (key === 'chargedCostOverride') {
      hasOverride = true
    } else if (key === 'size') {
      hasSize = true
    }
  }
  return { skipBalanceCheck, hasOverride, hasSize }
}

/** Every batch (skipBalanceCheck:true) service call in the source. */
function analyze(source: string): BatchCall[] {
  const sf = ts.createSourceFile(
    'aiPhotoshopScene.ts',
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  )
  const calls: BatchCall[] = []
  const visit = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      isServiceCallee(n.expression.text) &&
      n.arguments.length > 0 &&
      ts.isObjectLiteralExpression(n.arguments[0])
    ) {
      const info = inspectArgObject(n.arguments[0])
      if (info.skipBalanceCheck) {
        calls.push({
          callee: n.expression.text,
          line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
          hasOverride: info.hasOverride,
          hasSize: info.hasSize,
        })
      }
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return calls
}

/** A batch call is reconciled iff it uses mechanism (A) or the qwen (B) path. */
function isReconciled(c: BatchCall): boolean {
  if (c.hasOverride) return true // (A)
  if (c.callee === 'generateQwenImageEdit' && c.hasSize) return true // (B)
  return false
}

describe('aiPhotoshopScene batch skipBalanceCheck calls reconcile refunds to the charge', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const batchCalls = analyze(source)

  it('matcher is not stale: the batch dispatch still exists', () => {
    // If the ALL_MODELS dispatch is gutted or renamed to zero skipBalanceCheck
    // calls, the violation check below would pass vacuously. Fail loud instead.
    expect(batchCalls.length).toBeGreaterThanOrEqual(4)
  })

  it('every batch service call reconciles its refund (chargedCostOverride, or qwen+size)', () => {
    const unreconciled = batchCalls.filter(c => !isReconciled(c))
    expect(
      unreconciled.map(c => `${c.callee}@L${c.line}`),
      `A skipBalanceCheck:true service call in aiPhotoshopScene does not pass ` +
        `chargedCostOverride (and is not the qwen size-multiplier path). On a ` +
        `post-charge failure it refunds its own base, under-refunding at 2K/4K ` +
        `(#1267). Add chargedCostOverride: costPerImage to the call.`
    ).toEqual([])
  })

  it('self-check: detector distinguishes reconciled from unreconciled calls', () => {
    const bad = `
      async function h() {
        const r = await generateFoo({ inputImageUrl: u, skipBalanceCheck: true })
      }`
    const goodOverride = `
      async function h() {
        const r = await generateFoo({ skipBalanceCheck: true, chargedCostOverride: c })
      }`
    const goodQwen = `
      async function h() {
        const r = await generateQwenImageEdit({ size: s, skipBalanceCheck: true })
      }`
    const qwenNoSize = `
      async function h() {
        const r = await generateQwenImageEdit({ skipBalanceCheck: true })
      }`
    expect(analyze(bad).map(isReconciled)).toEqual([false])
    expect(analyze(goodOverride).map(isReconciled)).toEqual([true])
    expect(analyze(goodQwen).map(isReconciled)).toEqual([true])
    // mechanism B requires size; a qwen batch call without it is NOT reconciled.
    expect(analyze(qwenNoSize).map(isReconciled)).toEqual([false])
  })

  it('mutation: stripping a real chargedCostOverride turns the check RED', () => {
    // Prove the detector fires on THIS file, not just synthetic strings.
    const mutated = source.replace(/chargedCostOverride:\s*costPerImage,?/, '')
    expect(mutated).not.toEqual(source) // the token really exists
    const unreconciled = analyze(mutated).filter(c => !isReconciled(c))
    expect(unreconciled.length).toBeGreaterThan(0)
  })
})
