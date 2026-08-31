/**
 * Ratchet: every direct upscaleImage() in aiPhotoshopScene holds an in-flight
 * lock, so a double-tap cannot double-charge.
 *
 * The AI Photoshop generation paths funnel through processAiPhotoshopRequest,
 * which holds the reject-before-set ctx.session.aiPhotoshopInProgress guard
 * (#1362). But two entry points charge via upscaleImage() DIRECTLY, bypassing
 * that choke point: the persistent 'ai_photoshop_upscale_last' button and the
 * on('text') upscale-keyword branch. In webhook mode a double-tap / fast
 * double-send dispatches concurrent requests; processBalanceOperation is a
 * non-atomic read-check-write, so both pass the balance check and both write a
 * MONEY_OUTCOME row -> the user is charged twice and two Replicate upscaler runs
 * launch.
 *
 * The fix wraps each direct upscaleImage() in its handler with a dedicated
 * reject-before-set guard: `if (ctx.session.aiPhotoshopUpscaleInProgress) return;
 * ctx.session.aiPhotoshopUpscaleInProgress = true` (check-then-set atomic, no
 * await between), released in a finally. This pins it: every upscaleImage() call
 * in this scene must sit in a function that sets that flag.
 *
 * loop-fable iter204 (wave-9 double-tap-paid-action lens). Sibling of
 * aiPhotoshopInflightGuard.test.ts (the generation choke point) and
 * avatarTransformQuotaGuard.test.ts (#1503). Guard-only SKIP -> autonomous-safe.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(__dirname, '../../scenes/aiPhotoshopScene/index.ts')
const FLAG = 'aiPhotoshopUpscaleInProgress'

/** Nearest enclosing function-like node of `n` (arrow / function / method). */
function enclosingFunction(n: ts.Node): ts.Node | undefined {
  let p = n.parent
  while (p) {
    if (
      ts.isArrowFunction(p) ||
      ts.isFunctionExpression(p) ||
      ts.isFunctionDeclaration(p) ||
      ts.isMethodDeclaration(p)
    ) {
      return p
    }
    p = p.parent
  }
  return undefined
}

/** Does the subtree contain `<...>.aiPhotoshopUpscaleInProgress = true`? */
function setsFlagTrue(n: ts.Node): boolean {
  let found = false
  const walk = (m: ts.Node): void => {
    if (
      ts.isBinaryExpression(m) &&
      m.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(m.left) &&
      m.left.name.text === FLAG &&
      m.right.kind === ts.SyntaxKind.TrueKeyword
    ) {
      found = true
    }
    m.forEachChild(walk)
  }
  walk(n)
  return found
}

function analyze(source: string): {
  upscaleCalls: number
  guardedUpscaleCalls: number
  rejectChecks: number
  releases: number
} {
  const sf = ts.createSourceFile('s.ts', source, ts.ScriptTarget.Latest, true)
  let upscaleCalls = 0
  let guardedUpscaleCalls = 0
  let rejectChecks = 0
  let releases = 0
  const visit = (n: ts.Node): void => {
    // upscaleImage(...) call
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === 'upscaleImage'
    ) {
      upscaleCalls++
      const fn = enclosingFunction(n)
      if (fn && setsFlagTrue(fn)) guardedUpscaleCalls++
    }
    // reject-before-set check: if (...aiPhotoshopUpscaleInProgress...)
    if (ts.isIfStatement(n)) {
      let refs = false
      const w = (m: ts.Node): void => {
        if (ts.isIdentifier(m) && m.text === FLAG) refs = true
        m.forEachChild(w)
      }
      w(n.expression)
      if (refs) rejectChecks++
    }
    // release: aiPhotoshopUpscaleInProgress = false
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(n.left) &&
      n.left.name.text === FLAG &&
      n.right.kind === ts.SyntaxKind.FalseKeyword
    ) {
      releases++
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return { upscaleCalls, guardedUpscaleCalls, rejectChecks, releases }
}

describe('every direct upscaleImage in aiPhotoshopScene holds an in-flight lock (no double-charge)', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const a = analyze(source)

  // matcher-not-stale floor: the scene still charges via a direct upscaleImage.
  it('still has at least one direct upscaleImage call to guard', () => {
    expect(a.upscaleCalls).toBeGreaterThanOrEqual(1)
  })

  it('every upscaleImage call sits in a handler that sets the in-flight flag', () => {
    expect(a.guardedUpscaleCalls).toBe(a.upscaleCalls)
  })

  it('has a reject-before-set check and a release per guarded upscale', () => {
    expect(a.rejectChecks).toBeGreaterThanOrEqual(a.upscaleCalls)
    expect(a.releases).toBeGreaterThanOrEqual(a.upscaleCalls)
  })

  it('self-check: an unguarded upscaleImage handler is detected', () => {
    const bad = `scene.action('x', async ctx => {
      await ctx.answerCbQuery()
      await upscaleImage({ imageUrl, ctx })
    })`
    const r = analyze(bad)
    expect(r.upscaleCalls).toBe(1)
    expect(r.guardedUpscaleCalls).toBe(0)
  })
})
