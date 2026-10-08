/**
 * NO RENDER TEST REACHES THE NETWORK.
 *
 * Found 2026-10-08: every full run of the render's tests passed all 7339
 * tests and still ended red, on 11 "Uncaught Exception: getaddrinfo ENOTFOUND
 * www.reddit.com". Two test files drove the blog-share desk's real publish
 * path, and the Reddit leg asked reddit.com itself whether r/t27ai is open
 * (reddit.ts readAnonymously). In a container without the network the lookup
 * failed after the test had moved on; on a machine with it, the test read
 * the community's LIVE state -- banned since 2026-10-03 -- so the same test
 * took a different branch on the owner's Mac than in the cloud. A census of
 * the whole suite found one more: the sign-in notice sent a real sendMessage
 * to api.telegram.org with the test's fake token (pairing-e2e.test.ts).
 *
 * So this file is a setup file of every render test (vitest.config.mts):
 * `fetch` and DNS lookups of any host but this machine are refused, and the
 * test that asked fails in afterEach, naming its file and the host -- even
 * when the code under test swallowed the refusal, which is exactly how the
 * Reddit read hid (subredditOpen treats a failed reader as "did not know").
 * A test that needs an answer from outside stubs it.
 *
 * A name that no public resolver can ever answer -- one label (`pod`, the
 * fake pod hosts of the browser tests) or a reserved zone (`.test`,
 * `.invalid`, `.example`; RFC 2606, RFC 6761) -- is answered here, ENOTFOUND
 * as a resolver would, without asking one and without failing the test: the
 * code sees what it sees everywhere, so the test depends on nothing outside.
 * `.internal` is not among them: Railway's private names resolve on Railway.
 */
import dns from 'node:dns'
import { syncBuiltinESMExports } from 'node:module'
import { afterAll, afterEach, expect } from 'vitest'

/** This machine: a test may serve and call itself. */
export function isLoopback(host: string): boolean {
  const h = host
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
  return (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    /^127(\.\d{1,3}){3}$/.test(h) ||
    h === '::1' ||
    h === '0.0.0.0'
  )
}

/** A name no public resolver answers: one label, or a reserved zone. */
export function neverResolves(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/\.$/, '')
  if (!h || isLoopback(h) || /^[\d.]+$/.test(h) || h.includes(':')) return false
  return !h.includes('.') || /\.(test|invalid|example)$/.test(h)
}

function notFound(host: string): Error {
  const e = new Error(`getaddrinfo ENOTFOUND ${host}`) as Error & {
    code: string
    hostname: string
  }
  e.code = 'ENOTFOUND'
  e.hostname = host
  return e
}

/** The host a fetch was asked for: a string, a URL or a Request. */
export function hostOf(input: unknown): string {
  const raw =
    input && typeof input === 'object' && 'url' in input
      ? String((input as { url: unknown }).url)
      : String(input)
  try {
    return new URL(raw).hostname
  } catch {
    return '' // a relative or broken address never leaves the process
  }
}

const reached: string[] = []

function where(): string {
  try {
    return expect.getState().testPath ?? 'outside a test'
  } catch {
    return 'outside a test'
  }
}

function refusal(kind: string, host: string): Error {
  const line = `${kind} ${host} from ${where()}`
  reached.push(line)
  const e = new Error(
    `no network in render tests: ${line} -- stub it (test-support/no-network.ts)`
  ) as Error & { code: string }
  e.code = 'ENETUNREACH'
  return e
}

/** What was refused since the last check, emptied. The guard's own test reads it. */
export function drainReached(): string[] {
  return reached.splice(0)
}

const realFetch = globalThis.fetch
const guardedFetch = ((input: unknown, init?: unknown) => {
  const host = hostOf(input)
  if (host && neverResolves(host))
    return Promise.reject(
      Object.assign(new TypeError('fetch failed'), { cause: notFound(host) })
    )
  if (host && !isLoopback(host)) return Promise.reject(refusal('fetch', host))
  return (realFetch as (a: unknown, b?: unknown) => Promise<Response>)(
    input,
    init
  )
}) as typeof fetch
Object.defineProperty(guardedFetch, 'noNetworkGuard', { value: true })
globalThis.fetch = guardedFetch

/* net, tls and http resolve through dns.lookup, read at call time. */
const realLookup = dns.lookup
;(dns as { lookup: unknown }).lookup = function lookup(
  host: string,
  ...rest: unknown[]
) {
  if (!isLoopback(String(host))) {
    const cb = rest[rest.length - 1]
    const e = neverResolves(String(host))
      ? notFound(String(host))
      : refusal('dns', String(host))
    if (typeof cb === 'function') process.nextTick(() => cb(e))
    return {}
  }
  return (realLookup as (...a: unknown[]) => unknown).call(dns, host, ...rest)
}
const realPromiseLookup = dns.promises.lookup
;(dns.promises as { lookup: unknown }).lookup = (
  host: string,
  ...rest: unknown[]
) =>
  isLoopback(String(host))
    ? (realPromiseLookup as (...a: unknown[]) => Promise<unknown>)(
        host,
        ...rest
      )
    : Promise.reject(
        neverResolves(String(host))
          ? notFound(String(host))
          : refusal('dns', String(host))
      )
/* `import { lookup } from 'node:dns/promises'` sees the guard too. */
syncBuiltinESMExports()

/** Throws, naming every refused call since the last check; afterEach runs it. */
export function failIfReached(): void {
  const lines = drainReached()
  if (lines.length)
    throw new Error(
      `a render test reached the network (${lines.length}):\n  ${lines.join('\n  ')}\n` +
        'Stub the call in the test; test-support/no-network.ts says why.'
    )
}

afterEach(failIfReached)
afterAll(failIfReached)
