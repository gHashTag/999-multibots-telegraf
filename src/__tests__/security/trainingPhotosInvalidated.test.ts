/**
 * Ratchet: the LoRA-training photo dataset is invalidated between trainings.
 *
 * ctx.session.images collects the training-photo Buffers and is only ever
 * .push()ed to; the upload scene consumed it (zip + submit) but never cleared
 * it, and the wizard only init'd it when undefined. So a second training in the
 * same session .push()es onto the FIRST training's photos -> a wrong/blended
 * avatar the user paid for (and the Buffers leak).
 *
 * The fix: (a) trainFluxModelWizard resets ctx.session.images = [] on Step-1
 * entry (unconditional -- a fresh start, distinct from the pre-existing
 * `if (!ctx.session.images)` init), and (b) uploadTrainFluxModelScene clears it
 * after consuming the dataset. This pins both.
 *
 * loop-fable iter201 (found by the bug-hunt-wave6 workflow, cache-stale lens).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const WIZARD = path.resolve(
  __dirname,
  '../../scenes/trainFluxModelWizard/index.ts'
)
const UPLOAD = path.resolve(
  __dirname,
  '../../scenes/uploadTrainFluxModelScene/index.ts'
)

/** Is `n` an assignment `ctx.session.images = []` (empty array)? */
function isImagesReset(n: ts.Node): boolean {
  return (
    ts.isBinaryExpression(n) &&
    n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isPropertyAccessExpression(n.left) &&
    n.left.name.text === 'images' &&
    ts.isPropertyAccessExpression(n.left.expression) &&
    n.left.expression.name.text === 'session' &&
    ts.isArrayLiteralExpression(n.right) &&
    n.right.elements.length === 0
  )
}

/** Is `n` inside an `if` whose condition tests `!ctx.session...images` (the init guard)? */
function insideImagesInitGuard(n: ts.Node, sf: ts.SourceFile): boolean {
  let c: ts.Node | undefined = n.parent
  while (c) {
    if (
      ts.isIfStatement(c) &&
      /!\s*ctx\.session[?.]*\.images/.test(c.expression.getText(sf))
    ) {
      return true
    }
    c = c.parent
  }
  return false
}

function analyze(file: string) {
  const source = fs.readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(
    path.basename(file),
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  )
  let total = 0
  let unconditional = 0
  const visit = (n: ts.Node): void => {
    if (isImagesReset(n)) {
      total++
      if (!insideImagesInitGuard(n, sf)) unconditional++
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return { total, unconditional }
}

describe('LoRA training photos are invalidated between trainings', () => {
  it('self-check: detector separates an unconditional reset from an init-guarded one', () => {
    const inline = (body: string) => {
      const sf = ts.createSourceFile('t.ts', body, ts.ScriptTarget.Latest, true)
      let total = 0
      let uncond = 0
      const v = (n: ts.Node): void => {
        if (isImagesReset(n)) {
          total++
          if (!insideImagesInitGuard(n, sf)) uncond++
        }
        n.forEachChild(v)
      }
      v(sf)
      return { total, uncond }
    }
    expect(inline(`function f(){ ctx.session.images = [] }`)).toEqual({
      total: 1,
      uncond: 1,
    })
    expect(
      inline(
        `function f(){ if (!ctx.session.images) { ctx.session.images = [] } }`
      )
    ).toEqual({ total: 1, uncond: 0 })
  })

  it('trainFluxModelWizard resets ctx.session.images unconditionally (fresh start)', () => {
    const { unconditional } = analyze(WIZARD)
    expect(
      unconditional,
      `trainFluxModelWizard has no UNCONDITIONAL ctx.session.images = [] reset ` +
        `(only the if(!images) init). A second training .push()es onto the prior ` +
        `training's photos -> a wrong/blended avatar the user paid for.`
    ).toBeGreaterThanOrEqual(1)
  })

  it('uploadTrainFluxModelScene clears ctx.session.images after consuming it', () => {
    const { total } = analyze(UPLOAD)
    expect(
      total,
      `uploadTrainFluxModelScene never clears ctx.session.images -- the consumed ` +
        `photo Buffers stay in the session (leak + cross-training contamination).`
    ).toBeGreaterThanOrEqual(1)
  })
})
