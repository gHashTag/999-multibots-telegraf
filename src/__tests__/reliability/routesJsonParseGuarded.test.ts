import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

// Untrusted-input boundary class (money-adjacent, delivery-loss).
//
// Handlers under src/api_server/routes parse EXTERNAL JSON: provider webhook
// bodies (kie.ai / replicate / render callbacks) and HTTP request bodies. That
// input is attacker/provider-controlled and NOT guaranteed well-formed. A
// malformed body makes `JSON.parse` throw; inside an async route handler the
// throw becomes an unhandledRejection (log-and-continue, per Foundation's global
// handler) -- the handler never sends a response and, on a paid job's completion
// webhook, the generated result is never delivered: charged-not-delivered, the
// same failure family as #1336. So every `JSON.parse` at this boundary MUST sit
// inside a `try` in its own function, so the failure is caught and handled.
//
// The guard check walks the TypeScript AST -- NOT a fixed line-window. A window
// gives false negatives when the enclosing `try {` is far above the call (that
// bit a prior ratchet, #1428) and false positives across brace layout. The AST
// answers exactly "is this call lexically inside a try within its function".
// `inTry` resets at every function boundary, so a `JSON.parse` inside a callback
// defined in a try (which may run after the try has exited) is NOT counted as
// guarded -- the strong, honest invariant.

const walk = (d: string): string[] =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const p = path.join(d, e.name)
    if (e.isDirectory()) return walk(p)
    return e.isFile() && p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : []
  })

const isFunctionLike = (n: ts.Node): boolean =>
  ts.isFunctionDeclaration(n) ||
  ts.isFunctionExpression(n) ||
  ts.isArrowFunction(n) ||
  ts.isMethodDeclaration(n) ||
  ts.isConstructorDeclaration(n) ||
  ts.isGetAccessorDeclaration(n) ||
  ts.isSetAccessorDeclaration(n)

const isJsonParse = (n: ts.Node, sf: ts.SourceFile): boolean =>
  ts.isCallExpression(n) &&
  ts.isPropertyAccessExpression(n.expression) &&
  n.expression.expression.getText(sf) === 'JSON' &&
  n.expression.name.text === 'parse'

interface Site {
  line: number
  guarded: boolean
}

// Exported shape used both against the repo and against a synthetic snippet
// (the self-check below), so the detector is proven able to return guarded:false.
export function jsonParseSites(fileName: string, text: string): Site[] {
  const sf = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  )
  const sites: Site[] = []
  const visit = (node: ts.Node, inTry: boolean): void => {
    if (ts.isTryStatement(node)) {
      node.tryBlock.statements.forEach(s => visit(s, true))
      if (node.catchClause) visit(node.catchClause.block, inTry)
      if (node.finallyBlock) visit(node.finallyBlock, inTry)
      return
    }
    if (isFunctionLike(node)) {
      // New function scope: the enclosing try does not dynamically cover it.
      node.forEachChild(c => visit(c, false))
      return
    }
    if (isJsonParse(node, sf)) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
      sites.push({ line: line + 1, guarded: inTry })
    }
    node.forEachChild(c => visit(c, inTry))
  }
  visit(sf, false)
  return sites
}

describe('every JSON.parse in api_server routes is try-guarded (charged-not-delivered class)', () => {
  // Self-check: the detector must be able to report BOTH outcomes, or a green
  // result would prove nothing (a control that cannot fail).
  it('detector distinguishes guarded from unguarded (control can fail)', () => {
    const snippet = [
      'function a(s: string) {',
      '  try { return JSON.parse(s) } catch { return null }', // guarded
      '}',
      'function b(s: string) {',
      '  return JSON.parse(s)', // unguarded
      '}',
      'function c(s: string) {',
      '  try {',
      '    const cb = () => JSON.parse(s)', // in a callback in a try -> NOT guarded
      '    return cb',
      '  } catch { return null }',
      '}',
    ].join('\n')
    const sites = jsonParseSites('synthetic.ts', snippet)
    expect(sites.map(s => s.guarded)).toEqual([true, false, false])
  })

  const routesDir = path.join(__dirname, '..', '..', 'api_server', 'routes')

  it('routes directory exists and is populated (a broken path fails, not passes)', () => {
    expect(fs.existsSync(routesDir)).toBe(true)
    expect(walk(routesDir).length).toBeGreaterThan(5)
  })

  const scanned = fs.existsSync(routesDir) ? walk(routesDir) : []
  const allSites = scanned.flatMap(f =>
    jsonParseSites(f, fs.readFileSync(f, 'utf8')).map(s => ({
      file: f.slice(routesDir.length + 1),
      ...s,
    }))
  )

  it('finds the known JSON.parse population (matcher is not stale)', () => {
    // kie-ai-webhook.routes.ts parses provider resultJson at several sites; if
    // this floor is not met the AST matcher has drifted and the pass is empty.
    const kie = allSites.filter(s =>
      s.file.includes('kie-ai-webhook.routes.ts')
    )
    expect(kie.length).toBeGreaterThanOrEqual(4)
  })

  it('has no unguarded JSON.parse at the HTTP/webhook boundary', () => {
    const unguarded = allSites.filter(s => !s.guarded)
    expect(
      unguarded,
      `Unguarded JSON.parse in route handlers (wrap in try/catch -- a malformed ` +
        `external body would throw and lose the response/delivery):\n` +
        unguarded.map(s => `  ${s.file}:${s.line}`).join('\n')
    ).toEqual([])
  })
})
