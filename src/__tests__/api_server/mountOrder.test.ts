/**
 * Guard against the Express mount-order trap that silently killed every
 * Inngest function for nine days.
 *
 * `app.use('/api', requireInternalKey, router)` runs the key check for EVERY
 * /api/* request that reaches that stack position — not only for the router's
 * own paths. When the guarded mounts sat above the /api/inngest mount and the
 * public whitelabel pages, the guard 401'd them as collateral: from
 * 2026-08-19T20:30Z every Inngest invocation died with
 * {"error":"unauthorized"} before the SDK ran (all crons broken), and the
 * public whitelabel landing was dead too.
 *
 * This test pins the ordering in the SOURCE: every requireInternalKey mount
 * must come after every unkeyed public /api surface. Typecheck and unit tests
 * cannot catch this class — the file compiles either way.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'

const SRC = fs.readFileSync('src/api_server/index.ts', 'utf8')

function lineOf(pattern: RegExp): number {
  const idx = SRC.search(pattern)
  expect(
    idx,
    `pattern not found in api_server/index.ts: ${pattern}`
  ).toBeGreaterThanOrEqual(0)
  return SRC.slice(0, idx).split('\n').length
}

describe('api_server mount order', () => {
  const firstGuard = lineOf(/app\.use\('\/api', requireInternalKey/)

  it('inngest serve is mounted before any keyed mount', () => {
    expect(lineOf(/app\.use\('\/api\/inngest'/)).toBeLessThan(firstGuard)
  })

  it('read-only inngest status router is mounted before the serve handler and any keyed mount', () => {
    const status = lineOf(/app\.use\(inngestStatusRouter\)/)
    expect(status).toBeLessThan(lineOf(/app\.use\('\/api\/inngest'/))
    expect(status).toBeLessThan(firstGuard)
  })

  it('public competitor routes are mounted before any keyed mount', () => {
    expect(lineOf(/app\.use\('\/api', competitorRouter\)/)).toBeLessThan(
      firstGuard
    )
  })

  it('public whitelabel endpoints are mounted before any keyed mount', () => {
    expect(lineOf(/app\.get\('\/api\/whitelabel\/landing'/)).toBeLessThan(
      firstGuard
    )
  })

  it('public webhooks (robokassa, kie, replicate) are mounted before any keyed mount', () => {
    expect(lineOf(/app\.use\('\/api', robokassaRouter\)/)).toBeLessThan(
      firstGuard
    )
    expect(lineOf(/app\.use\('\/api', kieAiWebhookRouter\)/)).toBeLessThan(
      firstGuard
    )
    expect(
      lineOf(/app\.use\('\/api\/webhooks', replicateWebhookRouter\)/)
    ).toBeLessThan(firstGuard)
  })

  it('the guarded mounts still exist (protection not silently dropped)', () => {
    const guards =
      SRC.match(/app\.use\('\/api', requireInternalKey, \w+Router\)/g) || []
    expect(guards.length).toBe(4) // voiceAvatar, neuroPhoto, diagnostic, billing
  })
})
