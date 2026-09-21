import { describe, it, expect, beforeEach } from 'vitest'
import {
  ipEndpoint,
  forgetResolved,
  fitWindowToScreen,
} from './src/browser/cdp'

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

describe('the window is fitted to the screen', () => {
  function io(pages: { id: string; type: string; windowId?: number }[]) {
    const calls: [string, Record<string, unknown>][] = []
    return {
      calls,
      io: {
        targets: async () =>
          pages.map(p => ({ id: p.id, type: p.type, title: '', url: '' })),
        wsUrl: async () => 'ws://browser',
        call: async (_ws: string, method: string, params = {}) => {
          calls.push([method, params])
          if (method === 'Browser.getWindowForTarget') {
            const page = pages.find(p => p.id === params.targetId)
            if (page?.windowId === undefined) throw new Error('No target')
            return { windowId: page.windowId }
          }
          return {}
        },
      },
    }
  }

  it('SETS IT NORMAL FIRST, THEN EXACTLY THE SCREEN', async () => {
    const w = io([{ id: 'a', type: 'page', windowId: 7 }])
    const n = await fitWindowToScreen(
      'pod:9223',
      { width: 800, height: 1600 },
      w.io
    )
    expect(n).toBe(1)
    expect(w.calls.slice(1)).toEqual([
      [
        'Browser.setWindowBounds',
        { windowId: 7, bounds: { windowState: 'normal' } },
      ],
      [
        'Browser.setWindowBounds',
        { windowId: 7, bounds: { left: 0, top: 0, width: 800, height: 1600 } },
      ],
    ])
  })

  it('fits each window once, however many tabs it holds', async () => {
    const w = io([
      { id: 'a', type: 'page', windowId: 7 },
      { id: 'b', type: 'page', windowId: 7 },
      { id: 'c', type: 'page', windowId: 9 },
    ])
    expect(
      await fitWindowToScreen('p', { width: 400, height: 800 }, w.io)
    ).toBe(2)
  })

  it('asks only about pages, and survives a tab that closed', async () => {
    const w = io([
      { id: 'sw', type: 'service_worker', windowId: 1 },
      { id: 'gone', type: 'page' },
      { id: 'a', type: 'page', windowId: 3 },
    ])
    expect(
      await fitWindowToScreen('p', { width: 400, height: 800 }, w.io)
    ).toBe(1)
    expect(w.calls.map(c => c[1].targetId).filter(Boolean)).toEqual([
      'gone',
      'a',
    ])
  })

  it('does nothing when there is no page at all', async () => {
    const w = io([])
    expect(
      await fitWindowToScreen('p', { width: 400, height: 800 }, w.io)
    ).toBe(0)
    expect(w.calls).toEqual([])
  })
})
