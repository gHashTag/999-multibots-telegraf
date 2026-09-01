import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.hoisted(() => vi.fn())
const getInitData = vi.hoisted(() => vi.fn(() => 'signed-init-data'))
const getAppAccessToken = vi.hoisted(() => vi.fn(() => ''))

vi.mock('@/lib/apiFetch', () => ({ apiFetch }))
vi.mock('@/lib/telegram', () => ({ getInitData }))
vi.mock('@/lib/appSession', () => ({ getAppAccessToken }))
vi.mock('@/config', () => ({ API_BASE: 'https://api.example.test' }))

import { PairWithApp } from './PairWithApp'

describe('PairWithApp mobile pairing flow', () => {
  let host: HTMLDivElement
  let root: Root | null

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    apiFetch.mockReset()
    getInitData.mockReturnValue('signed-init-data')
    getAppAccessToken.mockReturnValue('')
  })

  afterEach(async () => {
    if (root) await act(async () => root?.unmount())
    root = null
    host.remove()
    vi.useRealTimers()
  })

  it('puts the phone-login action before the explanatory steps', async () => {
    await act(async () => root?.render(<PairWithApp />))

    expect(host.querySelector('h3')?.textContent).toBe(
      'Войти в приложение на телефоне'
    )

    const action = host.querySelector<HTMLButtonElement>(
      '.pair-with-app__action'
    )
    const steps = host.querySelector('.pair-with-app__steps')

    expect(action?.textContent).toBe('Показать 6-значный код')
    expect(steps?.textContent).toContain('Откройте Trinity S³AI на телефоне')
    expect(
      action && steps
        ? Boolean(
            action.compareDocumentPosition(steps) &
              Node.DOCUMENT_POSITION_FOLLOWING
          )
        : false
    ).toBe(true)
  })

  it('shows a verified Telegram entry instead of sending an anonymous request', async () => {
    getInitData.mockReturnValue('')
    getAppAccessToken.mockReturnValue('')
    await act(async () => root?.render(<PairWithApp />))

    const link = host.querySelector<HTMLAnchorElement>(
      '.pair-with-app__telegram-link'
    )
    expect(link?.href).toBe('https://t.me/t27ai_bot?startapp=profile')
    expect(host.textContent).toContain('Нужен подтверждённый вход Telegram')
    expect(host.textContent).not.toContain('initData')
    expect(host.querySelector('.pair-with-app__action')).toBeNull()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('offers a public QR and deep link without credentials in the URL', async () => {
    await act(async () => root?.render(<PairWithApp />))

    const link = host.querySelector<HTMLAnchorElement>(
      '.pair-with-app__qr-link'
    )
    const qr = host.querySelector<SVGElement>('.pair-with-app__qr-code')
    const url = new URL(link?.href ?? 'https://invalid.test')

    expect(link?.href).toBe('https://t.me/t27ai_bot?startapp=profile')
    expect(url.searchParams.get('startapp')).toBe('profile')
    expect([...url.searchParams.keys()]).toEqual(['startapp'])
    expect(link?.href).not.toMatch(/code|token|session|initData/i)
    expect(qr?.getAttribute('aria-label')).toContain('Mini App @t27ai_bot')
    expect(qr?.getAttribute('data-payload')).toBeNull()
  })

  it('never places the generated pairing code into the QR or deep link', async () => {
    apiFetch.mockResolvedValue({ code: '123456', expires_in: 120 })
    await act(async () => root?.render(<PairWithApp />))

    await act(async () => {
      host.querySelector<HTMLButtonElement>('.pair-with-app__action')?.click()
    })

    const qrPanel = host.querySelector('.pair-with-app__qr')
    expect(qrPanel?.innerHTML).not.toContain('123456')
    expect(
      host.querySelector<HTMLAnchorElement>('.pair-with-app__qr-link')?.href
    ).toBe('https://t.me/t27ai_bot?startapp=profile')
  })

  it('replaces a rejected identity with guidance and hides raw initData errors', async () => {
    apiFetch.mockRejectedValue(
      Object.assign(new Error('empty initData'), { status: 401 })
    )
    await act(async () => root?.render(<PairWithApp />))

    await act(async () => {
      host.querySelector<HTMLButtonElement>('.pair-with-app__action')?.click()
    })

    expect(host.querySelector('.pair-with-app__telegram-link')).not.toBeNull()
    expect(host.textContent).not.toContain('empty initData')
  })

  it('explains where to enter the generated six digits', async () => {
    apiFetch.mockResolvedValue({ code: '123456', expires_in: 120 })
    await act(async () => root?.render(<PairWithApp />))

    await act(async () => {
      host.querySelector<HTMLButtonElement>('.pair-with-app__action')?.click()
    })

    expect(host.querySelector('.pair-with-app__code')?.textContent).toContain(
      '123 456'
    )
    expect(
      host.querySelector('.pair-with-app__instructions')?.textContent
    ).toContain('Введите эти 6 цифр в Trinity S³AI на телефоне')
    expect(host.textContent).toContain('Осталось 2:00')
  })

  it('keeps focus on the stable action and announces the new code once', async () => {
    apiFetch.mockResolvedValue({ code: '123456', expires_in: 120 })
    await act(async () => root?.render(<PairWithApp />))

    const action = host.querySelector<HTMLButtonElement>(
      '.pair-with-app__action'
    )
    action?.focus()
    await act(async () => action?.click())

    const status = host.querySelector('[role="status"][aria-live="polite"]')
    const timer = host.querySelector('.pair-with-app__timer')

    expect(document.activeElement).toBe(action)
    expect(action?.type).toBe('button')
    expect(status?.textContent).toContain('123 456')
    expect(status?.textContent).toContain('Введите эти 6 цифр')
    expect(status?.contains(timer)).toBe(false)
  })

  it('keeps focus during a pending request and ignores repeat activation', async () => {
    let resolveRequest:
      | ((value: { code: string; expires_in: number }) => void)
      | undefined
    apiFetch.mockReturnValue(
      new Promise(resolve => {
        resolveRequest = resolve
      })
    )
    await act(async () => root?.render(<PairWithApp />))

    const action = host.querySelector<HTMLButtonElement>(
      '.pair-with-app__action'
    )
    action?.focus()
    await act(async () => {
      action?.click()
      await Promise.resolve()
    })

    expect(document.activeElement).toBe(action)
    expect(action?.getAttribute('aria-disabled')).toBe('true')
    expect(action?.getAttribute('aria-busy')).toBe('true')
    await act(async () => action?.click())
    expect(apiFetch).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveRequest?.({ code: '654321', expires_in: 120 })
      await Promise.resolve()
    })

    expect(document.activeElement).toBe(action)
    expect(action?.getAttribute('aria-disabled')).toBe('false')
    expect(action?.getAttribute('aria-busy')).toBe('false')
    expect(host.textContent).toContain('654 321')
  })

  it('expires against the absolute deadline after a background clock jump', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T09:00:00.000Z'))
    apiFetch.mockResolvedValue({ code: '123456', expires_in: 120 })
    await act(async () => root?.render(<PairWithApp />))

    await act(async () => {
      host.querySelector<HTMLButtonElement>('.pair-with-app__action')?.click()
    })
    expect(host.textContent).toContain('123 456')

    vi.setSystemTime(new Date('2026-09-01T09:02:01.000Z'))
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(host.querySelector('.pair-with-app__code')).toBeNull()
    expect(host.textContent).toContain('Показать 6-значный код')
  })

  it('expires normally when the absolute deadline is reached', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T09:00:00.000Z'))
    apiFetch.mockResolvedValue({ code: '123456', expires_in: 2 })
    await act(async () => root?.render(<PairWithApp />))

    await act(async () => {
      host.querySelector<HTMLButtonElement>('.pair-with-app__action')?.click()
    })
    expect(host.textContent).toContain('Осталось 0:02')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    expect(host.querySelector('.pair-with-app__code')).toBeNull()
    expect(host.textContent).toContain('Показать 6-значный код')
  })

  it('uses a fresh absolute deadline when replacing a code', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T09:00:00.000Z'))
    apiFetch
      .mockResolvedValueOnce({ code: '111111', expires_in: 120 })
      .mockResolvedValueOnce({ code: '222222', expires_in: 120 })
    await act(async () => root?.render(<PairWithApp />))

    await act(async () => {
      host.querySelector<HTMLButtonElement>('.pair-with-app__action')?.click()
    })
    vi.setSystemTime(new Date('2026-09-01T09:01:30.000Z'))
    await act(async () => {
      host.querySelector<HTMLButtonElement>('.pair-with-app__action')?.click()
    })
    vi.setSystemTime(new Date('2026-09-01T09:02:01.000Z'))
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })

    expect(host.textContent).toContain('222 222')
    expect(host.textContent).toContain('Осталось 1:29')
  })

  it('cleans the deadline timer and listeners on unmount', async () => {
    vi.useFakeTimers()
    apiFetch.mockResolvedValue({ code: '123456', expires_in: 120 })
    await act(async () => root?.render(<PairWithApp />))
    await act(async () => {
      host.querySelector<HTMLButtonElement>('.pair-with-app__action')?.click()
    })

    expect(vi.getTimerCount()).toBeGreaterThan(0)
    await act(async () => root?.unmount())
    root = null
    expect(vi.getTimerCount()).toBe(0)
  })
})
