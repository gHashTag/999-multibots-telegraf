/**
 * The rule that tells a real restart from a reported one. Pure, so it is
 * checked without a pod -- which is the point: the thing that lied for three
 * days was a reachable pod.
 */
import { describe, it, expect } from 'vitest'
import { bootIdOf, bootVerdict } from './boot'

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
