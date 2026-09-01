/**
 * Ratchet: the global lip_sync_model_* action strips its inline keyboard before
 * entering the target scene, so a stale re-tap cannot re-navigate mid-flow.
 *
 * bot.action(/^lip_sync_model_(.+)$/) is a GLOBAL handler: it fires from ANY
 * scene. It sets ctx.session.selectedLipSyncModel and ctx.scene.enter(target).
 * The model-selection keyboard is a standalone ctx.reply message that the target
 * wizards never touch, so without stripping it, a later tap on a different model
 * button re-fires this handler -- re-entering a wizard, swapping the model, and
 * discarding the user's in-progress upload (a non-money stale-action). No charge
 * occurs (answerCbQuery + scene.enter only), so it is user-recoverable but
 * corrupts the flow.
 *
 * The fix calls ctx.editMessageReplyMarkup(undefined).catch(...) before the
 * scene.enter. This pins that a keyboard-strip (editMessageReplyMarkup or
 * deleteMessage) precedes the scene.enter inside the handler. Structural ->
 * self-check + floor + mutation-verified. loop-fable iter223 (wave-21
 * stale-inline-button-refire lens).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(__dirname, '../../navigation/registerCommands.ts')

function analyze(source: string): {
  handlerFound: boolean
  entersScene: boolean
  stripBeforeEnter: boolean
} {
  const sf = ts.createSourceFile('r.ts', source, ts.ScriptTarget.Latest, true)

  let handler: ts.CallExpression | undefined
  const find = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === 'action' &&
      n.arguments.length >= 1 &&
      ts.isRegularExpressionLiteral(n.arguments[0]) &&
      /lip_sync_model/.test(n.arguments[0].text)
    ) {
      handler = n
    }
    n.forEachChild(find)
  }
  find(sf)
  if (!handler)
    return { handlerFound: false, entersScene: false, stripBeforeEnter: false }

  const lo = handler.getStart(sf)
  const hi = handler.getEnd()
  const inHandler = (n: ts.Node) => n.getStart(sf) >= lo && n.getEnd() <= hi

  const enterPos: number[] = []
  const stripPos: number[] = []
  const visit = (n: ts.Node): void => {
    if (
      inHandler(n) &&
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression)
    ) {
      const nm = n.expression.name.text
      if (nm === 'enter') enterPos.push(n.getStart(sf))
      if (nm === 'editMessageReplyMarkup' || nm === 'deleteMessage')
        stripPos.push(n.getStart(sf))
    }
    n.forEachChild(visit)
  }
  visit(sf)

  const firstEnter = enterPos.length ? Math.min(...enterPos) : Infinity
  const firstStrip = stripPos.length ? Math.min(...stripPos) : Infinity
  return {
    handlerFound: true,
    entersScene: enterPos.length > 0,
    stripBeforeEnter: firstStrip < firstEnter,
  }
}

describe('lip_sync_model_* strips its keyboard before scene.enter (no stale re-tap)', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const a = analyze(source)

  it('floor: the lip_sync_model_* handler still enters a scene', () => {
    expect(a.handlerFound).toBe(true)
    expect(a.entersScene).toBe(true)
  })

  it('a keyboard-strip precedes the scene.enter', () => {
    expect(a.stripBeforeEnter).toBe(true)
  })

  it('self-check: a handler that enters without stripping is detected', () => {
    const bad = `bot.action(/^lip_sync_model_(.+)$/, async ctx => {
      await ctx.answerCbQuery()
      ctx.session.selectedLipSyncModel = ctx.match[1]
      await ctx.scene.enter('lip_sync')
    })`
    const rb = analyze(bad)
    expect(rb.handlerFound).toBe(true)
    expect(rb.stripBeforeEnter).toBe(false)

    const good = `bot.action(/^lip_sync_model_(.+)$/, async ctx => {
      await ctx.answerCbQuery()
      await ctx.editMessageReplyMarkup(undefined).catch(() => {})
      await ctx.scene.enter('lip_sync')
    })`
    expect(analyze(good).stripBeforeEnter).toBe(true)
  })
})
