/**
 * Ratchet: every callback-handling step of heygenRenderWizard answers the
 * callback query at its top level, so no branch leaves the button spinner hung.
 *
 * heygenRenderWizard steps that handle a button tap guard on
 * `!('callback_query' in ctx.update)`, then branch. Before the fix, only the
 * recognized-option branch called answerCbQuery; the else / missing-avatar /
 * missing-id branches did reply + scene.leave WITHOUT answering, so the tapped
 * button's loading spinner span ~30s (reads as "the bot is broken"). This is the
 * live locus of the class whose anchored file (ai-reels-render-wizard.ts) was
 * dead -- the wave-17 verifier relocated it here.
 *
 * The fix answers once at the top of each callback step (after the guard), so
 * every branch inherits it. This pins that every step reading
 * ctx.update.callback_query has an answerCbQuery as a TOP-LEVEL statement of the
 * step body (not nested in an if-branch). Structural -> self-check + floor +
 * mutation-verified. loop-fable iter216 (wave-17 callback-spinner-hang lens).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(
  __dirname,
  '../../scenes/lipSyncWizard/heygen-render-wizard.ts'
)

function analyze(source: string): {
  callbackSteps: number
  answeredAtTopLevel: number
} {
  const sf = ts.createSourceFile('h.ts', source, ts.ScriptTarget.Latest, true)
  let callbackSteps = 0
  let answeredAtTopLevel = 0

  const stmtHasAnswer = (n: ts.Node): boolean =>
    /answerCbQuery/.test(n.getText(sf))

  const visit = (n: ts.Node): void => {
    if (
      (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) &&
      n.body &&
      ts.isBlock(n.body)
    ) {
      const bodyText = n.body.getText(sf)
      // A callback-handling step reads the callback_query off the update.
      if (/callback_query'\s*in\s*ctx\.update/.test(bodyText)) {
        callbackSteps++
        // Answered unconditionally: a DIRECT ExpressionStatement of the step
        // block that calls answerCbQuery (an if-nested answer does not count --
        // it only covers one branch).
        const topLevelAnswer = n.body.statements.some(
          s => ts.isExpressionStatement(s) && stmtHasAnswer(s)
        )
        if (topLevelAnswer) answeredAtTopLevel++
      }
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return { callbackSteps, answeredAtTopLevel }
}

describe('heygenRenderWizard callback steps answer the spinner on every branch', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const a = analyze(source)

  // matcher-not-stale floor: the callback-handling steps this guards exist.
  it('floor: heygenRenderWizard still has callback-handling steps', () => {
    expect(a.callbackSteps).toBeGreaterThanOrEqual(1)
  })

  it('every callback-handling step answers the callback at top level', () => {
    expect(a.answeredAtTopLevel).toBe(a.callbackSteps)
  })

  it('self-check: a callback step that answers only inside an if-branch is detected', () => {
    const bad = `const w = new WizardScene('x',
      async ctx => {
        if (!('callback_query' in ctx.update)) { return }
        const d = ctx.update.callback_query.data
        if (d === 'ok') { await ctx.answerCbQuery(); return ctx.wizard.next() }
        else { await ctx.reply('unknown'); return ctx.scene.leave() }
      })`
    const rb = analyze(bad)
    expect(rb.callbackSteps).toBe(1)
    expect(rb.answeredAtTopLevel).toBe(0)

    const good = `const w = new WizardScene('x',
      async ctx => {
        if (!('callback_query' in ctx.update)) { return }
        await ctx.answerCbQuery().catch(() => {})
        const d = ctx.update.callback_query.data
        if (d === 'ok') { return ctx.wizard.next() }
        else { await ctx.reply('unknown'); return ctx.scene.leave() }
      })`
    const rg = analyze(good)
    expect(rg.callbackSteps).toBe(1)
    expect(rg.answeredAtTopLevel).toBe(1)
  })
})
