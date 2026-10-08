/**
 * The player's tests run under the network guard (apps/vibee-editor/packages/test-guard/no-network.mjs,
 * installed by src/test/setup.ts): fetch, DNS and TCP to any host but this
 * machine are refused, and the test that asked fails by file and host.
 *
 * Census of 2026-10-08: seven player test files called the PRODUCTION render
 * -- the welcome page's traffic beacon, a pay outcome, a voice synthesis among
 * them -- because API_BASE falls back to it when VITE_API_URL is unset.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { API_BASE } from '@/config'
import { drainReached } from '../../../packages/test-guard/no-network.mjs'

describe('no player test reaches the network', () => {
  it('is installed by the setup file every player test runs', () => {
    const player = join(__dirname, '..', '..')
    expect(readFileSync(join(player, 'vitest.config.ts'), 'utf8')).toMatch(
      /setupFiles: '\.\/src\/test\/setup\.ts'/
    )
    expect(
      readFileSync(join(player, 'src', 'test', 'setup.ts'), 'utf8')
    ).toMatch(/installNoNetwork\(\{/)
    expect(
      (globalThis.fetch as unknown as { noNetworkGuard?: boolean })
        .noNetworkGuard
    ).toBe(true)
  })

  it("refuses the app's own API base, the production render, by name", async () => {
    const e = await fetch(`${API_BASE}/api/traffic/welcome`, {
      method: 'POST',
    }).catch((x: Error) => x)
    expect(String(e)).toMatch(/no network in tests: fetch /)
    expect(drainReached()).toEqual([
      expect.stringMatching(
        /^fetch .+ from .*no-test-reaches-the-network\.test\.ts$/
      ),
    ])
  })
})
