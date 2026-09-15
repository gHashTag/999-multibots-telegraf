import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `ready` MEANS THE SCREEN RENDERED, AND A BROKEN SCREEN SAYS SO.
 *
 * The game treats the app's first message as proof the TRI frame works. It
 * used to be posted when the shell committed, before the lazy page chunk had
 * loaded, so a page that then threw into the ErrorBoundary still said
 * `ready`. The real App is mounted here with its Telegram and tab-bar parts
 * stubbed: `ready` must wait for the lazy page, and a page that throws must
 * post an error instead.
 */

const embed = vi.hoisted(() => {
  let release: () => void = () => {}
  const released = new Promise<void>(resolve => {
    release = resolve
  })
  return { posts: [] as string[][], release: () => release(), released }
})

vi.mock('@/lib/embed', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@/lib/embed')),
  IS_EMBED: true,
  embedLang: () => 'en',
  postToParent: (kind: string, path: string) => {
    embed.posts.push([kind, path])
  },
  postErrorToParent: (code: string) => {
    embed.posts.push(['error', code])
  },
}))
// The feed chunk arrives only when the test lets it.
vi.mock('@/pages/Feed', async () => {
  await embed.released
  return { default: () => <p>FEED_PAGE_SENTINEL</p> }
})
vi.mock('@/pages/Blog', () => ({
  default: () => {
    throw new Error('the page broke (test)')
  },
}))
vi.mock('@/providers/TamaguiProvider', () => ({
  TamaguiProvider: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('@/components/Telegram/TelegramProvider', () => ({
  TelegramProvider: () => null,
}))
vi.mock('@/components/Navigation/TelegramTabBar', () => ({
  TelegramTabBar: () => null,
}))
vi.mock('@/components/Navigation/ReturnToGame', () => ({
  ReturnToGame: () => null,
}))
vi.mock('@/components/Toast/Toast', () => ({ ToastContainer: () => null }))
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

import App from '../App'
import { ErrorBoundary } from '@/components/ErrorBoundary'

let host: HTMLDivElement
let root: Root

const tick = (ms: number) =>
  act(async () => {
    await new Promise(r => setTimeout(r, ms))
  })

beforeEach(() => {
  embed.posts = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.restoreAllMocks()
})

async function mount(path: string) {
  window.history.replaceState({}, '', path)
  await act(async () => {
    root.render(<App />)
  })
}

describe('the TRI frame hears ready only when the screen rendered', () => {
  it('nothing while the page chunk loads, ready once it rendered', async () => {
    await mount('/feed')
    await tick(60)
    expect(host.textContent).not.toContain('FEED_PAGE_SENTINEL')
    expect(embed.posts).toEqual([])

    embed.release()
    for (let i = 0; i < 30 && !host.textContent?.includes('FEED'); i++) {
      await tick(10)
    }
    expect(host.textContent).toContain('FEED_PAGE_SENTINEL')
    expect(embed.posts).toEqual([['ready', '/feed']])
  })

  it('a page that throws posts error boundary and never ready', async () => {
    await mount('/blog')
    for (let i = 0; i < 30 && !host.textContent?.includes('wrong'); i++) {
      await tick(10)
    }
    expect(host.textContent).toContain('Something went wrong')
    expect(embed.posts).toEqual([['error', 'boundary']])
  })

  it('control: a boundary with its own fallback (one panel) posts nothing', async () => {
    const Broken = () => {
      throw new Error('one panel broke (test)')
    }
    await act(async () => {
      root.render(
        <ErrorBoundary fallback={<p>PANEL_FALLBACK</p>}>
          <Broken />
        </ErrorBoundary>
      )
    })
    expect(host.textContent).toContain('PANEL_FALLBACK')
    expect(embed.posts).toEqual([])
  })
})
