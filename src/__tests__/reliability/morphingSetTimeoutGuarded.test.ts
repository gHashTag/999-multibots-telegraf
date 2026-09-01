/**
 * Ratchet: every setTimeout(async () => ...) callback in morphingWizard that
 * awaits a Telegram send is guarded (a .catch or an inner try), so a rejected
 * ctx.reply in a detached timer cannot leak an unhandledRejection.
 *
 * The four milestone (2/5/10/20 images) motivational messages run as
 * setTimeout(async () => { await ctx.reply(...) }, 1000). The enclosing
 * try/catch only wraps the SYNCHRONOUS scheduling call -- the callback runs ~1s
 * later outside that dynamic scope. ctx.reply rejects on ordinary Telegram
 * conditions (user blocked the bot -> 403, rate limit -> 429), so without a
 * .catch the rejection is unhandled. A global process.on('unhandledRejection')
 * handler logs it (no crash), but the message is silently lost and the log is
 * noise; the fix makes the failure graceful. Found by the iter233 wave-4
 * reliability hunt (unhandled-rejection lens; the HIGH crash claim was correctly
 * REFUTED because the global handler only logs -- this pins the LOW hygiene fix).
 *
 * Structural (AST): every setTimeout whose first arg is an async arrow must have
 * a .catch or a try inside the arrow body. floor + self-check + real-source
 * mutation.
 *
 * loop-fable iter233.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(__dirname, '../../scenes/morphingWizard/index.ts')

/** A `setTimeout(<async arrow>, ...)` call. */
function isSetTimeoutAsync(n: ts.Node): n is ts.CallExpression {
  if (
    !ts.isCallExpression(n) ||
    !ts.isIdentifier(n.expression) ||
    n.expression.text !== 'setTimeout'
  ) {
    return false
  }
  const cb = n.arguments[0]
  return (
    !!cb &&
    ts.isArrowFunction(cb) &&
    cb.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) === true
  )
}

/** Does the arrow body contain a `.catch(` call or a try statement? */
function isGuarded(arrow: ts.ArrowFunction): boolean {
  let guarded = false
  const walk = (m: ts.Node): void => {
    if (ts.isTryStatement(m)) guarded = true
    if (
      ts.isCallExpression(m) &&
      ts.isPropertyAccessExpression(m.expression) &&
      m.expression.name.text === 'catch'
    ) {
      guarded = true
    }
    m.forEachChild(walk)
  }
  walk(arrow.body)
  return guarded
}

function analyze(source: string): { total: number; unguarded: number } {
  const sf = ts.createSourceFile(
    'morphingWizard.ts',
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  )
  let total = 0
  let unguarded = 0
  const visit = (n: ts.Node): void => {
    if (isSetTimeoutAsync(n)) {
      total++
      if (!isGuarded(n.arguments[0] as ts.ArrowFunction)) unguarded++
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return { total, unguarded }
}

describe('morphingWizard setTimeout(async) callbacks are guarded (no leaked unhandledRejection)', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const a = analyze(source)

  it('floor: the milestone setTimeout callbacks still exist', () => {
    expect(a.total).toBeGreaterThanOrEqual(4)
  })

  it('every setTimeout(async) callback has a .catch or an inner try', () => {
    expect(
      a.unguarded,
      `A setTimeout(async () => ...) callback in morphingWizard awaits a Telegram ` +
        `send with no .catch/try. A rejected reply in the detached timer leaks an ` +
        `unhandledRejection. Append .catch(() => {}) or wrap the body in try/catch.`
    ).toBe(0)
  })

  it('self-check: detector distinguishes a bare callback from a guarded one', () => {
    const bad = `setTimeout(async () => { await ctx.reply('x') }, 1000)`
    const good = `setTimeout(async () => { await ctx.reply('x').catch(() => {}) }, 1000)`
    const goodTry = `setTimeout(async () => { try { await ctx.reply('x') } catch {} }, 1000)`
    expect(analyze(bad).unguarded).toBe(1)
    expect(analyze(good).unguarded).toBe(0)
    expect(analyze(goodTry).unguarded).toBe(0)
  })

  it('mutation: stripping a real .catch turns the check RED', () => {
    // prettier renders it as `await ctx\n  .reply(...)\n  .catch(() => {})`, so
    // the .catch sits on its own line -- remove one to unguard a callback.
    const mutated = source.replace(/\n\s*\.catch\(\(\) => \{\}\)/, '')
    expect(mutated).not.toEqual(source)
    expect(analyze(mutated).unguarded).toBeGreaterThan(0)
  })
})
