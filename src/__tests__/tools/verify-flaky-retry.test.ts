/**
 * The verify gate must re-run its known-flaky steps once before failing, so a
 * transient environment hiccup does not false-red the whole gate.
 *
 * Two steps are environment-flaky, not code signals:
 *   - test:bun — a concurrent-runner race on the shared supabase singleton;
 *   - audit    — `bun audit` hits the registry over the network and can hang and
 *                fail on a slow/unreachable registry, then pass on the re-run.
 * Both are retried once (non-masking: a real failure reproduces and still fails).
 *
 * verify.cjs runs the whole gate on require, so this reads the source instead.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'

describe('verify.cjs retries known-flaky steps before failing', () => {
  const src = fs.readFileSync('scripts/verify.cjs', 'utf8')
  const match = src.match(/const FLAKY_RETRY = new Set\(\[([^\]]*)\]\)/)

  it('defines a FLAKY_RETRY set', () => {
    expect(match).not.toBeNull()
  })

  it('retries both test:bun and audit', () => {
    const contents = match![1]
    expect(contents).toContain("'test:bun'")
    expect(contents).toContain("'audit'")
  })
})
