/**
 * Ratchet: the WAN 2.5 status poll loop backs off on every non-terminal state.
 *
 * waitForWAN25Task polls checkWAN25TaskStatus in a while loop. The only in-loop
 * sleep was gated behind `if (state === 'processing')`; the success/fail
 * branches return/throw, but any OTHER in-progress value (a queued/generating
 * token, an undefined state, a non-200 body) fell straight through with NO
 * sleep and re-polled at network speed -- hundreds of requests hammering the
 * kie API for the whole 120s wait window. The fix adds a backoff on that
 * fall-through path.
 *
 * This pins it: there is a setTimeout(pollInterval) backoff that is NOT inside
 * the `state === 'processing'` if and NOT inside a catch clause -- i.e. the
 * fall-through (unknown-state) path sleeps. A ">= N setTimeout" count would be a
 * weak ruler (the processing-if sleep and the catch-retry sleep already exist);
 * the not-in-processing-if AND not-in-catch qualifier targets the actual fix.
 *
 * loop-fable iter200 (found by the bug-hunt-wave5 workflow, retry-storm lens).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(
  __dirname,
  '../../inngest_app/functions/wan25-helpers.ts'
)

function isPollSleep(n: ts.Node): boolean {
  // setTimeout(resolve, pollInterval)
  if (!ts.isCallExpression(n)) return false
  if (!(ts.isIdentifier(n.expression) && n.expression.text === 'setTimeout'))
    return false
  return n.arguments.some(a => ts.isIdentifier(a) && a.text === 'pollInterval')
}

function insideProcessingIf(n: ts.Node): boolean {
  let c: ts.Node | undefined = n.parent
  while (c) {
    if (
      ts.isIfStatement(c) &&
      /['"]processing['"]/.test(c.expression.getText())
    )
      return true
    c = c.parent
  }
  return false
}

function insideCatch(n: ts.Node): boolean {
  let c: ts.Node | undefined = n.parent
  while (c) {
    if (ts.isCatchClause(c)) return true
    c = c.parent
  }
  return false
}

function analyze(source: string) {
  const sf = ts.createSourceFile(
    'wan25-helpers.ts',
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  )
  let totalSleeps = 0
  let fallThroughSleeps = 0
  const visit = (n: ts.Node): void => {
    if (isPollSleep(n)) {
      totalSleeps++
      if (!insideProcessingIf(n) && !insideCatch(n)) fallThroughSleeps++
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return { totalSleeps, fallThroughSleeps }
}

describe('WAN 2.5 poll loop backs off on the fall-through (unknown) state', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const { totalSleeps, fallThroughSleeps } = analyze(source)

  it('self-check: detector counts only the non-processing, non-catch backoff', () => {
    const src = `
      while (x) {
        if (state === 'processing') { await new Promise(r => setTimeout(r, pollInterval)); continue }
        logger.warn('unknown')
        await new Promise(r => setTimeout(r, pollInterval))
      }
      try {} catch (e) { await new Promise(r => setTimeout(r, pollInterval)) }
    `
    const a = analyze(src)
    expect(a.totalSleeps).toBe(3)
    expect(a.fallThroughSleeps).toBe(1)
  })

  it('matcher is not stale: the loop has a pollInterval backoff', () => {
    expect(totalSleeps).toBeGreaterThanOrEqual(1)
  })

  it('a backoff exists outside the processing-if and outside a catch', () => {
    expect(
      fallThroughSleeps,
      `wan25-helpers poll loop has no fall-through backoff (a setTimeout(pollInterval) ` +
        `that is not inside the state==='processing' if and not inside a catch). An ` +
        `unknown/unexpected state re-polls at network speed, hammering the kie API.`
    ).toBeGreaterThanOrEqual(1)
  })
})
