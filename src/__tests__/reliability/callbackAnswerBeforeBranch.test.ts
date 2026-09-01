/**
 * Ratchet: in the subscription and menu callback steps, the callback query is
 * answered BEFORE branching on its data, so no button spinner hangs ~30s.
 *
 * These steps use a positive `if ('callback_query' in ctx.update && 'data' in
 * ...)` block, then branch on the callback text. Before the fix, subscriptionScene
 * answered on NO branch (every plan tap -> scene.enter PaymentScene / admin /
 * mainmenu / unknown left the spinner spinning ~30s on a PAID flow), and
 * menuScene answered only in the go_to_subscription_scene branch (unlock_features
 * / else hung). Sibling of the heygen fix (#1560), found by an answerCbQuery
 * sweep of every callback-handling scene.
 *
 * The fix answers as the FIRST statement inside the callback-if block, so all
 * branches inherit it. This pins that every `if ('callback_query' in ctx.update
 * ...)` block in these files has an answerCbQuery as a DIRECT statement (an
 * answer nested inside a data-branch only covers that branch). Structural ->
 * self-check + floor + mutation-verified. loop-fable iter217 (spinner-sweep).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILES = [
  path.resolve(__dirname, '../../scenes/subscriptionScene/index.ts'),
  path.resolve(__dirname, '../../scenes/menuScene/index.ts'),
]

function analyze(source: string): {
  callbackBlocks: number
  answeredBeforeBranch: number
} {
  const sf = ts.createSourceFile('s.ts', source, ts.ScriptTarget.Latest, true)
  let callbackBlocks = 0
  let answeredBeforeBranch = 0

  const visit = (n: ts.Node): void => {
    if (ts.isIfStatement(n)) {
      const cond = n.expression.getText(sf)
      // A positive callback-handling block: reads the callback_query + its data.
      if (
        /callback_query'\s*in\s*ctx\.update/.test(cond) &&
        /'data'\s*in/.test(cond) &&
        ts.isBlock(n.thenStatement)
      ) {
        callbackBlocks++
        const answered = n.thenStatement.statements.some(
          s =>
            ts.isExpressionStatement(s) && /answerCbQuery/.test(s.getText(sf))
        )
        if (answered) answeredBeforeBranch++
      }
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return { callbackBlocks, answeredBeforeBranch }
}

describe('subscription/menu callback steps answer before branching (no spinner hang)', () => {
  for (const file of FILES) {
    const name = path.basename(path.dirname(file))
    const a = analyze(fs.readFileSync(file, 'utf8'))

    it(`floor: ${name} still has a positive callback-handling block`, () => {
      expect(a.callbackBlocks).toBeGreaterThanOrEqual(1)
    })

    it(`${name}: every callback block answers before branching`, () => {
      expect(a.answeredBeforeBranch).toBe(a.callbackBlocks)
    })
  }

  it('self-check: an answer nested only inside a data-branch is detected', () => {
    const bad = `async ctx => {
      if ('callback_query' in ctx.update && 'data' in ctx.update.callback_query) {
        const text = ctx.update.callback_query.data
        if (text === 'a') { await ctx.answerCbQuery(); return ctx.scene.leave() }
        else { await ctx.reply('x') }
      }
    }`
    const rb = analyze(bad)
    expect(rb.callbackBlocks).toBe(1)
    expect(rb.answeredBeforeBranch).toBe(0)

    const good = `async ctx => {
      if ('callback_query' in ctx.update && 'data' in ctx.update.callback_query) {
        await ctx.answerCbQuery().catch(() => {})
        const text = ctx.update.callback_query.data
        if (text === 'a') { return ctx.scene.leave() }
        else { await ctx.reply('x') }
      }
    }`
    const rg = analyze(good)
    expect(rg.callbackBlocks).toBe(1)
    expect(rg.answeredBeforeBranch).toBe(1)
  })
})
