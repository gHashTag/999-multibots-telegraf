/**
 * Ratchet: the bot.action('upscale_image') handler consumes the target image
 * BEFORE it fires the paid upscale, so a stale re-tap cannot re-charge.
 *
 * The ⬆️ Upscale button rides a persistent photo-caption inline keyboard that is
 * never edited away, and ctx.session.lastGeneratedImageUrl is set once at
 * generation and never cleared. Without a one-shot guard, tapping the old button
 * again later (or a concurrent double-tap) re-runs upscaleFluxKontextImage on the
 * same URL and re-charges the user for a result they already paid for.
 *
 * The fix refuses when lastUpscaledImageUrl === lastGeneratedImageUrl, and marks
 * the URL consumed (lastUpscaledImageUrl = lastGeneratedImageUrl) BEFORE the
 * charge -- a synchronous check-then-set, so the second tap of a stale button
 * (and, best-effort, a same-tick double-tap) is refused. This pins the ordering:
 * inside the upscale_image handler the consume assignment must precede the
 * upscaleFluxKontextImage call, and the equality refuse-guard must be present.
 *
 * loop-fable iter211 (wave-14 stale-persistent-button-replay lens). This is a
 * skip/guard-direction fix (refuses the replay, adds no credit) -> autonomous.
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

  // Locate the bot.action('upscale_image', ...) CallExpression.
  let handler: ts.CallExpression | undefined
  const findHandler = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === 'action' &&
      n.arguments.length >= 1 &&
      ts.isStringLiteral(n.arguments[0]) &&
      n.arguments[0].text === 'upscale_image'
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

  const chargePositions: number[] = []
  const consumePositions: number[] = []
  let guardPresent = false

  const isSessionProp = (n: ts.Node, prop: string): boolean =>
    ts.isPropertyAccessExpression(n) && n.name.text === prop

  const visit = (n: ts.Node): void => {
    if (inHandler(n)) {
      // charge: a call to upscaleFluxKontextImage(...)
      if (
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) &&
        n.expression.text === 'upscaleFluxKontextImage'
      ) {
        chargePositions.push(n.getStart(sf))
      }
      if (ts.isBinaryExpression(n)) {
        // consume: assignment  ...lastUpscaledImageUrl = ...
        if (
          n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          isSessionProp(n.left, 'lastUpscaledImageUrl')
        ) {
          consumePositions.push(n.getStart(sf))
        }
        // refuse guard: lastUpscaledImageUrl === lastGeneratedImageUrl
        if (
          n.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
          ((isSessionProp(n.left, 'lastUpscaledImageUrl') &&
            isSessionProp(n.right, 'lastGeneratedImageUrl')) ||
            (isSessionProp(n.left, 'lastGeneratedImageUrl') &&
              isSessionProp(n.right, 'lastUpscaledImageUrl')))
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

describe('upscale_image consumes the image before charging (no stale-tap replay)', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const a = analyze(source)

  // matcher-not-stale floor: the paid upscale handler this ratchet guards exists.
  it('floor: the upscale_image handler still charges via upscaleFluxKontextImage', () => {
    expect(a.handlerFound).toBe(true)
    expect(a.chargeCalls).toBeGreaterThanOrEqual(1)
  })

  it('marks the image consumed before the upscale charge, with a refuse guard', () => {
    expect(a.consumeBeforeCharge).toBe(true)
    expect(a.guardPresent).toBe(true)
  })

  it('self-check: a handler that charges without consuming first is detected', () => {
    const bad = `bot.action('upscale_image', async ctx => {
      if (!ctx.session.lastGeneratedImageUrl) return
      await upscaleFluxKontextImage({ imageUrl: ctx.session.lastGeneratedImageUrl })
    })`
    const rb = analyze(bad)
    expect(rb.handlerFound).toBe(true)
    expect(rb.consumeBeforeCharge).toBe(false)
    expect(rb.guardPresent).toBe(false)

    const good = `bot.action('upscale_image', async ctx => {
      if (ctx.session.lastUpscaledImageUrl === ctx.session.lastGeneratedImageUrl) return
      ctx.session.lastUpscaledImageUrl = ctx.session.lastGeneratedImageUrl
      await upscaleFluxKontextImage({ imageUrl: ctx.session.lastGeneratedImageUrl })
    })`
    const rg = analyze(good)
    expect(rg.consumeBeforeCharge).toBe(true)
    expect(rg.guardPresent).toBe(true)
  })

  it('mutation: removing the real consume assignment turns the check RED', () => {
    // Revert the actual fix in the real handler (the consume-before-charge line)
    // and prove the detector fires -- the strongest false-ruler defense, coupling
    // this ratchet to the FIX, not just to a synthetic input.
    const mutated = source.replace(
      'ctx.session.lastUpscaledImageUrl = ctx.session.lastGeneratedImageUrl',
      ''
    )
    expect(mutated).not.toEqual(source)
    expect(analyze(mutated).consumeBeforeCharge).toBe(false)
  })
})
