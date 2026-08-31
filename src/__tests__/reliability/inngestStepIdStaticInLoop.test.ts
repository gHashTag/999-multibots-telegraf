/**
 * Ratchet: no Inngest step with a STATIC id inside a loop.
 *
 * Inngest memoizes each step by its id within a function run. A step.run (or
 * step.waitForEvent / sleep / invoke / sendEvent) with a hard-coded string id
 * placed inside a loop reuses that same id on every iteration: iteration 2+
 * replays iteration 1's journaled result instead of executing -> the step's
 * work (e.g. per-item generation, an external call) silently runs only once
 * for the whole loop, or Inngest flags non-determinism. The correct pattern is
 * a per-iteration id built from the index, which the codebase already uses
 * (e.g. step.run(`generate-broll-${index}`, ...)).
 *
 * Today 0 of ~220 step calls in src/inngest_app/functions use a static id in a
 * loop. This ratchet pins that: a new static-id step added inside a for/while/
 * do/.map/.forEach/.filter/.reduce goes RED. It does NOT touch existing ids
 * (no in-flight-run disruption).
 *
 * Note: this deliberately does NOT flag the same static id reused across
 * mutually-exclusive if/else branches (e.g. renderRiddle's hedra-vs-heygen
 * `start-avatar-generation`): only one branch runs per invocation, so there is
 * no collision. Enforcing global id uniqueness would false-flag that safe
 * pattern. A loop, by contrast, always re-executes its body.
 *
 * See loop-fable iter192.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FUNCTIONS_DIR = path.resolve(__dirname, '../../inngest_app/functions')

const STEP_METHODS = new Set([
  'run',
  'waitForEvent',
  'sleep',
  'sleepUntil',
  'invoke',
  'sendEvent',
])

const ARRAY_ITERATORS = new Set(['map', 'forEach', 'filter', 'reduce'])

interface Finding {
  file: string
  line: number
  id: string
  loopKind: string
}

/** Nearest loop/array-iterator ancestor of `n`, or null. */
function loopAncestor(n: ts.Node): string | null {
  let c: ts.Node | undefined = n.parent
  while (c) {
    if (ts.isForStatement(c)) return 'for'
    if (ts.isForOfStatement(c)) return 'for-of'
    if (ts.isForInStatement(c)) return 'for-in'
    if (ts.isWhileStatement(c)) return 'while'
    if (ts.isDoStatement(c)) return 'do-while'
    if (
      ts.isCallExpression(c) &&
      ts.isPropertyAccessExpression(c.expression) &&
      ARRAY_ITERATORS.has(c.expression.name.text)
    ) {
      return `.${c.expression.name.text}()`
    }
    c = c.parent
  }
  return null
}

/** Is this call a `step.<method>(...)` on an identifier named `step`? */
function isStepCall(n: ts.Node): n is ts.CallExpression {
  if (!ts.isCallExpression(n)) return false
  const e = n.expression
  if (!ts.isPropertyAccessExpression(e)) return false
  if (!STEP_METHODS.has(e.name.text)) return false
  const obj = e.expression
  return ts.isIdentifier(obj) && obj.text === 'step'
}

function analyzeSource(fileLabel: string, source: string) {
  const sf = ts.createSourceFile(
    fileLabel,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  )
  let stepCalls = 0
  const findings: Finding[] = []
  const visit = (n: ts.Node): void => {
    if (isStepCall(n)) {
      stepCalls++
      const arg = n.arguments[0]
      const loop = loopAncestor(n)
      // Only a STATIC string-literal id is a collision risk; a template
      // literal (e.g. `foo-${i}`) is per-iteration and safe.
      if (arg && ts.isStringLiteral(arg) && loop) {
        findings.push({
          file: fileLabel,
          line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
          id: arg.text,
          loopKind: loop,
        })
      }
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return { stepCalls, findings }
}

function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return listFiles(p)
    return e.isFile() && p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : []
  })
}

function analyzeAll() {
  let stepCalls = 0
  const findings: Finding[] = []
  for (const f of listFiles(FUNCTIONS_DIR)) {
    const r = analyzeSource(
      path.relative(FUNCTIONS_DIR, f),
      fs.readFileSync(f, 'utf8')
    )
    stepCalls += r.stepCalls
    findings.push(...r.findings)
  }
  return { stepCalls, findings }
}

describe('inngest steps use no static id inside a loop', () => {
  const { stepCalls, findings } = analyzeAll()

  it('self-check: detector flags static-in-loop but not dynamic-in-loop nor static-outside-loop', () => {
    const staticInLoop = `
      async ({ step }) => {
        for (const item of items) {
          await step.run('process-item', async () => item.id)
        }
      }
    `
    const dynamicInLoop = `
      async ({ step }) => {
        items.forEach((item, i) => step.run(\`process-\${i}\`, async () => item.id))
      }
    `
    const staticOutsideLoop = `
      async ({ step }) => {
        await step.run('process-once', async () => 1)
      }
    `
    expect(analyzeSource('a.ts', staticInLoop).findings.length).toBe(1)
    expect(analyzeSource('b.ts', dynamicInLoop).findings.length).toBe(0)
    expect(analyzeSource('c.ts', staticOutsideLoop).findings.length).toBe(0)
  })

  it('matcher is not stale: scanned a meaningful number of step calls (>= 50)', () => {
    expect(stepCalls).toBeGreaterThanOrEqual(50)
  })

  it('no inngest step uses a static id inside a loop', () => {
    expect(
      findings,
      `An Inngest step reuses a static id every loop iteration: ` +
        `${findings.map(f => `${f.file}:${f.line} "${f.id}" in ${f.loopKind}`).join(', ')}. ` +
        `Iteration 2+ replays iteration 1's journaled result. Build the id from ` +
        `the loop index (e.g. step.run(\`id-\${index}\`, ...)).`
    ).toEqual([])
  })
})
