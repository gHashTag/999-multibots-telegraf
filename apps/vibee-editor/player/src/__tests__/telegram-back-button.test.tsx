/**
 * The native BackButton follows the route: shown where history has something
 * behind the screen, hidden on a first screen. /welcome is reached by a
 * `replace` redirect on a first launch, so a Back there led nowhere.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

const back = {
  show: vi.fn(),
  hide: vi.fn(),
  onClick: vi.fn(),
  offClick: vi.fn(),
}

vi.mock('@/lib/telegram', () => ({
  // Every WebApp method the init effect touches is a harmless no-op.
  getWebApp: () =>
    new Proxy(
      { BackButton: back, platform: 'ios' } as Record<string, unknown>,
      {
        get: (target, key: string) => (key in target ? target[key] : () => {}),
      }
    ),
  isTelegram: () => true,
  isVersionAtLeast: () => false,
}))

import { useTelegramWebApp } from '@/hooks/useTelegramWebApp'

function Probe() {
  useTelegramWebApp()
  return null
}

describe('the Telegram BackButton', () => {
  let host: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    vi.clearAllMocks()
    host = document.createElement('div')
    document.body.appendChild(host)
  })

  afterEach(() => {
    act(() => root?.unmount())
    root = null
    host.remove()
  })

  async function at(path: string) {
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={[path]}>
          <Probe />
        </MemoryRouter>
      )
    })
  }

  for (const first of ['/', '/feed', '/welcome']) {
    it(`is hidden on the first screen ${first}`, async () => {
      await at(first)
      expect(back.hide).toHaveBeenCalled()
      expect(back.show).not.toHaveBeenCalled()
    })
  }

  it('is shown on a screen with somewhere to go back to', async () => {
    await at('/agents')
    expect(back.show).toHaveBeenCalled()
  })
})
