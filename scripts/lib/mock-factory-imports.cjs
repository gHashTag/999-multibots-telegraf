/**
 * Bare builtin imports inside vi.mock factories.
 *
 * WHY THIS EXISTS
 *
 * Iterations 155-173 chased a test that failed in one worktree and passed in
 * another -- from the same commit, with byte-identical files and a clean
 * `git status`, each verdict stable on repeat. The cause was one line inside
 * the test's own `vi.mock('fs')` factory:
 *
 *     const { Readable } = await import('stream')   // bare specifier
 *
 * A bare builtin resolved inside a mock factory goes through vitest's
 * interception rather than plain Node resolution, and the result depended on
 * the tree. `node:stream` resolves the same way everywhere. Three iterations
 * were spent because the difference was not in any file -- it was in name
 * resolution.
 *
 * WHY AN AST AND NOT A REGEX
 *
 * The first census of this class was a regex, and it counted
 * `typeof import('fs')` -- a TYPE position, erased by TypeScript before
 * anything runs, and incapable of affecting resolution. A regex knows a
 * spelling; only the parser knows whether an `import(...)` is a value or a
 * type. `isImportTypeNode` is excluded here for exactly that reason.
 *
 * The population is narrow ON PURPOSE. Static bare builtin imports at the top
 * of a test file are NOT in it: there are hundreds of them and the suite is
 * green. Only the mock-factory position is proven to break.
 */

const ts = require('typescript')

/**
 * Returns every bare (unprefixed) builtin dynamic import that sits inside a
 * `vi.mock(...)` / `jest.mock(...)` factory argument.
 *
 * Each hit: { line, module }.
 */
function bareBuiltinsInMockFactories(source, fileName = 'probe.ts') {
  const builtins = new Set(
    require('module').builtinModules.filter(m => !m.startsWith('_'))
  )
  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true
  )
  const hits = []

  const scanFactory = node => {
    const visit = n => {
      // A dynamic import is a CallExpression whose callee is the `import`
      // KEYWORD. An ImportTypeNode (`typeof import('fs')`) is a different
      // node kind and never reaches here -- that is the point.
      if (
        n.kind === ts.SyntaxKind.CallExpression &&
        n.expression.kind === ts.SyntaxKind.ImportKeyword
      ) {
        const arg = n.arguments[0]
        if (arg && ts.isStringLiteral(arg) && builtins.has(arg.text)) {
          hits.push({
            line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1,
            module: arg.text,
          })
        }
      }
      ts.forEachChild(n, visit)
    }
    visit(node)
  }

  const walk = n => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === 'mock' &&
      n.arguments.length > 1
    ) {
      scanFactory(n.arguments[1])
    }
    ts.forEachChild(n, walk)
  }
  walk(sf)
  return hits
}

/**
 * Refuses to run with a matcher that cannot tell the four cases apart.
 * Without this a silently broken reader reports "0 found" -- which is exactly
 * what a healthy repository also reports, so the failure would be invisible.
 */
function selfCheck() {
  const cases = [
    // POSITIVE: the shape that cost three iterations.
    [
      `vi.mock('fs', async () => { const { Readable } = await import('stream'); return {} })`,
      1,
    ],
    // NEGATIVE: the fix. Prefixed specifiers resolve identically everywhere.
    [
      `vi.mock('fs', async () => { const { Readable } = await import('node:stream'); return {} })`,
      0,
    ],
    // NEGATIVE: a TYPE position. Erased at compile time; the regex version of
    // this reader counted it and produced a false finding.
    [
      `vi.mock('fs', async (importOriginal) => { const a = await importOriginal<typeof import('fs')>(); return a })`,
      0,
    ],
    // NEGATIVE: bare builtin OUTSIDE any factory. Hundreds of these exist and
    // the suite is green -- they are not this rule's subject.
    [`it('x', async () => { const fs = await import('fs') })`, 0],
    // NEGATIVE: a factory importing a non-builtin.
    [
      `vi.mock('@/x', async () => { const y = await import('./local'); return y })`,
      0,
    ],
  ]
  cases.forEach(([src, want], i) => {
    const got = bareBuiltinsInMockFactories(src).length
    if (got !== want) {
      throw new Error(
        `mock-factory-imports selfCheck sample ${i}: expected ${want}, got ${got}`
      )
    }
  })
}

/**
 * How many mock factories the population contains, counted on CODE.
 *
 * The first version of this count used a raw regex and reported 699 where 693
 * exist: six `vi.mock(` written inside comments or strings. The number is a
 * floor in the ratchet, so an inflated one weakens the guard silently.
 */
function countFactories(source) {
  const { matchCode } = require('./blank-code.cjs')
  return matchCode(source, /\bvi\.mock\s*\(/g).length
}

module.exports = { bareBuiltinsInMockFactories, countFactories, selfCheck }
