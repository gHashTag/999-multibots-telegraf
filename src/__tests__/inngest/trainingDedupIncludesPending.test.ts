/**
 * Ratchet: the model-training duplicate guard covers the PENDING window.
 *
 * generateModelTrainingFunction checks for an existing active training and
 * throws if one exists, to prevent starting a duplicate (expensive) Replicate
 * training. But it inserts its OWN model_trainings row as status 'PENDING'
 * first and flips it to 'starting' only at the last step. If the duplicate
 * guard's `.in('status', [...])` filter omits 'PENDING', a second
 * model/training.start for the same user+model arriving during that
 * multi-second PENDING window misses the in-progress row and starts a duplicate.
 *
 * This pins it: the guard's status filter must include 'PENDING' alongside the
 * later statuses ('starting', 'processing').
 *
 * loop-fable iter198 (found by the bug-hunt-wave4 workflow, replay lens).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(
  __dirname,
  '../../inngest_app/functions/existing/generateModelTrainingFunction.ts'
)

/**
 * Find `.in('status', [ ...string literals... ])` calls and return the string
 * arrays. This is the status filter used by the duplicate-training guard.
 */
function statusFilters(source: string): string[][] {
  const sf = ts.createSourceFile(
    'generateModelTrainingFunction.ts',
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  )
  const filters: string[][] = []
  const visit = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === 'in' &&
      n.arguments.length === 2 &&
      ts.isStringLiteral(n.arguments[0]) &&
      n.arguments[0].text === 'status' &&
      ts.isArrayLiteralExpression(n.arguments[1])
    ) {
      filters.push(
        n.arguments[1].elements
          .filter(ts.isStringLiteral)
          .map(e => (e as ts.StringLiteral).text)
      )
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return filters
}

describe('model-training duplicate guard covers the PENDING window', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const filters = statusFilters(source)

  it("self-check: detector reads the .in('status', [...]) array", () => {
    const withPending = `q.in('status', ['PENDING', 'starting', 'processing'])`
    const without = `q.in('status', ['starting', 'processing'])`
    expect(statusFilters(withPending)[0]).toContain('PENDING')
    expect(statusFilters(without)[0]).not.toContain('PENDING')
  })

  it('matcher is not stale: the function has a status-filtered duplicate guard', () => {
    expect(filters.length).toBeGreaterThanOrEqual(1)
  })

  it("every status filter that guards duplicates includes 'PENDING'", () => {
    // The guard filters on the in-progress statuses; each must include PENDING,
    // the status the row is inserted with before it becomes 'starting'.
    const missing = filters.filter(
      f => f.includes('starting') && !f.includes('PENDING')
    )
    expect(
      missing,
      `The duplicate-training guard filters ${JSON.stringify(missing)} without ` +
        `'PENDING'. A concurrent training.start during the PENDING window would ` +
        `miss the in-progress row and start a duplicate Replicate training.`
    ).toEqual([])
  })
})
