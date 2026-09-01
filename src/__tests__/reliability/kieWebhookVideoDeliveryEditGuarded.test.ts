/**
 * Ratchet: in the KIE video webhook, the status editMessageText is isolated from
 * sendVideo, so a stale-message 400 cannot drop a paid video after the delivery
 * claim is spent.
 *
 * Kie video models (e.g. Sora 2 Pro, 19 stars) skip polling, so the callback in
 * kie-ai-webhook.routes.ts is their ONLY delivery path. handleSoraSuccess (and
 * the sibling branches) consume claimVideoJobDelivery BEFORE the delivery try,
 * then edit the progress message to a "sending..." status and call
 * telegram.sendVideo. If that cosmetic editMessageText shares the delivery try
 * with sendVideo and throws a Telegram 400 (message >48h old / deleted /
 * MESSAGE_ID_INVALID), the throw jumps to the outer catch, sendVideo never runs,
 * and because the claim is already spent every retry is skipped as "duplicate" --
 * the finished video is lost for good.
 *
 * The fix wraps that editMessageText in its own try/catch (log-and-continue), so
 * it is no longer a direct statement of the delivery try. This pins it: no
 * editMessageText may sit in the SAME try that contains sendVideo. Mirrors
 * videoDeliveryEditGuarded (#1528, the polling path). Structural -> self-check +
 * floor + mutation-verified. loop-fable iter218 (wave-18 stale-message lens).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(
  __dirname,
  '../../api_server/routes/kie-ai-webhook.routes.ts'
)

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
  sendVideo: number
  editCalls: number
  unguardedEditsInDeliveryTry: number
} {
  const sf = ts.createSourceFile('k.ts', source, ts.ScriptTarget.Latest, true)
  const sendNodes: ts.Node[] = []
  const editNodes: ts.Node[] = []
  const visit = (n: ts.Node): void => {
    if (isCall(n, 'sendVideo')) sendNodes.push(n)
    if (isCall(n, 'editMessageText')) editNodes.push(n)
    n.forEachChild(visit)
  }
  visit(sf)

  const deliveryTries = new Set<ts.TryStatement>()
  for (const s of sendNodes) {
    const t = nearestTry(s)
    if (t) deliveryTries.add(t)
  }

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
    sendVideo: sendNodes.length,
    editCalls: editNodes.length,
    unguardedEditsInDeliveryTry: unguarded,
  }
}

describe('KIE webhook status edit cannot abort sendVideo', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const a = analyze(source)

  // matcher-not-stale floor: the delivery path this ratchet guards still exists.
  it('still has a sendVideo delivery and editMessageText status edits', () => {
    expect(a.sendVideo).toBeGreaterThanOrEqual(1)
    expect(a.editCalls).toBeGreaterThanOrEqual(1)
  })

  it('no editMessageText shares the delivery try with sendVideo', () => {
    expect(a.unguardedEditsInDeliveryTry).toBe(0)
  })

  it('self-check: an edit sharing the delivery try is detected', () => {
    const bad = `async function d() {
      try {
        await bot.telegram.editMessageText(a, b, undefined, 'sending')
        await bot.telegram.sendVideo(a, url)
      } catch (e) { await bot.telegram.editMessageText(a, b, undefined, 'err') }
    }`
    expect(analyze(bad).unguardedEditsInDeliveryTry).toBe(1)
    const good = `async function d() {
      try {
        try { await bot.telegram.editMessageText(a, b, undefined, 'sending') } catch (e) {}
        await bot.telegram.sendVideo(a, url)
      } catch (e) { await bot.telegram.editMessageText(a, b, undefined, 'err') }
    }`
    expect(analyze(good).unguardedEditsInDeliveryTry).toBe(0)
  })
})
