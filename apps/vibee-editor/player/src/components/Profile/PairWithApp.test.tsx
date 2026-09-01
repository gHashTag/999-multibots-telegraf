import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.hoisted(() => vi.fn())

vi.mock('@/lib/apiFetch', () => ({ apiFetch }))
vi.mock('@/config', () => ({ API_BASE: 'https://api.example.test' }))

import { PairWithApp } from './PairWithApp'

describe('PairWithApp mobile pairing flow', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    apiFetch.mockReset()
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  it('puts the phone-login action before the explanatory steps', async () => {
    await act(async () => root.render(<PairWithApp />))

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

  it('explains where to enter the generated six digits', async () => {
    apiFetch.mockResolvedValue({ code: '123456', expires_in: 120 })
    await act(async () => root.render(<PairWithApp />))

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
})
