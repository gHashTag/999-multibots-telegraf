/**
 * Ratchet: I2V admin-alert fan-outs are throttled by a cooldown.
 *
 * generateImageToVideo notifies admins on Plan-B events (server-issue,
 * plan-B-success). Each notification fans out to EVERY admin id, and the events
 * can burst (many videos degrade in one window), so without a cooldown a single
 * degraded window floods admin chats and risks Telegram flood limits. The fix
 * gates each fan-out behind adminNotifyOnCooldown(key).
 *
 * This pins it: every admin fan-out -- a sendMessage(adminId, ...) call -- sits
 * in a function that also calls adminNotifyOnCooldown BEFORE it.
 *
 * loop-fable iter201 (backlog from bug-hunt-wave5 notify-amplify lens).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(
  __dirname,
  '../../modules/videoGenerator/generateImageToVideo.ts'
)

function enclosingFunction(n: ts.Node): ts.Node | undefined {
  let c: ts.Node | undefined = n.parent
  while (c) {
    if (
      ts.isFunctionDeclaration(c) ||
      ts.isFunctionExpression(c) ||
      ts.isArrowFunction(c) ||
      ts.isMethodDeclaration(c)
    ) {
      return c
    }
    c = c.parent
  }
  return undefined
}

/** Is `n` a `<x>.sendMessage(adminId, ...)` call (the per-admin fan-out)? */
function isAdminSend(n: ts.Node, sf: ts.SourceFile): boolean {
  if (!ts.isCallExpression(n)) return false
  if (
    !(
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === 'sendMessage'
    )
  )
    return false
  const first = n.arguments[0]
  return !!first && first.getText(sf) === 'adminId'
}

function analyze(source: string) {
  const sf = ts.createSourceFile(
    'generateImageToVideo.ts',
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  )
  // Positions of adminNotifyOnCooldown(...) calls per enclosing-function start.
  const cooldownByFn = new Map<number, number[]>()
  const adminSends: { fnStart: number; pos: number }[] = []
  const visit = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === 'adminNotifyOnCooldown'
    ) {
      const fn = enclosingFunction(n)
      if (fn) {
        const key = fn.getStart(sf)
        if (!cooldownByFn.has(key)) cooldownByFn.set(key, [])
        cooldownByFn.get(key)!.push(n.getStart(sf))
      }
    }
    if (isAdminSend(n, sf)) {
      const fn = enclosingFunction(n)
      if (fn) adminSends.push({ fnStart: fn.getStart(sf), pos: n.getStart(sf) })
    }
    n.forEachChild(visit)
  }
  visit(sf)

  const ungated = adminSends.filter(s => {
    const cds = cooldownByFn.get(s.fnStart) || []
    return !cds.some(cd => cd < s.pos)
  })
  return { adminSends: adminSends.length, ungated: ungated.length }
}

describe('I2V admin-alert fan-outs are cooldown-throttled', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const { adminSends, ungated } = analyze(source)

  it('self-check: detector distinguishes a gated fan-out from a bare one', () => {
    const gated = `async function f(){ if (adminNotifyOnCooldown('k')) return; for (const adminId of ids){ await bot.telegram.sendMessage(adminId, m) } }`
    const bare = `async function f(){ for (const adminId of ids){ await bot.telegram.sendMessage(adminId, m) } }`
    expect(analyze(gated).ungated).toBe(0)
    expect(analyze(bare).ungated).toBe(1)
  })

  it('matcher is not stale: the file still fans a message out to admins', () => {
    expect(adminSends).toBeGreaterThanOrEqual(1)
  })

  it('every admin fan-out is preceded by an adminNotifyOnCooldown check', () => {
    expect(
      ungated,
      `An admin sendMessage(adminId, ...) fan-out is not gated by ` +
        `adminNotifyOnCooldown -- a burst of Plan-B events floods admin chats.`
    ).toBe(0)
  })
})
