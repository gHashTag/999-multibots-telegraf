/**
 * WHICH FRAME A PRESS HITS, AS CHROMIUM ANSWERS IT (cdp.ts frameAtPointWith).
 *
 * The bee on #3507 mutated the hit-test and four mutants lived: the tools'
 * tests replace frameAtPoint whole, so nothing drove the function itself.
 * The worst of the four: an error read as "the top page", which lets a press
 * into the Stripe frame through with no yes. Here the CDP calls are faked
 * one by one, with the shapes the bee measured live.
 */
import { describe, expect, it } from 'vitest'
import { frameAtPointWith, type Call } from './src/browser/cdp'

type Answer = Record<string, unknown> | Error

function fakeCall(answers: Record<string, Answer>) {
  const asked: Array<{ method: string; params?: Record<string, unknown> }> = []
  const call: Call = async (method, params) => {
    asked.push({ method, params })
    const a = answers[method]
    if (a === undefined) throw new Error(`unexpected ${method}`)
    if (a instanceof Error) throw a
    return a
  }
  return { call, asked }
}

const METRICS = { cssVisualViewport: { pageX: 0, pageY: 0 } }
const TREE = {
  frameTree: {
    frame: { id: 'page-1', url: 'https://shop.example/' },
    childFrames: [
      {
        frame: { id: 'outer', url: 'https://widget.example/' },
        childFrames: [
          {
            frame: {
              id: 'pay',
              url: 'https://js.stripe.com/v3',
              urlFragment: '#card',
            },
          },
        ],
      },
    ],
  },
}

describe('frameAtPointWith', () => {
  it('names the frame an IFRAME owns, with its address from the tree', async () => {
    const { call } = fakeCall({
      'Page.getLayoutMetrics': METRICS,
      'DOM.getNodeForLocation': { backendNodeId: 7, frameId: 'page-1' },
      'DOM.describeNode': { node: { nodeName: 'IFRAME', frameId: 'pay' } },
      'Page.getFrameTree': TREE,
    })
    expect(await frameAtPointWith(call, 'page-1', 5, 5)).toEqual({
      frameId: 'pay',
      url: 'https://js.stripe.com/v3#card',
    })
  })

  it('a node inside a frame document is judged by that frame', async () => {
    const { call } = fakeCall({
      'Page.getLayoutMetrics': METRICS,
      'DOM.getNodeForLocation': { backendNodeId: 9, frameId: 'outer' },
      'DOM.describeNode': { node: { nodeName: 'BUTTON' } },
      'Page.getFrameTree': TREE,
    })
    expect(await frameAtPointWith(call, 'page-1', 5, 5)).toEqual({
      frameId: 'outer',
      url: 'https://widget.example/',
    })
  })

  it('the top page itself is the page, and its tree is not read', async () => {
    const { call, asked } = fakeCall({
      'Page.getLayoutMetrics': METRICS,
      'DOM.getNodeForLocation': { backendNodeId: 3, frameId: 'page-1' },
      'DOM.describeNode': { node: { nodeName: 'DIV' } },
    })
    expect(await frameAtPointWith(call, 'page-1', 5, 5)).toEqual({
      frameId: 'page-1',
      url: null,
    })
    expect(asked.map(a => a.method)).not.toContain('Page.getFrameTree')
  })

  it('a frame the tree does not know comes back with no address', async () => {
    const { call } = fakeCall({
      'Page.getLayoutMetrics': METRICS,
      'DOM.getNodeForLocation': { backendNodeId: 7, frameId: 'page-1' },
      'DOM.describeNode': { node: { nodeName: 'IFRAME', frameId: 'oopif-9' } },
      'Page.getFrameTree': new Error('gone'),
    })
    expect(await frameAtPointWith(call, 'page-1', 5, 5)).toEqual({
      frameId: 'oopif-9',
      url: null,
    })
  })

  it('"No node found" is empty canvas: the top page', async () => {
    const { call } = fakeCall({
      'Page.getLayoutMetrics': METRICS,
      'DOM.getNodeForLocation': new Error(
        'CDP DOM.getNodeForLocation: No node found at given location'
      ),
    })
    expect(await frameAtPointWith(call, 'page-1', 5, 5)).toEqual({
      frameId: 'page-1',
      url: null,
    })
  })

  it('ANY OTHER ERROR THROWS: it is never read as "the top page"', async () => {
    const { call } = fakeCall({
      'Page.getLayoutMetrics': METRICS,
      'DOM.getNodeForLocation': new Error(
        'CDP DOM.getNodeForLocation: timed out'
      ),
    })
    await expect(frameAtPointWith(call, 'page-1', 5, 5)).rejects.toThrow(
      /timed out/
    )
  })

  it('a hit that names no frame throws', async () => {
    const { call } = fakeCall({
      'Page.getLayoutMetrics': METRICS,
      'DOM.getNodeForLocation': { backendNodeId: 3 },
      'DOM.describeNode': { node: { nodeName: 'DIV' } },
    })
    await expect(frameAtPointWith(call, 'page-1', 5, 5)).rejects.toThrow(
      /named no frame/
    )
  })

  it('no scroll offset, no answer: the point cannot be placed', async () => {
    const { call, asked } = fakeCall({ 'Page.getLayoutMetrics': {} })
    await expect(frameAtPointWith(call, 'page-1', 5, 5)).rejects.toThrow(
      /scroll offset/
    )
    expect(asked.map(a => a.method)).toEqual(['Page.getLayoutMetrics'])
  })

  it('the press is placed in DOCUMENT px: scroll added, rounded, no pointer-events override', async () => {
    const { call, asked } = fakeCall({
      'Page.getLayoutMetrics': {
        cssVisualViewport: { pageX: 0.6, pageY: 500 },
      },
      'DOM.getNodeForLocation': { backendNodeId: 3, frameId: 'page-1' },
      'DOM.describeNode': { node: { nodeName: 'DIV' } },
    })
    await frameAtPointWith(call, 'page-1', 10, 100)
    const hit = asked.find(a => a.method === 'DOM.getNodeForLocation')
    expect(hit?.params).toEqual({
      x: 11,
      y: 600,
      includeUserAgentShadowDOM: true,
    })
  })

  it('the layout viewport is the fallback when the visual one is missing', async () => {
    const { call, asked } = fakeCall({
      'Page.getLayoutMetrics': { cssLayoutViewport: { pageX: 0, pageY: 40 } },
      'DOM.getNodeForLocation': { backendNodeId: 3, frameId: 'page-1' },
      'DOM.describeNode': { node: { nodeName: 'DIV' } },
    })
    await frameAtPointWith(call, 'page-1', 1, 1)
    const hit = asked.find(a => a.method === 'DOM.getNodeForLocation')
    expect(hit?.params?.y).toBe(41)
  })
})
