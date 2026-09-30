import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePublishedHeight } from './usePublishedHeight'

/*
 * Something pinned under a pinned bar reads the bar's height from a CSS
 * variable. Pinned here: the value lands on the PARENT, follows a resize,
 * and leaves with the element.
 */

let observed: Array<() => void> = []
class FakeObserver {
  constructor(private cb: () => void) {}
  observe() {
    observed.push(this.cb)
  }
  disconnect() {
    observed = observed.filter(cb => cb !== this.cb)
  }
}

let host: HTMLDivElement
let root: Root
let height = 114

function Bar({ on }: { on: boolean }) {
  const ref = usePublishedHeight('--bar-h')
  return <div className="parent">{on ? <div ref={ref} /> : null}</div>
}

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  observed = []
  height = 114
  vi.stubGlobal('ResizeObserver', FakeObserver)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({ height }) as DOMRect
  )
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const parent = () => host.querySelector<HTMLElement>('.parent')!

describe('usePublishedHeight', () => {
  it('publishes the height on the parent, not on the page', () => {
    act(() => root.render(<Bar on />))
    expect(parent().style.getPropertyValue('--bar-h')).toBe('114px')
    expect(document.documentElement.style.getPropertyValue('--bar-h')).toBe('')
  })

  it('follows the element when it resizes', () => {
    act(() => root.render(<Bar on />))
    height = 160
    act(() => observed.forEach(cb => cb()))
    expect(parent().style.getPropertyValue('--bar-h')).toBe('160px')
  })

  it('takes the value away with the element', () => {
    act(() => root.render(<Bar on />))
    act(() => root.render(<Bar on={false} />))
    expect(parent().style.getPropertyValue('--bar-h')).toBe('')
    expect(observed).toHaveLength(0)
  })

  it('works on a mount that comes late', () => {
    act(() => root.render(<Bar on={false} />))
    act(() => root.render(<Bar on />))
    expect(parent().style.getPropertyValue('--bar-h')).toBe('114px')
  })
})
