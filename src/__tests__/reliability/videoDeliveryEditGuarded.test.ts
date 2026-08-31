/**
 * Ratchet: the status editMessageText on the video delivery path is isolated,
 * so a stale-message throw cannot skip replyWithVideo.
 *
 * handleVideoReady consumes an idempotency claim (claimVideoJobDelivery) BEFORE
 * the delivery try, then edits the progress message to "Sending..." and calls
 * ctx.replyWithVideo. If that cosmetic editMessageText shares the delivery try
 * with replyWithVideo and throws a Telegram 400 (message >48h old / deleted /
 * MESSAGE_ID_INVALID), the throw jumps to the outer catch, replyWithVideo never
 * runs, and because the claim is already spent, every retry (poll tick / status
 * button) is skipped as "duplicate" -- the finished video is lost for good.
 *
 * The fix wraps that editMessageText in its own try/catch (log-and-continue), so
 * it is no longer a direct statement of the delivery try. This pins it: no
 * editMessageText may sit in the SAME try that contains replyWithVideo.
 *
 * loop-fable iter204 (wave-9 telegram-api-throw-swallow lens). The error-path
 * edits earlier in the file are on return paths (no replyWithVideo in their try)
 * and are correctly not flagged.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(
  __dirname,
  '../../handlers/handleTextToVideoDirect.ts'
)

/** Nearest enclosing TryStatement of `n`, or undefined. */
function nearestTry(n: ts.Node): ts.TryStatement | undefined {
  let p = n.parent
  while (p) {
    if (ts.isTryStatement(p)) return p
    p = p.parent
  }
  return undefined
}

function isCall(n: ts.Node, name: string): boolean {
  return (
    ts.isCallExpression(n) &&
    ts.isPropertyAccessExpression(n.expression) &&
    n.expression.name.text === name
  )
}

function analyze(source: string): {
  replyWithVideo: number
  editCalls: number
  unguardedEditsInDeliveryTry: number
} {
  const sf = ts.createSourceFile('h.ts', source, ts.ScriptTarget.Latest, true)
  const replyNodes: ts.Node[] = []
  const editNodes: ts.Node[] = []
  const visit = (n: ts.Node): void => {
    if (isCall(n, 'replyWithVideo')) replyNodes.push(n)
    if (isCall(n, 'editMessageText')) editNodes.push(n)
    n.forEachChild(visit)
  }
  visit(sf)

  // The delivery tries: every try that directly (transitively) contains a
  // replyWithVideo call.
  const deliveryTries = new Set<ts.TryStatement>()
  for (const r of replyNodes) {
    const t = nearestTry(r)
    if (t) deliveryTries.add(t)
  }

  // An edit is unguarded if its NEAREST try is a delivery try AND it sits in
  // that try's tryBlock (not its catch/finally). An edit inside the catch is a
  // legitimate error-notification that runs only after delivery already failed,
  // so it cannot abort the send and must not be flagged. An edit with its own
  // inner try has a different nearestTry and is correctly excluded.
  let unguarded = 0
  for (const e of editNodes) {
    const t = nearestTry(e)
    if (!t || !deliveryTries.has(t)) continue
    const start = e.getStart(sf)
    const inTryBlock =
      start >= t.tryBlock.getStart(sf) && start < t.tryBlock.getEnd()
    if (inTryBlock) unguarded++
  }

  return {
    replyWithVideo: replyNodes.length,
    editCalls: editNodes.length,
    unguardedEditsInDeliveryTry: unguarded,
  }
}

describe('video delivery status edit cannot abort replyWithVideo', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const a = analyze(source)

  // matcher-not-stale floor: the delivery path this ratchet guards still exists.
  it('still has a replyWithVideo delivery and editMessageText calls', () => {
    expect(a.replyWithVideo).toBeGreaterThanOrEqual(1)
    expect(a.editCalls).toBeGreaterThanOrEqual(1)
  })

  it('no editMessageText shares the delivery try with replyWithVideo', () => {
    expect(a.unguardedEditsInDeliveryTry).toBe(0)
  })

  it('self-check: an edit sharing the delivery try is detected', () => {
    const bad = `async function d(ctx) {
      try {
        await ctx.telegram.editMessageText(id, m, undefined, 'Sending...')
        await ctx.replyWithVideo(url)
      } catch (e) { await ctx.reply('error') }
    }`
    expect(analyze(bad).unguardedEditsInDeliveryTry).toBe(1)
    const good = `async function d(ctx) {
      try {
        try { await ctx.telegram.editMessageText(id, m, undefined, 'Sending...') } catch (e) {}
        await ctx.replyWithVideo(url)
      } catch (e) { await ctx.reply('error') }
    }`
    expect(analyze(good).unguardedEditsInDeliveryTry).toBe(0)
  })
})
