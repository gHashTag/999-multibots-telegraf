/**
 * Ratchet: getUserProjects' projectsCache is bounded (no unbounded-Map leak).
 *
 * projectsCache is a module-scope Map keyed by telegram_id (an unbounded space).
 * The only eviction was lazy: getCachedProjects deletes an entry solely when the
 * SAME user reads again after the 5-min TTL. A one-time caller therefore leaves
 * a UserProject[] entry resident for the whole life of the long-running
 * multi-bot process -> a slow memory leak (OOM class, cf. the session-array
 * caps). The fix makes setCachedProjects sweep expired entries then FIFO-evict
 * oldest keys past a MAX_CACHE_ENTRIES cap before inserting.
 *
 * This pins it: setCachedProjects must reference the cap and actively evict.
 *
 * loop-fable iter204 (wave-9 unbounded-module-map lens).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(__dirname, '../../core/supabase/getUserProjects.ts')

function findFunction(
  sf: ts.SourceFile,
  name: string
): ts.FunctionDeclaration | undefined {
  let found: ts.FunctionDeclaration | undefined
  const visit = (n: ts.Node): void => {
    if (ts.isFunctionDeclaration(n) && n.name && n.name.text === name) found = n
    n.forEachChild(visit)
  }
  visit(sf)
  return found
}

function subtreeHas(n: ts.Node, pred: (m: ts.Node) => boolean): boolean {
  let hit = false
  const w = (m: ts.Node): void => {
    if (pred(m)) hit = true
    m.forEachChild(w)
  }
  w(n)
  return hit
}

function analyze(source: string): {
  hasSetter: boolean
  refsCap: boolean
  evicts: boolean
  hasSet: boolean
} {
  const sf = ts.createSourceFile('g.ts', source, ts.ScriptTarget.Latest, true)
  const setter = findFunction(sf, 'setCachedProjects')
  const body = setter?.body
  const refsCap = body
    ? subtreeHas(
        body,
        m => ts.isIdentifier(m) && m.text === 'MAX_CACHE_ENTRIES'
      )
    : false
  const evicts = body
    ? subtreeHas(
        body,
        m =>
          ts.isCallExpression(m) &&
          ts.isPropertyAccessExpression(m.expression) &&
          ts.isIdentifier(m.expression.expression) &&
          m.expression.expression.text === 'projectsCache' &&
          m.expression.name.text === 'delete'
      )
    : false
  const hasSet = body
    ? subtreeHas(
        body,
        m =>
          ts.isCallExpression(m) &&
          ts.isPropertyAccessExpression(m.expression) &&
          ts.isIdentifier(m.expression.expression) &&
          m.expression.expression.text === 'projectsCache' &&
          m.expression.name.text === 'set'
      )
    : false
  return { hasSetter: !!setter, refsCap, evicts, hasSet }
}

describe('getUserProjects projectsCache is bounded', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const a = analyze(source)

  // matcher-not-stale floor: the setter that inserts into the cache still exists.
  it('still has setCachedProjects writing to the cache', () => {
    expect(a.hasSetter).toBe(true)
    expect(a.hasSet).toBe(true)
  })

  it('setCachedProjects references the size cap and actively evicts', () => {
    expect(a.refsCap).toBe(true)
    expect(a.evicts).toBe(true)
  })

  it('self-check: a set-only setter with no eviction is detected', () => {
    const bad = `const projectsCache = new Map()
      function setCachedProjects(id, data) {
        projectsCache.set(id, { data })
      }`
    const r = analyze(bad)
    expect(r.hasSet).toBe(true)
    expect(r.evicts).toBe(false)
    expect(r.refsCap).toBe(false)
  })
})
