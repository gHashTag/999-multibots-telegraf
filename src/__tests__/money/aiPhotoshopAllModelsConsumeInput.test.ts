/**
 * Ratchet: the aiPhotoshopScene ALL_MODELS branch consumes the paid input before
 * it returns, so the persistent "Continue with same settings" button cannot
 * re-charge the full multi-model cost from stale hot input.
 *
 * processAiPhotoshopRequest handles all_models in an early branch that charges
 * each model (processSingleAiPhotoshopModel in a loop), restores
 * aiPhotoshopModel='all_models', shows the dialog, and RETURNS -- before the
 * single-model path's "Clear working session" reset. Without consuming the input
 * here, aiPhotoshopImage/morphingImages stay hot; ai_photoshop_continue_same
 * (which does not set its own image) re-enters processAiPhotoshopRequest on the
 * stale input and re-charges the whole all_models cost (24-144 stars). The
 * single-model path already consumes the input for exactly this reason; this
 * pins the same consume-once on the all_models branch. (Found by the iter229
 * fresh-lens wave, stale-button lens, adversarially + hand verified.)
 *
 * Structural: the enclosing if-branch of the processSingleAiPhotoshopModel loop
 * (the one that returns) must assign ctx.session.aiPhotoshopImage = undefined.
 * self-check + floor + real-source mutation.
 *
 * loop-fable iter229.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(__dirname, '../../scenes/aiPhotoshopScene/index.ts')

/** Does the subtree contain `<x>.aiPhotoshopImage = undefined`? */
function resetsImage(node: ts.Node): boolean {
  let found = false
  const walk = (n: ts.Node): void => {
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(n.left) &&
      n.left.name.text === 'aiPhotoshopImage' &&
      // `= undefined` parses as an Identifier named "undefined" in expression
      // position (UndefinedKeyword is type-position only).
      ts.isIdentifier(n.right) &&
      n.right.text === 'undefined'
    ) {
      found = true
    }
    n.forEachChild(walk)
  }
  walk(node)
  return found
}

/** Does the subtree contain a return statement? */
function hasReturn(node: ts.Node): boolean {
  let found = false
  const walk = (n: ts.Node): void => {
    if (ts.isReturnStatement(n)) found = true
    n.forEachChild(walk)
  }
  walk(node)
  return found
}

function analyze(source: string): {
  loopCalls: number
  branchFound: boolean
  branchConsumesInput: boolean
} {
  const sf = ts.createSourceFile(
    'aiPhotoshopScene.ts',
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  )

  const calls: ts.CallExpression[] = []
  const collect = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === 'processSingleAiPhotoshopModel'
    ) {
      calls.push(n)
    }
    n.forEachChild(collect)
  }
  collect(sf)

  // The all_models branch = the nearest enclosing if-then block of the loop
  // call that itself contains a return.
  let branchFound = false
  let branchConsumesInput = false
  for (const c of calls) {
    let a: ts.Node | undefined = c.parent
    while (a) {
      if (ts.isIfStatement(a) && hasReturn(a.thenStatement)) {
        branchFound = true
        if (resetsImage(a.thenStatement)) branchConsumesInput = true
        break
      }
      a = a.parent
    }
    if (branchFound) break
  }

  return { loopCalls: calls.length, branchFound, branchConsumesInput }
}

describe('aiPhotoshopScene all_models branch consumes input before returning (no stale re-charge)', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const a = analyze(source)

  it('floor: the all_models charge loop and its returning branch still exist', () => {
    expect(a.loopCalls).toBeGreaterThanOrEqual(1)
    expect(a.branchFound).toBe(true)
  })

  it('the all_models branch resets aiPhotoshopImage before returning', () => {
    expect(
      a.branchConsumesInput,
      `The all_models branch returns without clearing ctx.session.aiPhotoshopImage. ` +
        `The persistent continue_same button will re-charge the full multi-model cost ` +
        `from stale input. Consume it (aiPhotoshopImage = undefined) before the return, ` +
        `as the single-model path does.`
    ).toBe(true)
  })

  it('self-check: detector distinguishes a consuming branch from a non-consuming one', () => {
    const bad = `
      async function p(ctx) {
        if (m === 'all_models') {
          for (const k of models) { await processSingleAiPhotoshopModel(ctx, prompt, k, true) }
          await showDialogInterface(ctx)
          return
        }
      }`
    const good = `
      async function p(ctx) {
        if (m === 'all_models') {
          for (const k of models) { await processSingleAiPhotoshopModel(ctx, prompt, k, true) }
          if (ctx.session) { ctx.session.aiPhotoshopImage = undefined }
          await showDialogInterface(ctx)
          return
        }
      }`
    expect(analyze(bad).branchFound).toBe(true)
    expect(analyze(bad).branchConsumesInput).toBe(false)
    expect(analyze(good).branchConsumesInput).toBe(true)
  })

  it('mutation: removing the real reset turns the check RED', () => {
    const mutated = source.replace(
      /ctx\.session\.aiPhotoshopImage = undefined\s*\n\s*ctx\.session\.morphingImages = undefined\s*\n(\s*)\}\s*\n\s*\n\s*\/\/ Show dialog interface/,
      '$1}\n\n    // Show dialog interface'
    )
    expect(mutated).not.toEqual(source)
    expect(analyze(mutated).branchConsumesInput).toBe(false)
  })
})
