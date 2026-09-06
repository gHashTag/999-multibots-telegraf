import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Provider, createStore } from 'jotai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.hoisted(() => vi.fn())

/**
 * Запуск Telegram подделывается на уровне модуля-предиката, а не окна: под
 * jsdom `window.Telegram` отсутствует, поэтому НАСТОЯЩИЙ hasVerifiableInitData()
 * вернул бы false и каждый сценарий ниже упирался бы в объяснение вместо
 * кнопки. `getTelegramUser` перечислен потому, что его импортирует
 * atoms/telegramAuth: у мока ESM-модуля нет «остальных» экспортов.
 */
const telegram = vi.hoisted(() => ({ signed: true, inTelegram: true }))

vi.mock('@/lib/apiFetch', () => ({ apiFetch }))
vi.mock('@/config', () => ({ API_BASE: 'https://api.example.test' }))
vi.mock('@/lib/telegram', () => ({
  hasVerifiableInitData: () => telegram.signed,
  isTelegram: () => telegram.inTelegram,
  getTelegramUser: () => null,
}))

import { PairWithApp } from './PairWithApp'

describe('PairWithApp mobile pairing flow', () => {
  let host: HTMLDivElement
  let root: Root | null

  /**
   * Свой стор на каждый тест: `canAuthorizeRequestsAtom` — производный атом без
   * зависимостей, его значение вычисляется один раз и кэшируется в сторе. На
   * общем сторе первый прочитанный вариант подписи застыл бы для всего файла.
   */
  const mount = () => (
    <Provider store={createStore()}>
      <PairWithApp />
    </Provider>
  )

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    apiFetch.mockReset()
    telegram.signed = true
    telegram.inTelegram = true
  })

  afterEach(async () => {
    if (root) await act(async () => root?.unmount())
    root = null
    host.remove()
    vi.useRealTimers()
  })

  it('puts the phone-login action before the explanatory steps', async () => {
    await act(async () => root?.render(mount()))

    expect(host.querySelector('h3')?.textContent).toBe(
      'Войти в приложение на телефоне'
    )

    const action = host.querySelector<HTMLButtonElement>(
      '.pair-with-app__action'
    )
    const steps = host.querySelector('.pair-with-app__steps')

    expect(action?.textContent).toBe('Показать код для входа')
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

  it('называет столько цифр, сколько их в самом коде', async () => {
    apiFetch.mockResolvedValue({ code: '12345678', expires_in: 120 })
    await act(async () => root?.render(mount()))

    await act(async () => {
      host.querySelector<HTMLButtonElement>('.pair-with-app__action')?.click()
    })

    expect(host.querySelector('.pair-with-app__code')?.textContent).toContain(
      '1234 5678'
    )
    expect(
      host.querySelector('.pair-with-app__instructions')?.textContent
    ).toContain('Введите эти 8 цифр в Trinity S³AI на телефоне')
    expect(host.textContent).toContain('Осталось 2:00')
  })

  it('keeps focus on the stable action and announces the new code once', async () => {
    apiFetch.mockResolvedValue({ code: '12345678', expires_in: 120 })
    await act(async () => root?.render(mount()))

    const action = host.querySelector<HTMLButtonElement>(
      '.pair-with-app__action'
    )
    action?.focus()
    await act(async () => action?.click())

    const status = host.querySelector('[role="status"][aria-live="polite"]')
    const timer = host.querySelector('.pair-with-app__timer')

    expect(document.activeElement).toBe(action)
    expect(action?.type).toBe('button')
    expect(status?.textContent).toContain('1234 5678')
    expect(status?.textContent).toContain('Введите эти 8 цифр')
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
    await act(async () => root?.render(mount()))

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
      resolveRequest?.({ code: '87654321', expires_in: 120 })
      await Promise.resolve()
    })

    expect(document.activeElement).toBe(action)
    expect(action?.getAttribute('aria-disabled')).toBe('false')
    expect(action?.getAttribute('aria-busy')).toBe('false')
    expect(host.textContent).toContain('8765 4321')
  })

  it('expires against the absolute deadline after a background clock jump', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T09:00:00.000Z'))
    apiFetch.mockResolvedValue({ code: '12345678', expires_in: 120 })
    await act(async () => root?.render(mount()))

    await act(async () => {
      host.querySelector<HTMLButtonElement>('.pair-with-app__action')?.click()
    })
    expect(host.textContent).toContain('1234 5678')

    vi.setSystemTime(new Date('2026-09-01T09:02:01.000Z'))
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(host.querySelector('.pair-with-app__code')).toBeNull()
    expect(host.textContent).toContain('Показать код для входа')
  })

  it('expires normally when the absolute deadline is reached', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T09:00:00.000Z'))
    apiFetch.mockResolvedValue({ code: '12345678', expires_in: 2 })
    await act(async () => root?.render(mount()))

    await act(async () => {
      host.querySelector<HTMLButtonElement>('.pair-with-app__action')?.click()
    })
    expect(host.textContent).toContain('Осталось 0:02')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    expect(host.querySelector('.pair-with-app__code')).toBeNull()
    expect(host.textContent).toContain('Показать код для входа')
  })

  it('uses a fresh absolute deadline when replacing a code', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T09:00:00.000Z'))
    apiFetch
      .mockResolvedValueOnce({ code: '11111111', expires_in: 120 })
      .mockResolvedValueOnce({ code: '22222222', expires_in: 120 })
    await act(async () => root?.render(mount()))

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

    expect(host.textContent).toContain('2222 2222')
    expect(host.textContent).toContain('Осталось 1:29')
  })

  it('cleans the deadline timer and listeners on unmount', async () => {
    vi.useFakeTimers()
    apiFetch.mockResolvedValue({ code: '12345678', expires_in: 120 })
    await act(async () => root?.render(mount()))
    await act(async () => {
      host.querySelector<HTMLButtonElement>('.pair-with-app__action')?.click()
    })

    expect(vi.getTimerCount()).toBeGreaterThan(0)
    await act(async () => root?.unmount())
    root = null
    expect(vi.getTimerCount()).toBe(0)
  })

  it('hides the action on an unsigned launch inside Telegram and routes to /app', async () => {
    telegram.signed = false
    telegram.inTelegram = true
    await act(async () => root?.render(mount()))

    expect(host.querySelector('.pair-with-app__action')).toBeNull()
    expect(apiFetch).not.toHaveBeenCalled()
    expect(host.querySelector('h3')?.textContent).toBe(
      'Войти в приложение на телефоне'
    )
    expect(
      host.querySelector('.pair-with-app__unavailable')?.textContent
    ).toContain('не несёт подписи Telegram')
    expect(host.querySelector('.pair-with-app__steps')?.textContent).toContain(
      '/app'
    )
  })

  it('hides the action on the open web and says where the code comes from', async () => {
    telegram.signed = false
    telegram.inTelegram = false
    await act(async () => root?.render(mount()))

    expect(host.querySelector('.pair-with-app__action')).toBeNull()
    expect(apiFetch).not.toHaveBeenCalled()
    expect(
      host.querySelector('.pair-with-app__unavailable')?.textContent
    ).toContain('только внутри Telegram')
    expect(host.querySelector('.pair-with-app__steps')?.textContent).toContain(
      '/app'
    )
  })
})
