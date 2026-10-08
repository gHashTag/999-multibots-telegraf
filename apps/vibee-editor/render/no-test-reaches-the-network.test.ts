/**
 * The guard every render test runs under (test-support/no-network.ts, which
 * installs apps/vibee-editor/packages/test-guard/no-network.mjs): fetch, DNS and TCP connects to any
 * host but this machine are refused, and the test that asked fails, by file
 * and host, even when the code swallowed the refusal.
 *
 * Why it exists: on 2026-10-08 the full run passed 7339 tests and still ended
 * red on 11 "getaddrinfo ENOTFOUND www.reddit.com" -- the blog-share desk's
 * Reddit leg read r/t27ai's live state from inside two tests, and the sign-in
 * notice sent a real sendMessage from a third.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import net, { type AddressInfo } from 'node:net'
import dns from 'node:dns'
import { lookup as promiseLookup } from 'node:dns/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  drainReached,
  failIfReached,
  hostOf,
  isLoopback,
  neverResolves,
} from './test-support/no-network'

const HERE = 'no-test-reaches-the-network.test.ts'

describe('no render test reaches the network', () => {
  it('is set up for every render test', () => {
    const config = readFileSync(join(__dirname, 'vitest.config.mts'), 'utf8')
    expect(config).toMatch(
      /setupFiles:\s*\[[^\]]*'\.\/test-support\/no-network\.ts'/
    )
    expect(
      (globalThis.fetch as unknown as { noNetworkGuard?: boolean })
        .noNetworkGuard
    ).toBe(true)
  })

  it('tells this machine from everything else', () => {
    for (const h of ['localhost', '127.0.0.1', '127.8.9.10', '::1', '[::1]'])
      expect(isLoopback(h)).toBe(true)
    for (const h of [
      'www.reddit.com',
      'api.telegram.org',
      '10.0.0.5',
      'localhost.evil.com',
      '128.0.0.1',
    ])
      expect(isLoopback(h)).toBe(false)
    expect(hostOf('https://www.reddit.com/r/t27ai/about.json')).toBe(
      'www.reddit.com'
    )
    expect(hostOf(new URL('http://127.0.0.1:9/x'))).toBe('127.0.0.1')
    expect(hostOf(new Request('https://api.telegram.org/bot1/getMe'))).toBe(
      'api.telegram.org'
    )
    expect(hostOf('/relative/path')).toBe('')
  })

  it('answers a name no resolver can, quietly, as a resolver would', async () => {
    for (const h of [
      'pod',
      'pod.invalid.test',
      'x.invalid',
      'a.example',
      'pod.',
    ])
      expect(neverResolves(h)).toBe(true)
    for (const h of [
      'www.reddit.com',
      'browser-pod.railway.internal',
      'localhost',
      '10.0.0.5',
      '::1',
    ])
      expect(neverResolves(h)).toBe(false)
    const cb = await new Promise<NodeJS.ErrnoException | null>(resolve =>
      dns.lookup('pod', e => resolve(e))
    )
    expect(cb?.code).toBe('ENOTFOUND')
    await expect(promiseLookup('pod.invalid.test')).rejects.toMatchObject({
      code: 'ENOTFOUND',
    })
    const f = await fetch('http://pod:9222/json/version').catch(
      (e: Error & { cause?: { code?: string } }) => e
    )
    expect(String(f)).toBe('TypeError: fetch failed')
    expect((f as { cause?: { code?: string } }).cause?.code).toBe('ENOTFOUND')
    // Nothing left the machine and nothing depends on it: not a leak.
    expect(drainReached()).toEqual([])
  })

  it('refuses a fetch to reddit.com, naming the host and this file', async () => {
    const e = await fetch('https://www.reddit.com/r/t27ai/about.json').catch(
      (x: Error) => x
    )
    expect(String(e)).toMatch(/no network in tests: fetch www\.reddit\.com/)
    expect(String(e)).toContain(HERE)
    const lines = drainReached()
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain(HERE)
  })

  it('a refusal the code swallowed still fails the test', async () => {
    // subredditOpen treats a failed reader as "did not know": that is how the
    // Reddit read hid behind passing tests.
    await fetch('https://www.reddit.com/').catch(() => 'swallowed')
    expect(() => failIfReached()).toThrow(
      /a test reached the network \(1\):\n {2}fetch www\.reddit\.com from .*no-test-reaches-the-network\.test\.ts/
    )
    expect(drainReached()).toEqual([])
  })

  it('refuses DNS by every door net, tls and http use', async () => {
    const cb = await new Promise<NodeJS.ErrnoException | null>(resolve =>
      dns.lookup('www.reddit.com', e => resolve(e))
    )
    expect(cb?.code).toBe('ENETUNREACH')
    await expect(dns.promises.lookup('api.telegram.org')).rejects.toThrow(
      /dns api\.telegram\.org/
    )
    await expect(promiseLookup('www.reddit.com')).rejects.toThrow(
      /dns www\.reddit\.com/
    )
    expect(drainReached()).toHaveLength(3)
  })

  it('a test file that leaks fails its run, by its own name and host', () => {
    const dir = join(__dirname, 'test-support', 'leak-fixture')
    const run = spawnSync(
      process.execPath,
      [
        join(__dirname, 'node_modules', 'vitest', 'vitest.mjs'),
        'run',
        '--root',
        dir,
        '--config',
        join(dir, 'vitest.config.mts'),
      ],
      { encoding: 'utf8', timeout: 60_000, env: { ...process.env, CI: '1' } }
    )
    const out = `${run.stdout}${run.stderr}`
    expect(run.status, out).toBe(1)
    expect(out).toMatch(/a test reached the network \(1\)/)
    expect(out).toMatch(/fetch www\.reddit\.com from .*leaks\.fixture\.ts/)
    // The test that asked is the one marked failed (afterEach), not only
    // its file at the end (afterAll catches what leaks after the last test).
    expect(out).toMatch(
      /FAIL\s+leaks\.fixture\.ts > reads a community and swallows the failure/
    )
    expect(out).toMatch(/Tests\s+1 failed/)
  }, 60_000)

  it('refuses a TCP connect to an address, which asks no resolver', async () => {
    const e = await new Promise<NodeJS.ErrnoException>(resolve => {
      const s = net.connect(443, '93.184.216.34')
      s.on('error', resolve)
      s.on('connect', () => resolve(new Error('connected') as never))
    })
    expect(e.code).toBe('ENETUNREACH')
    expect(drainReached()).toEqual([
      expect.stringMatching(
        /^connect 93\.184\.216\.34 from .*no-test-reaches-the-network/
      ),
    ])
  })

  it('lets a test serve and call itself', async () => {
    const server = createServer((_q, r) => r.end('ok'))
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
    const { port } = server.address() as AddressInfo
    try {
      const r = await fetch(`http://127.0.0.1:${port}/`)
      expect(await r.text()).toBe('ok')
      const local = await new Promise<string>((resolve, reject) =>
        dns.lookup('localhost', (e, a) => (e ? reject(e) : resolve(String(a))))
      )
      expect(local).toMatch(/^(127\.0\.0\.1|::1)$/)
    } finally {
      server.close()
    }
    expect(drainReached()).toEqual([])
  })
})
