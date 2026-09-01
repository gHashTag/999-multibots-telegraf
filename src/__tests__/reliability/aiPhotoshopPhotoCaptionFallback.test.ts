/**
 * Ratchet: in aiPhotoshopScene, every PAID image delivery that sends a
 * parse_mode:'Markdown' caption must fall back to a plain re-send if the caption
 * 400s -- so a reserved char in the user's prompt cannot silently lose the image.
 *
 * The delivery captions interpolate the raw user prompt under parse_mode
 * 'Markdown'. A single unbalanced legacy-Markdown reserved char (underscore,
 * asterisk, backtick, bracket) in the prompt makes Telegram reject the whole
 * replyWithPhoto with 400 "can't parse entities" -- the PAID generated image is
 * never delivered, and the catch only logged. (Found by the iter229 fresh-lens
 * wave, markdownv2 lens, adversarially confirmed; two live paid sites: the
 * all_models branch and the normal-mode loop.) The file already uses this
 * fall-back-to-plain remedy for the dialog status reply.
 *
 * This pins it structurally: every `replyWithPhoto(..., { ..., parse_mode })`
 * call must sit in a try whose catch contains another `replyWithPhoto` WITHOUT
 * parse_mode (the plain re-send). self-check + floor + real-file injection probe.
 *
 * loop-fable iter229.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(__dirname, '../../scenes/aiPhotoshopScene/index.ts')

/** Is `n` a call to `<something>.replyWithPhoto(...)`? */
function isReplyWithPhoto(n: ts.Node): n is ts.CallExpression {
  return (
    ts.isCallExpression(n) &&
    ts.isPropertyAccessExpression(n.expression) &&
    n.expression.name.text === 'replyWithPhoto'
  )
}

/** Does the call's options object (arg 1) set a `parse_mode` property? */
function hasParseMode(call: ts.CallExpression): boolean {
  const opts = call.arguments[1]
  if (!opts || !ts.isObjectLiteralExpression(opts)) return false
  return opts.properties.some(
    p =>
      p.name !== undefined &&
      (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
      p.name.text === 'parse_mode'
  )
}

/** The nearest enclosing try statement of a node, if any. */
function enclosingTry(n: ts.Node): ts.TryStatement | undefined {
  let c: ts.Node | undefined = n.parent
  while (c) {
    if (ts.isTryStatement(c)) return c
    c = c.parent
  }
  return undefined
}

/** Does this catch clause re-send a photo WITHOUT parse_mode (plain fallback)? */
function catchHasPlainReSend(tryStmt: ts.TryStatement): boolean {
  const cc = tryStmt.catchClause
  if (!cc) return false
  let found = false
  const walk = (m: ts.Node): void => {
    if (isReplyWithPhoto(m) && !hasParseMode(m)) found = true
    m.forEachChild(walk)
  }
  walk(cc.block)
  return found
}

function analyze(source: string): {
  parseModeSites: number
  unprotected: number[]
} {
  const sf = ts.createSourceFile(
    'aiPhotoshopScene.ts',
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  )
  let parseModeSites = 0
  const unprotected: number[] = []
  const visit = (n: ts.Node): void => {
    if (isReplyWithPhoto(n) && hasParseMode(n)) {
      parseModeSites++
      const t = enclosingTry(n)
      const isProtected = t ? catchHasPlainReSend(t) : false
      if (!isProtected) {
        unprotected.push(
          sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
        )
      }
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return { parseModeSites, unprotected }
}

describe('aiPhotoshopScene paid photo delivery survives a Markdown caption 400', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const a = analyze(source)

  it('floor: the scene still delivers photos with a parse_mode caption', () => {
    expect(a.parseModeSites).toBeGreaterThanOrEqual(2)
  })

  it('every parse_mode replyWithPhoto has a plain re-send fallback in its catch', () => {
    expect(
      a.unprotected,
      `A paid replyWithPhoto with parse_mode:'Markdown' has no plain (no-parse_mode) ` +
        `re-send in its enclosing catch. A reserved char in the user prompt caption ` +
        `will 400 and silently lose the paid image. Wrap it in try/catch and re-send ` +
        `the photo without parse_mode.`
    ).toEqual([])
  })

  it('self-check: detector flags a parse_mode photo send with no plain fallback', () => {
    const bad = `
      async function h(ctx: any) {
        try {
          await ctx.replyWithPhoto(url, { caption: c, parse_mode: 'Markdown' })
        } catch (e) {
          logger.error('failed', e)
        }
      }`
    const good = `
      async function h(ctx: any) {
        try {
          await ctx.replyWithPhoto(url, { caption: c, parse_mode: 'Markdown' })
        } catch (e) {
          await ctx.replyWithPhoto(url, { caption: c }).catch(() => {})
        }
      }`
    expect(analyze(bad).unprotected.length).toBe(1)
    expect(analyze(good).unprotected.length).toBe(0)
  })

  it('probe: an unprotected site injected into the real file is caught (detector is live on THIS file, baseline clean)', () => {
    const base = a.unprotected.length // real file is clean today
    const injected =
      source +
      `
async function __probe(ctx: any) {
  try {
    await ctx.replyWithPhoto(u, { caption: c, parse_mode: 'Markdown' })
  } catch (e) {
    void e
  }
}
`
    expect(base).toBe(0)
    expect(analyze(injected).unprotected.length).toBe(base + 1)
  })
})
