/**
 * NO TEST REACHES THE NETWORK -- one guard for every test suite here.
 *
 * Found 2026-10-08. The render's full run passed all 7339 tests and still
 * ended red on 11 "getaddrinfo ENOTFOUND www.reddit.com": two tests drove the
 * blog-share desk's real publish path, whose Reddit leg read r/t27ai's LIVE
 * state (banned since 2026-10-03), so on a machine with the network the same
 * test took a different branch than in the cloud. A census of each suite
 * then found the rest: the render's sign-in notice sent a real sendMessage
 * to api.telegram.org; seven player tests called the PRODUCTION render --
 * among them writes: the welcome page's traffic beacon, a pay outcome, a
 * voice synthesis.
 *
 * A suite installs it from its own setup file with its own vitest hooks (the
 * packages carry their own vitest, so this file never imports one):
 *
 *   installNoNetwork({ afterEach, afterAll, testPath: () => expect.getState().testPath })
 *
 * Then fetch, DNS (dns.lookup, dns.promises.lookup) and every TCP connect
 * (net.Socket#connect: undici, http, https, tls, axios, WebSocket) to any
 * host but this machine are refused, and the test that asked fails in
 * afterEach (afterAll for what leaks after a file's last test), naming its
 * file and the host -- even when the code swallowed the refusal, which is
 * how the Reddit read hid. A test that needs an answer from outside stubs it.
 *
 * A name no public resolver can ever answer -- one label (`pod`), or a
 * reserved zone (`.test`, `.invalid`, `.example`; RFC 2606, RFC 6761) -- is
 * answered here, ENOTFOUND as a resolver would, without asking one and
 * without failing the test: the code sees what it sees everywhere.
 * `.internal` is not among them: Railway's private names resolve on Railway.
 */
import dns from 'node:dns'
import net from 'node:net'
import { syncBuiltinESMExports } from 'node:module'

const strip = host =>
  String(host ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')

/** This machine: a test may serve and call itself. */
export function isLoopback(host) {
  const h = strip(host)
  return (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    /^127(\.\d{1,3}){3}$/.test(h) ||
    h === '::1' ||
    h === '0.0.0.0' ||
    h === '::'
  )
}

/** A name no public resolver answers: one label, or a reserved zone. */
export function neverResolves(host) {
  const h = strip(host)
  if (!h || isLoopback(h) || net.isIP(h)) return false
  return !h.includes('.') || /\.(test|invalid|example)$/.test(h)
}

/** The host a fetch was asked for: a string, a URL or a Request. */
export function hostOf(input) {
  const raw =
    input && typeof input === 'object' && 'url' in input
      ? String(input.url)
      : String(input)
  try {
    return new URL(raw).hostname
  } catch {
    return '' // a relative or broken address never leaves the process
  }
}

const STATE = Symbol.for('t27.noNetwork')
const state = (globalThis[STATE] ??= {
  reached: [],
  installed: false,
  where: () => 'outside a test',
})

function where() {
  try {
    return state.where() ?? 'outside a test'
  } catch {
    return 'outside a test'
  }
}

function refusal(kind, host) {
  const line = `${kind} ${host} from ${where()}`
  state.reached.push(line)
  const e = new Error(
    `no network in tests: ${line} -- stub it (apps/vibee-editor/packages/test-guard/no-network.mjs)`
  )
  e.code = 'ENETUNREACH'
  return e
}

function notFound(host) {
  const e = new Error(`getaddrinfo ENOTFOUND ${host}`)
  e.code = 'ENOTFOUND'
  e.hostname = host
  return e
}

/** What was refused since the last check, emptied. A guard's own test reads it. */
export function drainReached() {
  return state.reached.splice(0)
}

/** Throws, naming every refused call since the last check; afterEach runs it. */
export function failIfReached() {
  const lines = drainReached()
  if (lines.length)
    throw new Error(
      `a test reached the network (${lines.length}):\n  ${lines.join('\n  ')}\n` +
        'Stub the call in the test; apps/vibee-editor/packages/test-guard/no-network.mjs says why.'
    )
}

/** The host a TCP connect asks for; null for a unix socket. */
function connectHost(args) {
  const a = Array.isArray(args[0]) ? args[0][0] : args[0]
  if (a && typeof a === 'object') {
    if (a.path) return null
    return String(a.host ?? 'localhost')
  }
  if (typeof a === 'string' && !/^\d+$/.test(a)) return null // a pipe path
  return typeof args[1] === 'string' ? args[1] : 'localhost'
}

/**
 * A proxy on this machine is still the network. Measured 2026-10-08: with
 * HTTPS_PROXY=http://127.0.0.1:<port> (the cloud container's egress, and any
 * VPN or corporate proxy on a laptop) axios connected to the loopback proxy,
 * which the guard lets through, and the proxy went out -- a call to
 * api.coingecko.com left the machine past every check here. Without the
 * variables a client goes direct and meets the guard.
 */
export function dropProxyEnv(env = process.env) {
  const gone = []
  for (const k of Object.keys(env))
    if (
      /^(https?|all)_proxy$/i.test(k) ||
      /^GLOBAL_AGENT_/.test(k) ||
      k === 'NODE_USE_ENV_PROXY'
    ) {
      delete env[k]
      gone.push(k)
    }
  return gone
}

function guard() {
  dropProxyEnv()
  const realFetch = globalThis.fetch
  const guardedFetch = (input, init) => {
    const host = hostOf(input)
    if (host && neverResolves(host))
      return Promise.reject(
        Object.assign(new TypeError('fetch failed'), { cause: notFound(host) })
      )
    if (host && !isLoopback(host)) return Promise.reject(refusal('fetch', host))
    return realFetch(input, init)
  }
  Object.defineProperty(guardedFetch, 'noNetworkGuard', { value: true })
  globalThis.fetch = guardedFetch

  // net, tls, http and undici resolve through dns.lookup, read at call time.
  const realLookup = dns.lookup
  dns.lookup = function lookup(host, ...rest) {
    if (!isLoopback(host)) {
      const cb = rest[rest.length - 1]
      const e = neverResolves(host) ? notFound(host) : refusal('dns', host)
      if (typeof cb === 'function') process.nextTick(() => cb(e))
      return {}
    }
    return realLookup.call(dns, host, ...rest)
  }
  const realPromiseLookup = dns.promises.lookup
  dns.promises.lookup = (host, ...rest) =>
    isLoopback(host)
      ? realPromiseLookup(host, ...rest)
      : Promise.reject(
          neverResolves(host) ? notFound(host) : refusal('dns', host)
        )
  // `import { lookup } from 'node:dns/promises'` sees the guard too.
  syncBuiltinESMExports()

  // An address needs no lookup: every TCP connect is the last door.
  const realConnect = net.Socket.prototype.connect
  net.Socket.prototype.connect = function connect(...args) {
    const host = connectHost(args)
    if (host !== null && net.isIP(strip(host)) && !isLoopback(host)) {
      const e = refusal('connect', host)
      process.nextTick(() => this.destroy(e))
      return this
    }
    return realConnect.apply(this, args)
  }
}

/**
 * Install the guard (once per process) and fail every test that reached the
 * network. `testPath` names the running test's file for the message.
 */
export function installNoNetwork({ afterEach, afterAll, testPath }) {
  if (testPath) state.where = testPath
  if (!state.installed) {
    guard()
    state.installed = true
  }
  afterEach(failIfReached)
  afterAll(failIfReached)
}
