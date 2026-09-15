import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * SIGN OUT ON ALL DEVICES, FOR A WEB SESSION.
 *
 * POST /api/auth/logout-all ends every live family of the person (render
 * session-routes.ts). The player had no way to call it. The button is shown
 * only where a browser session exists and the app is not inside Telegram:
 * inside the Mini App the launch itself signs the person in again.
 */

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ t: (k: string) => k }),
}))
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

import { UserAvatar } from '../components/Auth/TelegramLoginButton'
import { canSignOutEverywhere, clearAppSession } from '../lib/appSession'

const person = {
  id: 1,
  first_name: 'Fake',
  username: 'fake',
  auth_date: 1,
  hash: '',
  is_admin: false,
} as never

describe('the avatar shows sign out on all devices only when given', () => {
  let host: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
  })
  afterEach(() => {
    act(() => root?.unmount())
    root = null
    host.remove()
  })

  const show = (onLogoutAll?: () => void) => {
    root = createRoot(host)
    act(() => {
      root!.render(
        <MemoryRouter>
          <UserAvatar
            user={person}
            onLogout={() => {}}
            onLogoutAll={onLogoutAll}
          />
        </MemoryRouter>
      )
    })
  }

  it('given: a button that calls it', () => {
    const all = vi.fn()
    show(all)
    const button = host.querySelector<HTMLButtonElement>('.logout-all-btn')
    expect(button).not.toBeNull()
    expect(button!.getAttribute('title')).toBe('auth.logoutAll')
    act(() => button!.click())
    expect(all).toHaveBeenCalledTimes(1)
  })

  it('not given: no such button, the single-tab logout stays', () => {
    show(undefined)
    expect(host.querySelector('.logout-all-btn')).toBeNull()
    expect(host.querySelector('.logout-btn')).not.toBeNull()
  })
})

describe('canSignOutEverywhere', () => {
  afterEach(() => {
    clearAppSession()
    delete (window as { Telegram?: unknown }).Telegram
  })

  it('no browser session: no', () => {
    expect(canSignOutEverywhere()).toBe(false)
  })

  it('a browser session on the open web: yes', () => {
    sessionStorage.setItem('trinity.app.session.access', 'fake-access-1')
    expect(canSignOutEverywhere()).toBe(true)
  })

  it('a session inside Telegram: no', () => {
    sessionStorage.setItem('trinity.app.session.access', 'fake-access-1')
    ;(window as { Telegram?: unknown }).Telegram = {
      WebApp: { platform: 'ios', initData: '' },
    }
    expect(canSignOutEverywhere()).toBe(false)
  })
})

describe('the header decides with canSignOutEverywhere', () => {
  const CODE = fs
    .readFileSync(
      path.join(__dirname, '..', 'components', 'Header', 'Header.tsx'),
      'utf8'
    )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    // Prettier breaks long JSX attributes over lines.
    .replace(/\s+/g, ' ')
    .replace(/\{ /g, '{')
    .replace(/ \}/g, '}')

  it('passes the action only when it may be used', () => {
    expect(CODE).toContain(
      'onLogoutAll={canSignOutEverywhere() ? handleLogoutAll : undefined}'
    )
    expect(CODE).not.toMatch(/onLogoutAll=\{handleLogoutAll\}/)
  })
})
