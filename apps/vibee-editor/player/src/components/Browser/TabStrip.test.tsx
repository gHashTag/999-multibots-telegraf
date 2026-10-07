import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { BrowserTab } from '@/lib/remoteBrowser'

const TWO: BrowserTab[] = [
  { id: 'A', title: 'Inbox', host: 'mail.example.com', active: false },
  { id: 'B', title: 'Docs', host: 'docs.example.org', active: true },
]

const readBrowserTabs = vi.fn(async (): Promise<BrowserTab[] | null> => TWO)
const actOnBrowserTab = vi.fn<
  (action: string, id?: string) => Promise<BrowserTab[] | null>
>(async () => TWO)

vi.mock('@/lib/remoteBrowser', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/remoteBrowser')>()),
  readBrowserTabs: () => readBrowserTabs(),
  actOnBrowserTab: (a: string, id?: string) => actOnBrowserTab(a, id),
}))
vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}))

const { TabStrip } = await import('./TabStrip')
const SPEC = await import('@/spec/browser-tab-strip.gen')
;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
let visibility: DocumentVisibilityState = 'visible'

beforeEach(() => {
  vi.useFakeTimers()
  readBrowserTabs.mockClear()
  readBrowserTabs.mockImplementation(async () => TWO)
  actOnBrowserTab.mockClear()
  actOnBrowserTab.mockImplementation(async () => TWO)
  visibility = 'visible'
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

async function mount(live = true) {
  await act(async () => {
    root.render(<TabStrip live={live} />)
  })
  await act(async () => {})
}

const picks = () => [
  ...host.querySelectorAll<HTMLButtonElement>('.tab-strip__pick'),
]

describe('TabStrip above the live picture', () => {
  it('lists the tabs and marks the one in front', async () => {
    await mount()
    expect(picks().map(b => b.textContent)).toEqual([
      'Inboxmail.example.com',
      'Docsdocs.example.org',
    ])
    const active = host.querySelector('.tab-strip__tab.is-active')
    expect(active?.textContent).toContain('Docs')
    expect(picks()[1].getAttribute('aria-selected')).toBe('true')
    expect(picks()[0].getAttribute('aria-selected')).toBe('false')
  })

  it('one tap switches, "+" opens, "x" closes', async () => {
    await mount()
    await act(async () => picks()[0].click())
    expect(actOnBrowserTab).toHaveBeenLastCalledWith('activate', 'A')
    await act(async () =>
      host.querySelector<HTMLButtonElement>('.tab-strip__new')!.click()
    )
    expect(actOnBrowserTab).toHaveBeenLastCalledWith('new', undefined)
    await act(async () =>
      host.querySelectorAll<HTMLButtonElement>('.tab-strip__close')[1].click()
    )
    expect(actOnBrowserTab).toHaveBeenLastCalledWith('close', 'B')
  })

  it('offers no "x" on the last tab', async () => {
    readBrowserTabs.mockImplementation(async () => [TWO[1]])
    await mount()
    expect(picks()).toHaveLength(1)
    expect(host.querySelector('.tab-strip__close')).toBeNull()
  })

  it('says so when the browser refuses', async () => {
    actOnBrowserTab.mockImplementation(async () => null)
    await mount()
    await act(async () => picks()[0].click())
    expect(host.querySelector('.tab-strip__refused')?.textContent).toBe(
      'browser.tabs.refused'
    )
  })

  it('reads every POLL_MS while visible, and not while hidden', async () => {
    await mount()
    expect(readBrowserTabs).toHaveBeenCalledTimes(1)
    await act(async () => {
      vi.advanceTimersByTime(SPEC.POLL_MS)
    })
    expect(readBrowserTabs).toHaveBeenCalledTimes(2)
    visibility = 'hidden'
    await act(async () => {
      vi.advanceTimersByTime(SPEC.POLL_MS * 3)
    })
    expect(readBrowserTabs).toHaveBeenCalledTimes(2)
  })

  it('shows nothing and reads nothing without a live browser', async () => {
    await mount(false)
    expect(host.querySelector('.tab-strip')).toBeNull()
    await act(async () => {
      vi.advanceTimersByTime(SPEC.POLL_MS * 2)
    })
    expect(readBrowserTabs).not.toHaveBeenCalled()
  })
})
