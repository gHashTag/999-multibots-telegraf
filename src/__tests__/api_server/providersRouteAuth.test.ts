/**
 * GET /api/providers is an inline route in api_server/index.ts registered ABOVE
 * the requireInternalKey mounts, so it had no auth. Its response leaks provider
 * config/balance state ('FAL_KEY not set', 'Balance exhausted', remaining
 * quota) and ?refresh=true forces live outbound provider probes plus a Telegram
 * admin alert — all anonymously. The sibling diagnostic/billing routers are
 * already behind requireInternalKey; this route was the omission.
 *
 * The fix guards the route with requireInternalKey. Source-level seam test (the
 * express app needs many runtime deps to instantiate). Mutation — dropping the
 * requireInternalKey middleware — fails it.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.join(__dirname, '..', '..', 'api_server', 'index.ts')

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

const code = () => stripComments(fs.readFileSync(SRC, 'utf8'))

describe('GET /api/providers is auth-guarded (no anonymous leak)', () => {
  it('registers /api/providers with the requireInternalKey middleware', () => {
    const s = code()
    // the route must carry the auth middleware, not go straight to the handler
    expect(
      /app\.get\(\s*'\/api\/providers',\s*requireInternalKey,/.test(s),
      '/api/providers is not behind requireInternalKey (anonymous provider-state leak + ?refresh side effect)'
    ).toBe(true)
    // and never the unguarded form
    expect(
      /app\.get\(\s*'\/api\/providers',\s*async/.test(s),
      '/api/providers still has an unguarded (no-middleware) handler'
    ).toBe(false)
  })
})
