/**
 * Ratchet: the bot.action('upscale_neurophoto_image') handler consumes the
 * neurophoto BEFORE it fires the paid upscale, so a stale re-tap cannot re-charge.
 *
 * Third instance of the stale-persistent-button-replay class (after #1551
 * upscale_image and #1553 ai_photoshop_upscale_last). The button rides the
 * persistent neurophoto result keyboard; ctx.session.lastNeuroPhotoImageUrl is
 * set once at generation (generateNeuroPhotoDirect/Multi/Hybrid) and never
 * cleared, and upscaleImage does not change it -- so re-tapping the old button
 * later re-charges for a deterministic (identical) upscale.
 *
 * The fix refuses when lastUpscaledImageUrl === lastNeuroPhotoImageUrl (the
 * shared "already upscaled" marker, also used by upscale_image in this file),
 * and marks it consumed BEFORE the charge -- a synchronous check-then-set. A new
 * neurophoto resets lastNeuroPhotoImageUrl, so its first upscale still proceeds.
 * This pins the ordering: inside the handler the consume assignment must precede
 * the upscaleImage call, and the equality refuse-guard must be present.
 *
 * Found by `tri replay` (the inventory tool built the same iteration). loop-fable
 * iter213. Skip/guard direction (refuses the replay, adds no credit) -> autonomous.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(__dirname, '../../navigation/registerCommands.ts')

function analyze(source: string): {
  handlerFound: boolean
  chargeCalls: number
  consumeBeforeCharge: boolean
  guardPresent: boolean
} {
  const sf = ts.createSourceFile('r.ts', source, ts.ScriptTarget.Latest, true)

  let handler: ts.CallExpression | undefined
  const findHandler = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === 'action' &&
      n.arguments.length >= 1 &&
      ts.isStringLiteral(n.arguments[0]) &&
      n.arguments[0].text === 'upscale_neurophoto_image'
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
          isProp(n.left, 'lastUpscaledImageUrl')
        ) {
          consumePositions.push(n.getStart(sf))
        }
        if (
          n.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
          ((isProp(n.left, 'lastUpscaledImageUrl') &&
            isProp(n.right, 'lastNeuroPhotoImageUrl')) ||
            (isProp(n.left, 'lastNeuroPhotoImageUrl') &&
              isProp(n.right, 'lastUpscaledImageUrl')))
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

describe('upscale_neurophoto_image consumes the image before charging (no stale-tap replay)', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const a = analyze(source)

  it('floor: the upscale_neurophoto_image handler still charges via upscaleImage', () => {
    expect(a.handlerFound).toBe(true)
    expect(a.chargeCalls).toBeGreaterThanOrEqual(1)
  })

  it('marks the neurophoto consumed before the upscale charge, with a refuse guard', () => {
    expect(a.consumeBeforeCharge).toBe(true)
    expect(a.guardPresent).toBe(true)
  })

  it('self-check: a handler that charges without consuming first is detected', () => {
    const bad = `bot.action('upscale_neurophoto_image', async ctx => {
      if (!ctx.session.lastNeuroPhotoImageUrl) return
      await upscaleImage({ imageUrl: ctx.session.lastNeuroPhotoImageUrl })
    })`
    const rb = analyze(bad)
    expect(rb.handlerFound).toBe(true)
    expect(rb.consumeBeforeCharge).toBe(false)
    expect(rb.guardPresent).toBe(false)

    const good = `bot.action('upscale_neurophoto_image', async ctx => {
      if (ctx.session.lastUpscaledImageUrl === ctx.session.lastNeuroPhotoImageUrl) return
      ctx.session.lastUpscaledImageUrl = ctx.session.lastNeuroPhotoImageUrl
      await upscaleImage({ imageUrl: ctx.session.lastNeuroPhotoImageUrl })
    })`
    const rg = analyze(good)
    expect(rg.consumeBeforeCharge).toBe(true)
    expect(rg.guardPresent).toBe(true)
  })
})
