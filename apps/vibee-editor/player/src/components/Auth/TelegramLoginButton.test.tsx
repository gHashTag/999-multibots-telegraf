import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}))
vi.mock('@/lib/telegram', () => ({ isTelegram: () => false }))

import { TelegramLoginButton } from './TelegramLoginButton'

describe('TelegramLoginButton auth identity', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.stubEnv('MODE', 'production')
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('opens the configured @t27ai_bot deep link', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    await act(async () => root.render(<TelegramLoginButton showFallback />))

    host.querySelector<HTMLButtonElement>('button')!.click()

    expect(open).toHaveBeenCalledWith(
      'https://t.me/t27ai_bot?start=login',
      '_blank',
      'noopener,noreferrer'
    )
  })

  it('sets the same bot username on the native Telegram widget', async () => {
    await act(async () =>
      root.render(<TelegramLoginButton showFallback={false} />)
    )

    expect(
      host
        .querySelector<HTMLScriptElement>('script')
        ?.getAttribute('data-telegram-login')
    ).toBe('t27ai_bot')
  })

  it('does not store web-widget data as a server-verified profile', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    await act(async () =>
      root.render(<TelegramLoginButton showFallback={false} />)
    )

    await act(async () => {
      window.onTelegramAuth!({
        id: 999,
        first_name: 'Unexchanged',
        auth_date: Math.floor(Date.now() / 1000),
        hash: 'widget-signature-is-not-init-data',
      })
    })

    expect(open).toHaveBeenCalledWith(
      'https://t.me/t27ai_bot?start=login',
      '_blank',
      'noopener,noreferrer'
    )
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      '@t27ai_bot'
    )
  })
})
