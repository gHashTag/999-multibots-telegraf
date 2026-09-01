/**
 * Ratchet: the ai_photoshop_upscale_last button consumes the target photo
 * BEFORE it fires the paid upscale, so a stale re-tap cannot re-charge.
 *
 * The button rides the persistent dialog keyboard (re-shown after every op,
 * never stripped), and upscaleImage does NOT append its result to
 * savedAiPhotoshopResults -- so savedResults[last] is stable until the next
 * generation. Upscaling is deterministic, so re-tapping the old button later
 * re-charges 3 stars for a byte-identical result. The pre-existing
 * aiPhotoshopUpscaleInProgress in-flight flag only blocks CONCURRENT taps
 * (aiPhotoshopUpscaleInflightGuard.test.ts, #1526); it does NOT stop a LATER
 * replay -- the flag is long released.
 *
 * The fix refuses when lastUpscaledPhotoUrl === imageUrl, and marks the photo
 * consumed (lastUpscaledPhotoUrl = imageUrl) BEFORE the charge -- a synchronous
 * check-then-set. A new generation appends a saved result whose URL differs, so
 * its first upscale still proceeds. This pins the ordering: inside the
 * ai_photoshop_upscale_last handler the consume assignment must precede the
 * upscaleImage call, and the equality refuse-guard must be present.
 *
 * loop-fable iter212 (replay-class enumerate-all, sibling of #1551). Skip/guard
 * direction (refuses the replay, adds no credit) -> autonomous-safe.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(__dirname, '../../scenes/aiPhotoshopScene/index.ts')

function analyze(source: string): {
  handlerFound: boolean
  chargeCalls: number
  consumeBeforeCharge: boolean
  guardPresent: boolean
} {
  const sf = ts.createSourceFile('a.ts', source, ts.ScriptTarget.Latest, true)

  let handler: ts.CallExpression | undefined
  const findHandler = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === 'action' &&
      n.arguments.length >= 1 &&
      ts.isStringLiteral(n.arguments[0]) &&
      n.arguments[0].text === 'ai_photoshop_upscale_last'
    ) {
      handler = n
    }
    n.forEachChild(findHandler)
  }
  findHandler(sf)
  if (!handler) {
    return {
      handlerFound: false,
      chargeCalls: 0,
      consumeBeforeCharge: false,
      guardPresent: false,
    }
  }
  const lo = handler.getStart(sf)
  const hi = handler.getEnd()
  const inHandler = (n: ts.Node): boolean =>
    n.getStart(sf) >= lo && n.getEnd() <= hi

  const isProp = (n: ts.Node, prop: string): boolean =>
    ts.isPropertyAccessExpression(n) && n.name.text === prop

  const chargePositions: number[] = []
  const consumePositions: number[] = []
  let guardPresent = false

  const visit = (n: ts.Node): void => {
    if (inHandler(n)) {
      if (
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) &&
        n.expression.text === 'upscaleImage'
      ) {
        chargePositions.push(n.getStart(sf))
      }
      if (ts.isBinaryExpression(n)) {
        if (
          n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          isProp(n.left, 'lastUpscaledPhotoUrl')
        ) {
          consumePositions.push(n.getStart(sf))
        }
        if (
          n.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
          (isProp(n.left, 'lastUpscaledPhotoUrl') ||
            isProp(n.right, 'lastUpscaledPhotoUrl'))
        ) {
          guardPresent = true
        }
      }
    }
    n.forEachChild(visit)
  }
  visit(sf)

  const firstCharge = chargePositions.length
    ? Math.min(...chargePositions)
    : Infinity
  const firstConsume = consumePositions.length
    ? Math.min(...consumePositions)
    : Infinity
  return {
    handlerFound: true,
    chargeCalls: chargePositions.length,
    consumeBeforeCharge: firstConsume < firstCharge,
    guardPresent,
  }
}

describe('ai_photoshop_upscale_last consumes the photo before charging (no stale-tap replay)', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const a = analyze(source)

  // matcher-not-stale floor: the paid button this ratchet guards still exists.
  it('floor: the ai_photoshop_upscale_last handler still charges via upscaleImage', () => {
    expect(a.handlerFound).toBe(true)
    expect(a.chargeCalls).toBeGreaterThanOrEqual(1)
  })

  it('marks the photo consumed before the upscale charge, with a refuse guard', () => {
    expect(a.consumeBeforeCharge).toBe(true)
    expect(a.guardPresent).toBe(true)
  })

  it('self-check: a handler that charges without consuming first is detected', () => {
    const bad = `aiPhotoshopScene.action('ai_photoshop_upscale_last', async ctx => {
      const imageUrl = last.url
      if (ctx.session.aiPhotoshopUpscaleInProgress) return
      ctx.session.aiPhotoshopUpscaleInProgress = true
      await upscaleImage({ imageUrl })
    })`
    const rb = analyze(bad)
    expect(rb.handlerFound).toBe(true)
    expect(rb.consumeBeforeCharge).toBe(false)
    expect(rb.guardPresent).toBe(false)

    const good = `aiPhotoshopScene.action('ai_photoshop_upscale_last', async ctx => {
      const imageUrl = last.url
      if (ctx.session.lastUpscaledPhotoUrl === imageUrl) return
      ctx.session.lastUpscaledPhotoUrl = imageUrl
      await upscaleImage({ imageUrl })
    })`
    const rg = analyze(good)
    expect(rg.consumeBeforeCharge).toBe(true)
    expect(rg.guardPresent).toBe(true)
  })

  it('mutation: removing the real consume assignment turns the check RED', () => {
    // Revert the actual consume-before-charge line in aiPhotoshopScene and prove
    // the detector fires -- the strongest false-ruler defense (couples the ratchet
    // to the FIX, not just a synthetic input). Completes the consume-before-charge
    // class after upscale_image (#1551) and upscale_neurophoto_image (#1553).
    const mutated = source.replace(
      'ctx.session.lastUpscaledPhotoUrl = imageUrl',
      ''
    )
    expect(mutated).not.toEqual(source)
    expect(analyze(mutated).consumeBeforeCharge).toBe(false)
  })
})
