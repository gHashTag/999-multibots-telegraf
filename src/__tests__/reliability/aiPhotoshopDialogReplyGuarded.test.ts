/**
 * Ratchet: the AI Photoshop dialog-mode status reply that embeds raw user text
 * under parse_mode is wrapped in a try/catch, so a Telegram 400 cannot abort the
 * edit or lock the dialog.
 *
 * The on('text') dialog branch sets ctx.session.aiPhotoshopStep='processing',
 * then replies with a Markdown template embedding raw "${messageText}". An
 * unbalanced reserved char (_ * backtick [) in the user text makes Telegram 400
 * and reject the awaited reply; the throw skips the following
 * processAiPhotoshopRequest, so the edit is silently dropped AND aiPhotoshopStep
 * stays 'processing' -- a sticky dialog lockout the user cannot escape.
 *
 * The fix wraps that reply in try/catch with a plain-text fallback. This pins
 * that every ctx.reply which interpolates messageText AND sets parse_mode sits
 * inside a try block (guarded), so a cosmetic Markdown failure can never abort
 * the flow. Structural (nearest-try analysis) -> self-check + floor +
 * mutation-verified.
 *
 * loop-fable iter216 (wave-17 markdownv2-delivery-loss lens). Guard/fallback
 * direction, no behaviour change beyond safety.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(__dirname, '../../scenes/aiPhotoshopScene/index.ts')

function nearestTry(n: ts.Node): ts.TryStatement | undefined {
  let p = n.parent
  while (p) {
    if (ts.isTryStatement(p)) return p
    p = p.parent
  }
  return undefined
}

function analyze(source: string): {
  messageTextParseModeReplies: number
  guarded: number
} {
  const sf = ts.createSourceFile('a.ts', source, ts.ScriptTarget.Latest, true)

  // The follow-up work a failing status reply must NOT be able to skip.
  const followUps: ts.Node[] = []
  const collectFollowUps = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      ((ts.isIdentifier(n.expression) &&
        n.expression.text === 'processAiPhotoshopRequest') ||
        (ts.isPropertyAccessExpression(n.expression) &&
          n.expression.name.text === 'process'))
    )
      followUps.push(n)
    n.forEachChild(collectFollowUps)
  }
  collectFollowUps(sf)

  let total = 0
  let guarded = 0

  const isReplyCall = (n: ts.Node): n is ts.CallExpression =>
    ts.isCallExpression(n) &&
    ts.isPropertyAccessExpression(n.expression) &&
    n.expression.name.text === 'reply'

  const visit = (n: ts.Node): void => {
    if (isReplyCall(n) && n.arguments.length >= 2) {
      const arg0 = n.arguments[0].getText(sf)
      const arg1 = n.arguments[1].getText(sf)
      if (/messageText/.test(arg0) && /parse_mode/.test(arg1)) {
        total++
        const t = nearestTry(n)
        if (t) {
          const start = n.getStart(sf)
          const inTryBlock =
            start >= t.tryBlock.getStart(sf) && start < t.tryBlock.getEnd()
          // ISOLATED: the reply sits in a try whose block does NOT also contain
          // the follow-up call. An outer handler try that wraps BOTH does not
          // isolate them -- a reply throw still skips the follow-up -- so it must
          // NOT count as guarded.
          const followUpInSameTry = followUps.some(
            f =>
              f.getStart(sf) >= t.tryBlock.getStart(sf) &&
              f.getStart(sf) < t.tryBlock.getEnd()
          )
          if (inTryBlock && !followUpInSameTry) guarded++
        }
      }
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return { messageTextParseModeReplies: total, guarded }
}

describe('AI Photoshop dialog status reply cannot 400 the edit into a lockout', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const a = analyze(source)

  // matcher-not-stale floor: the raw-user-text status reply this guards exists.
  it('floor: a messageText-embedding parse_mode reply still exists', () => {
    expect(a.messageTextParseModeReplies).toBeGreaterThanOrEqual(1)
  })

  it('every messageText-embedding parse_mode reply is inside a try block', () => {
    expect(a.guarded).toBe(a.messageTextParseModeReplies)
  })

  it('self-check: an unguarded raw-text parse_mode reply is detected', () => {
    const bad = `async function h(ctx) {
      const messageText = ctx.message.text
      await ctx.reply(\`edit: "\${messageText}"\`, { parse_mode: 'Markdown' })
      await process(ctx, messageText)
    }`
    const rb = analyze(bad)
    expect(rb.messageTextParseModeReplies).toBe(1)
    expect(rb.guarded).toBe(0)

    const good = `async function h(ctx) {
      const messageText = ctx.message.text
      try {
        await ctx.reply(\`edit: "\${messageText}"\`, { parse_mode: 'Markdown' })
      } catch { await ctx.reply('plain').catch(() => {}) }
      await process(ctx, messageText)
    }`
    const rg = analyze(good)
    expect(rg.messageTextParseModeReplies).toBe(1)
    expect(rg.guarded).toBe(1)
  })
})
