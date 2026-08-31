/**
 * Ratchet: a balance charge inside the image-to-video polling loop must be
 * idempotency-guarded.
 *
 * generateImageToVideo's Plan-B polling loop (while attempts < 120) charges via
 * deductBalanceAfterSuccess and then delivers with telegramInstance.sendVideo.
 * A sendVideo throw (e.g. a >50MB generated file, or any transient Telegram
 * 5xx) was caught by catch(pollError), which -- for any non-403 error -- logs,
 * sleeps, and lets the loop CONTINUE: the next attempt re-fetches the still-
 * completed task and charges AGAIN, up to 120 times for one undelivered video.
 * deductBalanceAfterSuccess is non-idempotent (a fresh MONEY_OUTCOME each call).
 *
 * The fix gates the deduction behind a `charged` flag so a re-entered loop can
 * never re-charge the same completed task. This ratchet pins it: every
 * deductBalanceAfterSuccess call inside a loop in this file must have an
 * `if (... charged ...)` guard as an ancestor.
 *
 * The refund of the single charged-but-undelivered video is an add-credit path
 * (owner-reviewed), not enforced here. loop-fable iter195 (bug-hunt workflow).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(
  __dirname,
  '../../modules/videoGenerator/generateImageToVideo.ts'
)

function callName(n: ts.CallExpression): string {
  const e = n.expression
  return ts.isIdentifier(e)
    ? e.text
    : ts.isPropertyAccessExpression(e)
      ? e.name.text
      : ''
}

function hasAncestor(n: ts.Node, pred: (a: ts.Node) => boolean): boolean {
  let c: ts.Node | undefined = n.parent
  while (c) {
    if (pred(c)) return true
    c = c.parent
  }
  return false
}

function inLoop(n: ts.Node): boolean {
  return hasAncestor(
    n,
    c =>
      ts.isForStatement(c) ||
      ts.isForOfStatement(c) ||
      ts.isForInStatement(c) ||
      ts.isWhileStatement(c) ||
      ts.isDoStatement(c)
  )
}

/** Is `n` inside an `if` whose condition mentions the `charged` guard? */
function guardedByChargedFlag(n: ts.Node, sf: ts.SourceFile): boolean {
  return hasAncestor(
    n,
    c => ts.isIfStatement(c) && /\bcharged\b/.test(c.expression.getText(sf))
  )
}

interface Site {
  line: number
  inLoop: boolean
  guarded: boolean
}

function analyze(source: string): { total: number; sites: Site[] } {
  const sf = ts.createSourceFile(
    'generateImageToVideo.ts',
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  )
  const sites: Site[] = []
  let total = 0
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && callName(n) === 'deductBalanceAfterSuccess') {
      total++
      const loop = inLoop(n)
      if (loop) {
        sites.push({
          line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
          inLoop: true,
          guarded: guardedByChargedFlag(n, sf),
        })
      }
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return { total, sites }
}

describe('image-to-video poll-loop charge is idempotency-guarded', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const { total, sites } = analyze(source)

  it('self-check: detector distinguishes guarded from unguarded loop charge', () => {
    const guarded = `
      async function f() {
        let charged = false
        while (x) {
          if (!charged) {
            const ok = await deductBalanceAfterSuccess(a, b, c, d, 'e')
            if (ok) charged = true
          }
          await send()
        }
      }
    `
    const bare = `
      async function f() {
        while (x) {
          await deductBalanceAfterSuccess(a, b, c, d, 'e')
          await send()
        }
      }
    `
    expect(analyze(guarded).sites.map(s => s.guarded)).toEqual([true])
    expect(analyze(bare).sites.map(s => s.guarded)).toEqual([false])
  })

  it('matcher is not stale: the file still calls deductBalanceAfterSuccess', () => {
    expect(total).toBeGreaterThanOrEqual(1)
  })

  it('every deductBalanceAfterSuccess inside a loop is guarded by a charged flag', () => {
    const unguarded = sites.filter(s => !s.guarded)
    expect(
      unguarded.map(s => s.line),
      `A deductBalanceAfterSuccess inside the poll loop lacks a charged-flag ` +
        `guard -- a delivery failure re-enters the loop and re-charges the same ` +
        `completed task up to 120x. Gate it: if (!charged) { ...; charged = true }.`
    ).toEqual([])
  })
})
