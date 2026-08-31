/**
 * Ratchet: aiPhotoshopScene clears morphingImages wherever it clears the
 * single-photo image source.
 *
 * morphingImages is a cross-scene session field: morphingWizard populates it
 * (buffers, no url) and never clears it on cancel/leave. aiPhotoshop selects its
 * image source from morphingImages when non-empty (multi-photo branch) and only
 * falls back to the freshly-uploaded aiPhotoshopImage when morphingImages is
 * empty. So a stale morphingImages batch hijacks a fresh single-photo edit --
 * the multi-photo branch yields empty urls and the paid generation runs on the
 * wrong/empty image.
 *
 * The fix evicts morphingImages at the scene's reset points (enter reset and
 * error catch), alongside the aiPhotoshopImage reset. This pins that: every
 * block that resets ctx.session.aiPhotoshopImage = undefined must also reset
 * ctx.session.morphingImages = undefined in the same block. A ">= N clears"
 * count floor would be a weak ruler (the success path already clears it once);
 * the co-location check ties each image-source reset to a morphingImages reset.
 *
 * loop-fable iter200 (found by the bug-hunt-wave5 workflow, session-race lens).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(__dirname, '../../scenes/aiPhotoshopScene/index.ts')

/** Is `n` an assignment `ctx.session.<field> = undefined`? Returns field or null. */
function sessionResetField(n: ts.Node): string | null {
  if (
    ts.isBinaryExpression(n) &&
    n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isPropertyAccessExpression(n.left) &&
    ts.isPropertyAccessExpression(n.left.expression) &&
    ts.isIdentifier(n.left.expression.expression) &&
    n.left.expression.expression.text === 'ctx' &&
    n.left.expression.name.text === 'session' &&
    // `= undefined` parses the RHS as an Identifier named "undefined", not the
    // UndefinedKeyword (which is only the type keyword `x: undefined`).
    ts.isIdentifier(n.right) &&
    n.right.text === 'undefined'
  ) {
    return n.left.name.text
  }
  return null
}

/** Nearest enclosing Block of `n`. */
function enclosingBlock(n: ts.Node): ts.Block | undefined {
  let c: ts.Node | undefined = n.parent
  while (c) {
    if (ts.isBlock(c)) return c
    c = c.parent
  }
  return undefined
}

function analyze(source: string) {
  const sf = ts.createSourceFile(
    'aiPhotoshopScene.ts',
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  )
  // Map each Block (by start pos) to the reset fields it contains.
  const blockFields = new Map<number, Set<string>>()
  const blockNodes = new Map<number, ts.Block>()
  const visit = (n: ts.Node): void => {
    const field = sessionResetField(n)
    if (field) {
      const b = enclosingBlock(n)
      if (b) {
        const key = b.getStart(sf)
        if (!blockFields.has(key)) {
          blockFields.set(key, new Set())
          blockNodes.set(key, b)
        }
        blockFields.get(key)!.add(field)
      }
    }
    n.forEachChild(visit)
  }
  visit(sf)

  // Blocks that reset aiPhotoshopImage but NOT morphingImages.
  const gaps: number[] = []
  let imageResetBlocks = 0
  for (const [key, fields] of blockFields) {
    if (fields.has('aiPhotoshopImage')) {
      imageResetBlocks++
      if (!fields.has('morphingImages')) {
        gaps.push(
          sf.getLineAndCharacterOfPosition(blockNodes.get(key)!.getStart(sf))
            .line + 1
        )
      }
    }
  }
  return { imageResetBlocks, gaps }
}

describe('aiPhotoshopScene evicts morphingImages with the image-source reset', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const { imageResetBlocks, gaps } = analyze(source)

  it('self-check: detector flags an image reset without a morphingImages reset', () => {
    const good = `function f(){ if(x){ ctx.session.aiPhotoshopImage = undefined; ctx.session.morphingImages = undefined } }`
    const bad = `function f(){ if(x){ ctx.session.aiPhotoshopImage = undefined } }`
    expect(analyze(good).gaps.length).toBe(0)
    expect(analyze(bad).gaps.length).toBe(1)
  })

  it('matcher is not stale: the scene resets aiPhotoshopImage somewhere', () => {
    expect(imageResetBlocks).toBeGreaterThanOrEqual(2)
  })

  it('every block that resets aiPhotoshopImage also resets morphingImages', () => {
    expect(
      gaps,
      `aiPhotoshopScene resets ctx.session.aiPhotoshopImage without also clearing ` +
        `ctx.session.morphingImages (block starting at lines: ${gaps.join(', ')}). A ` +
        `stale cross-scene morphingImages batch would hijack the next single-photo ` +
        `edit and charge a generation on the wrong image.`
    ).toEqual([])
  })
})
