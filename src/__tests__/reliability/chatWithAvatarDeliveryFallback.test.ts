/**
 * Ratchet: chatWithAvatarWizard's image delivery has a fallback path.
 *
 * The Nano Banana Pro image branch charges the user (inside answerAi) BEFORE
 * delivery, then delivers with ctx.replyWithPhoto(response.imageUrl). Photo-by-
 * URL delivery fails on an oversized/high-dimension generated image even with a
 * valid URL (Telegram photo limits), which previously left the user charged
 * with no image and no refund. The fix delivers as a document on that failure
 * so the image still reaches the user.
 *
 * This pins the fix: the replyWithPhoto in this scene must sit inside a try
 * whose catch delivers a fallback (replyWithDocument). The COMPLETE money fix
 * (refund when the image is genuinely undeliverable) is owner-reviewed and
 * tracked separately -- this ratchet only guards the delivery-robustness path.
 *
 * loop-fable iter194 (found by the bug-hunt-fanout workflow).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const SCENE = path.resolve(
  __dirname,
  '../../scenes/chatWithAvatarWizard/index.ts'
)

function callName(n: ts.CallExpression): string {
  const e = n.expression
  return ts.isPropertyAccessExpression(e) ? e.name.text : ''
}

/**
 * For the given source, does every replyWithPhoto call sit inside a try whose
 * catch block contains a replyWithDocument call? Returns the analysis.
 */
function analyze(source: string) {
  const sf = ts.createSourceFile(
    'chatWithAvatarWizard.ts',
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  )

  const photoCalls: ts.CallExpression[] = []
  const collect = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && callName(n) === 'replyWithPhoto') {
      photoCalls.push(n)
    }
    n.forEachChild(collect)
  }
  collect(sf)

  const catchHasDocumentFallback = (block: ts.Block): boolean => {
    let found = false
    const walk = (n: ts.Node): void => {
      if (ts.isCallExpression(n) && callName(n) === 'replyWithDocument') {
        found = true
      }
      n.forEachChild(walk)
    }
    walk(block)
    return found
  }

  // Nearest enclosing try whose catch has a document fallback.
  const guarded = (call: ts.Node): boolean => {
    let c: ts.Node | undefined = call.parent
    while (c) {
      if (ts.isTryStatement(c) && c.catchClause) {
        if (catchHasDocumentFallback(c.catchClause.block)) return true
      }
      c = c.parent
    }
    return false
  }

  return {
    photoCount: photoCalls.length,
    unguarded: photoCalls.filter(p => !guarded(p)),
  }
}

describe('chatWithAvatarWizard image delivery has a fallback', () => {
  const source = fs.readFileSync(SCENE, 'utf8')
  const { photoCount, unguarded } = analyze(source)

  it('self-check: detector distinguishes guarded from unguarded delivery', () => {
    const guardedSrc = `
      async function d(ctx, url, caption) {
        try {
          await ctx.replyWithPhoto(url, { caption })
        } catch (e) {
          await ctx.replyWithDocument(url, { caption })
        }
      }
    `
    const bareSrc = `
      async function d(ctx, url, caption) {
        await ctx.replyWithPhoto(url, { caption })
      }
    `
    expect(analyze(guardedSrc).unguarded.length).toBe(0)
    expect(analyze(bareSrc).unguarded.length).toBe(1)
  })

  it('matcher is not stale: the scene actually delivers a photo', () => {
    expect(photoCount).toBeGreaterThanOrEqual(1)
  })

  it('every replyWithPhoto has a try/catch document fallback', () => {
    expect(
      unguarded.length,
      `chatWithAvatarWizard delivers a paid image via replyWithPhoto with no ` +
        `document fallback -- an oversized image leaves the user charged with ` +
        `nothing. Wrap it in try/catch and deliver via replyWithDocument on failure.`
    ).toBe(0)
  })
})
