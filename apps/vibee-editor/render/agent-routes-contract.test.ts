import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * The seam between src/agent/routes.ts and render-server.ts.
 *
 * WHY. This contract has now broken in both directions, and neither break was
 * noticed by anything:
 *
 *   - #898: render-server.ts imported and called handleAgentKeys while
 *     routes.ts no longer exported it. The render sources did not compile.
 *   - today: the mirror image. routes.ts exports handleAgentKeys (line 302),
 *     render-server.ts imports it nowhere, and nothing calls it. The endpoints
 *     its own JSDoc documents — POST/GET/DELETE /api/agent/keys — are not on
 *     the server, while a2a.ts:98 still tells the user in an error message to
 *     "get a key in the mini app (POST /api/agent/keys)". The address it sends
 *     people to does not exist.
 *
 * Both breaks came out of merges: one side of the seam moved and the other did
 * not. A type check does not catch the second direction — an exported function
 * nobody imports is valid TypeScript.
 *
 * Not asserted here: that a wired handler is actually reachable at runtime
 * (mounting, method, auth). This checks the seam between the two files, which
 * is where both regressions happened.
 */

const RENDER = __dirname
const ROUTES = path.join(RENDER, 'src', 'agent', 'routes.ts')
const SERVER = path.join(RENDER, 'render-server.ts')

/**
 * Handlers deliberately not wired yet, each with the issue that tracks it.
 * This list may SHRINK, never grow: a new unwired handler is a regression and
 * fails the test below. It is not an exemption — the gap stays named and
 * counted rather than disappearing into a green report.
 */
const KNOWN_UNWIRED: Record<string, string> = {
  // Self-service MCP keys from #884. The implementation is back in routes.ts,
  // the wiring is not. Tracked in #898 (P0), whose scope covers the identity
  // and revocation work this endpoint needs before it is exposed again.
  handleAgentKeys: '#898',
}

function exportedHandlers(): string[] {
  const src = fs.readFileSync(ROUTES, 'utf8')
  return [
    ...src.matchAll(
      /^export\s+(?:async\s+)?function\s+(handle[A-Za-z0-9_]*)/gm
    ),
  ]
    .map(m => m[1])
    .sort()
}

function importedFromRoutes(): string[] {
  const src = fs.readFileSync(SERVER, 'utf8')
  const m = src.match(
    /import\s*\{([^}]*)\}\s*from\s*['"]\.\/src\/agent\/routes['"]/
  )
  if (!m) return []
  return m[1]
    .split(',')
    .map(s =>
      s
        .trim()
        .split(/\s+as\s+/)[0]
        .trim()
    )
    .filter(Boolean)
    .sort()
}

describe('seam between agent/routes.ts and render-server.ts', () => {
  it('both files are parsed — otherwise the checks below are empty', () => {
    expect(fs.existsSync(ROUTES)).toBe(true)
    expect(fs.existsSync(SERVER)).toBe(true)
    expect(exportedHandlers().length).toBeGreaterThan(0)
    expect(importedFromRoutes().length).toBeGreaterThan(0)
  })

  it('every name imported from routes.ts is actually exported there', () => {
    const src = fs.readFileSync(ROUTES, 'utf8')
    const exported = new Set(
      [
        ...src.matchAll(
          /^export\s+(?:async\s+)?(?:function|const)\s+([A-Za-z0-9_]+)/gm
        ),
      ].map(m => m[1])
    )
    const missing = importedFromRoutes().filter(n => !exported.has(n))
    // This is the #898 direction: the import survived a merge, the export did
    // not, and the render sources stopped compiling.
    expect(missing).toEqual([])
  })

  it('every exported handler is wired into the server, or named as known debt', () => {
    const imported = new Set(importedFromRoutes())
    const unwired = exportedHandlers().filter(h => !imported.has(h))
    const unexpected = unwired.filter(h => !(h in KNOWN_UNWIRED))
    // The mirror direction: a handler exists, answers a documented address, and
    // no request can ever reach it.
    expect(unexpected).toEqual([])
  })

  it('the known-debt list has no stale entries', () => {
    const imported = new Set(importedFromRoutes())
    const exported = new Set(exportedHandlers())
    // An entry that is now wired, or gone entirely, must leave the list —
    // otherwise the list stops describing reality and starts excusing it.
    const stale = Object.keys(KNOWN_UNWIRED).filter(
      h => imported.has(h) || !exported.has(h)
    )
    expect(stale).toEqual([])
  })
})
