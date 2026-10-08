/**
 * The root suite runs under the network guard (apps/vibee-editor/packages/test-guard/no-network.mjs,
 * installed by vitest.setup.ts): fetch, DNS and TCP to any host but this
 * machine are refused, and the test that asked fails by file and host.
 *
 * Census of 2026-10-08: five business-DM tests read the shared transcript
 * from the PRODUCTION render, /price asked Binance, CoinGecko and open.er-api,
 * and the lip-sync refund test queued a job at fal. The observer it replaced
 * (DETECT_NETWORK) only logged, and once reported "0 calls".
 */
import { readFileSync } from 'node:fs'
import net from 'node:net'
import { join } from 'node:path'
import axios from 'axios'
import { describe, expect, it } from 'vitest'
import {
  drainReached,
  dropProxyEnv,
  failIfReached,
} from '../../../apps/vibee-editor/packages/test-guard/no-network.mjs'

const ROOT = join(__dirname, '..', '..', '..')
const HERE = 'noTestReachesTheNetwork.test.ts'

describe('no root test reaches the network', () => {
  it('is installed by the setup file every root test runs', () => {
    expect(readFileSync(join(ROOT, 'vitest.config.ts'), 'utf8')).toMatch(
      /setupFiles:\s*\[[^\]]*'\.\/vitest\.setup\.ts'/
    )
    expect(readFileSync(join(ROOT, 'vitest.setup.ts'), 'utf8')).toMatch(
      /installNoNetwork\(\{/
    )
    expect(
      (globalThis.fetch as unknown as { noNetworkGuard?: boolean })
        .noNetworkGuard
    ).toBe(true)
  })

  it('refuses a fetch to the production render, naming this file', async () => {
    const e = await fetch(
      'https://vibee-render-production.up.railway.app/api/agent/history'
    ).catch((x: Error) => x)
    expect(String(e)).toMatch(
      /no network in tests: fetch vibee-render-production\.up\.railway\.app/
    )
    expect(drainReached()).toEqual([expect.stringContaining(HERE)])
  })

  it('a proxy on this machine is no way out: its variables are gone', () => {
    // axios honours HTTPS_PROXY; with a loopback proxy (the cloud container's
    // egress, a laptop's VPN) it went out past the guard.
    for (const k of Object.keys(process.env))
      expect(k).not.toMatch(/^(https?|all)_proxy$|^GLOBAL_AGENT_/i)
    const env: Record<string, string | undefined> = {
      HTTPS_PROXY: 'http://127.0.0.1:9',
      http_proxy: 'http://127.0.0.1:9',
      GLOBAL_AGENT_HTTP_PROXY: 'x',
      NO_PROXY: 'localhost',
      PATH: '/bin',
    }
    expect(dropProxyEnv(env).sort()).toEqual([
      'GLOBAL_AGENT_HTTP_PROXY',
      'HTTPS_PROXY',
      'http_proxy',
    ])
    expect(env).toEqual({ NO_PROXY: 'localhost', PATH: '/bin' })
  })

  it('refuses axios too: it does not go through fetch', async () => {
    // The observer this replaced was once blind to axios, the client most of
    // this code uses: in Node it rides http/https, not fetch.
    await expect(
      axios.get('https://api.coingecko.com/api/v3/ping')
    ).rejects.toBeDefined()
    await expect(axios.get('http://93.184.216.34/')).rejects.toBeDefined()
    const lines = drainReached()
    expect(lines.some(l => l.startsWith('dns api.coingecko.com'))).toBe(true)
    expect(lines.some(l => l.startsWith('connect 93.184.216.34'))).toBe(true)
  })

  it('a refusal the code swallowed still fails the test', async () => {
    await new Promise<void>(resolve =>
      net.connect(443, '1.1.1.1').on('error', () => resolve())
    )
    expect(() => failIfReached()).toThrow(
      /a test reached the network \(1\):\n {2}connect 1\.1\.1\.1 from .*noTestReachesTheNetwork/
    )
  })
})
