import { describe, it, expect, beforeEach } from 'vitest'
import { ipEndpoint, forgetResolved } from './src/browser/cdp'

/**
 * CHROMIUM ANSWERS ONLY TO AN IP OR TO localhost.
 *
 * Measured against the pod, the same request with two Host headers:
 *   Host: 127.0.0.1                         -> 200
 *   Host: browser-pod.railway.internal:9223 -> 500 "Host header is
 *     specified and is not an IP address or localhost."
 * Locally the broker used 127.0.0.1 and everything worked; on Railway it
 * uses the private DNS name, and every CDP call came back 500.
 */

beforeEach(() => forgetResolved())

const v4 = async () => ({ address: '10.0.0.7', family: 4 })
const v6 = async () => ({ address: 'fd12:3456::7', family: 6 })

describe('the address Chromium will accept', () => {
  it('RESOLVES A NAME TO AN IP, so the Host header is one', async () => {
    expect(await ipEndpoint('browser-pod.railway.internal:9223', v4)).toBe(
      '10.0.0.7:9223'
    )
  })

  it('brackets an IPv6 address, or the port would be read as part of it', async () => {
    /* Railway's private network has been IPv6. */
    expect(await ipEndpoint('browser-pod.railway.internal:9223', v6)).toBe(
      '[fd12:3456::7]:9223'
    )
  })

  it('leaves an address that is already acceptable alone', async () => {
    let asked = 0
    const count = async () => {
      asked++
      return { address: 'x', family: 4 }
    }
    for (const ok of ['127.0.0.1:9223', 'localhost:9222', '[::1]:9223']) {
      expect(await ipEndpoint(ok, count)).toBe(ok)
    }
    expect(asked).toBe(0)
  })

  it('accepts the http:// form the drivers sometimes store', async () => {
    expect(
      await ipEndpoint('http://browser-pod.railway.internal:9223/', v4)
    ).toBe('10.0.0.7:9223')
  })

  it('asks DNS once, not on every call of an agent turn', async () => {
    let asked = 0
    const count = async () => {
      asked++
      return { address: '10.0.0.7', family: 4 }
    }
    await ipEndpoint('browser-pod.railway.internal:9223', count)
    await ipEndpoint('browser-pod.railway.internal:9223', count)
    expect(asked).toBe(1)
  })
})
