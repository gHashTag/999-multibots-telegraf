/**
 * The rule that tells a real restart from a reported one. Pure, so it is
 * checked without a pod -- which is the point: the thing that lied for three
 * days was a reachable pod.
 */
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { bootIdOf, bootVerdict, browserBootId } from './boot'

describe('bootIdOf', () => {
  it('reads the browser guid out of the socket the pod advertises', () => {
    expect(
      bootIdOf('ws://127.0.0.1:9222/devtools/browser/8f2a-1d4e-aaaa')
    ).toBe('8f2a-1d4e-aaaa')
  })

  it('IS NOT FOOLED BY A PAGE SOCKET', () => {
    /*
     * Pages come and go without the browser restarting. Reading one of those
     * as an identity would report a restart on every new tab -- the same class
     * of lie this module exists to catch.
     */
    expect(bootIdOf('ws://127.0.0.1:9222/devtools/page/ABCD1234')).toBe('')
  })

  it('is empty for anything that is not a socket', () => {
    expect(bootIdOf('')).toBe('')
    expect(bootIdOf('http://pod.internal:9223')).toBe('')
  })
})

describe('bootVerdict', () => {
  it('calls a new guid a restart', () => {
    expect(bootVerdict('old', 'new')).toBe('restarted')
  })

  it('CALLS THE SAME GUID THE SAME BROWSER', () => {
    /* This is the three-day bug: `stop` is a no-op and nothing said so. */
    expect(bootVerdict('same', 'same')).toBe('same-browser')
  })

  it('never manufactures a restart out of a failed read', () => {
    expect(bootVerdict('', 'new')).toBe('unknown')
    expect(bootVerdict('old', '')).toBe('unknown')
    expect(bootVerdict('', '')).toBe('unknown')
  })
})

/*
 * A REFUSAL THAT RETURNS '' LOOKS EXACTLY LIKE A POD THAT WOULD NOT SAY.
 *
 * Which is why this went unnoticed: browserBootId asked the pod by NAME, and
 * Chromium refuses a DevTools HTTP request whose Host is a name rather than an
 * address. Every other caller in cdp.ts resolves first. Measured on the live
 * service 2026-09-27: GET /api/browser/watch answered `ok: true` with
 * `bootId: ""` and `boots: 0` -- health was talking to a resolved address while
 * the witness of a restart was being turned away, and had never seen one.
 */
describe('browserBootId', () => {
  it('ASKS FOR AN ADDRESS, not a name, before it asks the pod', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(join(__dirname, 'boot.ts'), 'utf8')
    expect(src).toMatch(/await ipEndpoint\(/)
    expect(src).not.toMatch(/httpBase\(cdpEndpoint\)/)
  })

  it('reads the guid the pod advertises, and stays quiet when refused', async () => {
    const seen: string[] = []
    const real = globalThis.fetch
    const answer = (ok: boolean, ws: string) =>
      (globalThis.fetch = (async (u: string) => {
        seen.push(String(u))
        return { ok, json: async () => ({ webSocketDebuggerUrl: ws }) }
      }) as never)
    try {
      answer(true, 'ws://127.0.0.1:9222/devtools/browser/guid-abc')
      expect(await browserBootId('127.0.0.1:9222')).toBe('guid-abc')
      expect(seen.at(-1)).toBe('http://127.0.0.1:9222/json/version')
      answer(false, '')
      expect(await browserBootId('127.0.0.1:9222')).toBe('')
    } finally {
      globalThis.fetch = real
    }
  })
})
