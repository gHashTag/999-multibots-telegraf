/**
 * THE FALLBACK SIGN-IN LINK OPENS A SCREEN INSIDE TELEGRAM, NOT A BARE CHAT.
 *
 * It was `t.me/<bot>?startapp=profile`. None of our bots has a Main Mini App
 * (getMe has_main_web_app=false, measured 2026-09-22), and for such a bot
 * Telegram opens the chat and drops the parameter: the person landed in a
 * chat with nothing to press. `?start=app_profile` opens the chat too, and
 * the bot answers it with one web_app button to the profile (the bot's
 * src/navigation/helpers/appLinks.ts).
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Provider, createStore } from 'jotai'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TelegramLoginButton } from '../TelegramLoginButton'

let root: Root | null = null
let host: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  vi.restoreAllMocks()
})

describe('TelegramLoginButton fallback', () => {
  it('opens t.me/<bot>?start=app_profile, never ?startapp=', () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    act(() =>
      root!.render(
        <Provider store={createStore()}>
          <TelegramLoginButton botUsername="example_farm_bot" showFallback />
        </Provider>
      )
    )
    const button = host.querySelector('button')
    expect(button).not.toBeNull()
    act(() => button!.click())
    expect(open).toHaveBeenCalledTimes(1)
    expect(open.mock.calls[0][0]).toBe(
      'https://t.me/example_farm_bot?start=app_profile'
    )
  })
})
