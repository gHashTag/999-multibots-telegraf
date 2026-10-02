import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { getDefaultStore } from 'jotai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HiveKey, HiveKeyAccount } from '@/lib/hiveKeys'

const api = vi.hoisted(() => vi.fn())
// Provider catalogs load on their own once the account is shown; they answer
// here so the account calls keep their order in `api`.
const catalogApi = vi.hoisted(() => vi.fn())
vi.mock('@/lib/apiFetch', () => ({
  apiFetch: (url: string, init?: RequestInit) =>
    url.includes('/api/hive/keys/models/')
      ? catalogApi(url, init)
      : api(url, init),
}))
vi.mock('@/config', () => ({ API_BASE: 'https://render.example.test' }))
vi.mock('@/atoms', async () => {
  const { atom } = await import('jotai')
  return {
    userAtom: atom<{ id: number } | null>({ id: 41 }),
    openLoginAtom: atom(null, () => {}),
    myProfileAtom: atom(null),
  }
})
vi.mock('@/hooks/useLanguage', async () => {
  const { translations } = await import('@/atoms/language')
  return {
    useLanguage: () => ({
      lang: 'ru',
      t: (key: string, args?: Record<string, unknown>) =>
        Object.entries(args ?? {}).reduce(
          (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
          translations.ru[key] ?? key
        ),
    }),
  }
})

import HiveAccount from './HiveAccount'
import { userAtom } from '@/atoms'
import { HiveAccountLink } from '@/components/Profile/HiveAccountLink'
import { TelegramTabBar } from '@/components/Navigation/TelegramTabBar'
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const contribution = { xp: 412, accepted: 2, specs: 1, finished: 5, hours: 1.2 }
const makeKey = (
  id: number,
  status: HiveKey['lastProbe']['status'] = 'not_checked'
): HiveKey => ({
  id,
  provider: id > 0 ? 'nvidia' : 'zai',
  label: `Key ${id}`,
  fingerprint: 'aa11bb22cc33',
  model: 'test-model',
  enabled: true,
  source: id > 0 ? 'environment' : 'managed',
  createdAt: null,
  lastProbe: {
    status,
    checkedAt: status === 'not_checked' ? null : '2026-10-01T13:00:00Z',
    latencyMs: null,
  },
  contribution,
})
const makeAccount = (): HiveKeyAccount => ({
  keys: [makeKey(4), makeKey(-7)],
  providers: [
    { id: 'nvidia', label: 'NVIDIA', model: 'test-model' },
    { id: 'zai', label: 'Z.AI', model: 'test-model' },
  ],
  attribution: { subject: 'telegram:41', github: 'dmitrii-f-t27' },
  contribution,
  scoring: { acceptedXp: 100, specXp: 200, hourXp: 10 },
})
let container: HTMLDivElement
let root: Root

beforeEach(() => {
  api.mockReset()
  catalogApi.mockReset()
  catalogApi.mockImplementation(async (url: string) => ({
    provider: url.endsWith('/zai') ? 'zai' : 'nvidia',
    model: 'test-model',
    models: ['test-model', 'z-ai/glm-5.3'],
  }))
  getDefaultStore().set(userAtom, { id: 41 } as never)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})
const mount = () =>
  act(async () =>
    root.render(
      <MemoryRouter>
        <HiveAccount />
      </MemoryRouter>
    )
  )
const button = (name: string) =>
  [...container.querySelectorAll('button')].find(
    node => node.textContent === name
  )!

describe('personal contribution account', () => {
  it('shows verified attribution and server work totals without computing wallet tokens', async () => {
    api.mockResolvedValue(makeAccount())
    await mount()
    expect(container.textContent).toContain('@dmitrii-f-t27')
    expect(container.textContent).toContain('412')
    expect(container.textContent).toContain(
      'Это игровые очки, а не платёжный баланс'
    )
    expect(container.querySelectorAll('[data-key-id]')).toHaveLength(2)
    expect(container.querySelector('input[name="github"]')).toBeNull()
    expect(container.querySelector('input[name="owner"]')).toBeNull()
    expect(api).toHaveBeenCalledWith(
      'https://render.example.test/api/hive/keys',
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'omit',
        signal: expect.any(AbortSignal),
      })
    )
  })

  it('submits only the selected provider, label and secret, then clears the password field', async () => {
    api
      .mockResolvedValueOnce(makeAccount())
      .mockResolvedValueOnce({ key: makeKey(-8) })
    await mount()
    const form = container.querySelector('form')!
    const secret = form.elements.namedItem('apiKey') as HTMLInputElement
    const label = form.elements.namedItem('label') as HTMLInputElement
    const provider = form.elements.namedItem('provider') as HTMLSelectElement
    secret.value = 'fixture-provider-secret-never-real'
    label.value = 'My second lane'
    provider.value = 'zai'
    const localBefore = JSON.stringify(localStorage)
    const sessionBefore = JSON.stringify(sessionStorage)
    await act(async () =>
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true })
      )
    )
    expect(JSON.parse(api.mock.calls[1][1].body)).toEqual({
      provider: 'zai',
      label: 'My second lane',
      apiKey: 'fixture-provider-secret-never-real',
    })
    expect(secret.value).toBe('')
    expect(container.innerHTML).not.toContain(
      'fixture-provider-secret-never-real'
    )
    expect(JSON.stringify(localStorage)).toBe(localBefore)
    expect(JSON.stringify(sessionStorage)).toBe(sessionBefore)
    expect(container.querySelectorAll('[data-key-id]')).toHaveLength(3)
  })

  it('checks every key including managed negative IDs and renders mixed provider results', async () => {
    api
      .mockResolvedValueOnce(makeAccount())
      .mockResolvedValueOnce({ key: makeKey(4, 'ok') })
      .mockResolvedValueOnce({ key: makeKey(-7, 'rate_limited') })
    await mount()
    await act(async () => button('Проверить все ключи').click())
    expect(api.mock.calls.slice(1).map(call => call[0])).toEqual([
      'https://render.example.test/api/hive/keys/4/probe',
      'https://render.example.test/api/hive/keys/-7/probe',
    ])
    expect(container.querySelector('[data-key-id="4"]')?.textContent).toContain(
      'Модель ответила'
    )
    expect(
      container.querySelector('[data-key-id="-7"]')?.textContent
    ).toContain('Лимит запросов или квоты')
  })

  it('disables the chosen key and offers enable only after the server confirms', async () => {
    api
      .mockResolvedValueOnce(makeAccount())
      .mockResolvedValueOnce({ key: { ...makeKey(-7), enabled: false } })
    await mount()
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Отключить: Key -7"]')!
        .click()
    )
    expect(api.mock.calls[1][0]).toBe(
      'https://render.example.test/api/hive/keys/-7/disable'
    )
    expect(
      container.querySelector('[aria-label="Включить: Key -7"]')
    ).not.toBeNull()
    expect(
      container.querySelector('[aria-label="Отключить: Key 4"]')
    ).not.toBeNull()
  })

  it('shows setup failures with a recovery action and never reflects upstream secrets', async () => {
    api.mockRejectedValue({
      status: 503,
      message: 'fixture-leaked-secret',
      detail: 'fixture-leaked-secret',
      code: 'fixture-leaked-secret',
    })
    await mount()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Оператору нужно настроить связь с Королевой'
    )
    expect(container.textContent).not.toContain('fixture-leaked-secret')
    expect(container.querySelector('form')).toBeNull()
    expect(button('Повторить')).toBeTruthy()
  })

  it('clears a submitted secret on rejection and only shows a local error', async () => {
    api.mockResolvedValueOnce(makeAccount()).mockRejectedValueOnce({
      status: 400,
      message: 'fixture-provider-secret-never-real',
    })
    await mount()
    const form = container.querySelector('form')!
    const secret = form.elements.namedItem('apiKey') as HTMLInputElement
    secret.value = 'fixture-provider-secret-never-real'
    await act(async () =>
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true })
      )
    )
    expect(secret.value).toBe('')
    expect(container.textContent).toContain('Ключ не удалось сохранить')
    expect(container.textContent).not.toContain(
      'fixture-provider-secret-never-real'
    )
  })

  it('hides the previous owner on a session change and ignores a late reply', async () => {
    let finishOld!: (value: { key: HiveKey }) => void
    api
      .mockResolvedValueOnce(makeAccount())
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            finishOld = resolve
          })
      )
      .mockRejectedValueOnce({ status: 401 })
    await mount()
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Проверить API: Key 4"]'
        )!
        .click()
    )
    await act(async () => getDefaultStore().set(userAtom, null))
    await act(async () => finishOld({ key: makeKey(4, 'ok') }))
    expect(container.textContent).not.toContain('@dmitrii-f-t27')
    expect(container.querySelectorAll('[data-key-id]')).toHaveLength(0)
    expect(button('Войти')).toBeTruthy()
  })

  it('offers the provider catalog in a dropdown at the top and switches every key through the server check', async () => {
    const switched = makeAccount()
    switched.keys = [{ ...makeKey(4), model: 'z-ai/glm-5.3' }, makeKey(-7)]
    switched.providers[0] = {
      ...switched.providers[0],
      model: 'z-ai/glm-5.3',
      defaultModel: 'test-model',
    }
    api.mockResolvedValueOnce(makeAccount()).mockResolvedValueOnce(switched)
    await mount()
    expect(catalogApi.mock.calls.map(call => call[0])).toEqual([
      'https://render.example.test/api/hive/keys/models/nvidia',
      'https://render.example.test/api/hive/keys/models/zai',
    ])
    const sections = [...container.querySelectorAll('main > section')]
    expect(sections[0].className).toBe('hive-account__models')
    const row = container.querySelector('[data-provider="nvidia"]')!
    const select = row.querySelector('select')!
    const apply = row.querySelector('button')!
    expect([...select.options].map(option => option.value)).toEqual([
      'test-model',
      'z-ai/glm-5.3',
    ])
    expect(select.value).toBe('test-model')
    expect(apply.disabled).toBe(true)
    await act(async () => {
      select.value = 'z-ai/glm-5.3'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(apply.disabled).toBe(false)
    await act(async () => apply.click())
    expect(api.mock.calls[1][0]).toBe(
      'https://render.example.test/api/hive/keys/model'
    )
    expect(JSON.parse(api.mock.calls[1][1].body)).toEqual({
      provider: 'nvidia',
      model: 'z-ai/glm-5.3',
    })
    expect(container.querySelector('[data-key-id="4"]')?.textContent).toContain(
      'z-ai/glm-5.3'
    )
    expect(container.textContent).toContain(
      'Теперь z-ai/glm-5.3 работает на всех ключах этого провайдера (1)'
    )
    expect(
      container.querySelector('[data-provider="nvidia"]')?.textContent
    ).toContain('По умолчанию: test-model')
  })

  it('keeps the current model selectable when the catalog does not load', async () => {
    catalogApi.mockRejectedValue({ status: 502 })
    api.mockResolvedValueOnce(makeAccount())
    await mount()
    const row = container.querySelector('[data-provider="zai"]')!
    expect(
      [...row.querySelectorAll('option')].map(option => option.value)
    ).toEqual(['test-model'])
    expect(row.textContent).toContain('Список моделей провайдера не загрузился')
  })

  it('offers the switch when only some keys of a provider run another model', async () => {
    const mixed = makeAccount()
    mixed.keys = [makeKey(4), { ...makeKey(5), model: 'older-model' }]
    api.mockResolvedValueOnce(mixed)
    await mount()
    const row = container.querySelector('[data-provider="nvidia"]')!
    expect(row.querySelector('select')!.value).toBe('test-model')
    expect(row.querySelector('button')!.disabled).toBe(false)
    expect(row.textContent).toContain('Применить ко всем (2)')
  })

  it('names a failed model check and changes nothing', async () => {
    api
      .mockResolvedValueOnce(makeAccount())
      .mockRejectedValueOnce({ status: 422, code: 'model_without_tools' })
    await mount()
    const row = container.querySelector('[data-provider="zai"]')!
    const select = row.querySelector('select')!
    await act(async () => {
      select.value = 'z-ai/glm-5.3'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => row.querySelector('button')!.click())
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'не вызвала инструмент'
    )
    expect(
      container.querySelector('[data-key-id="-7"]')?.textContent
    ).toContain('test-model')
  })

  it('keeps checking the other keys when one cannot be checked now', async () => {
    api
      .mockResolvedValueOnce(makeAccount())
      .mockRejectedValueOnce({ status: 429 })
      .mockResolvedValueOnce({ key: makeKey(-7, 'ok') })
    await mount()
    await act(async () => button('Проверить все ключи').click())
    expect(
      container.querySelector('[data-key-id="-7"]')?.textContent
    ).toContain('Модель ответила')
    expect(container.textContent).toContain('Проверено 1 из 2. 1 сейчас')
  })

  it('offers the profile entry only on the own profile without requiring club state', async () => {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <HiveAccountLink isOwn />
        </MemoryRouter>
      )
    )
    expect(container.querySelector('a')?.getAttribute('href')).toBe(
      '/game/account'
    )
    await act(async () =>
      root.render(
        <MemoryRouter>
          <HiveAccountLink isOwn={false} />
        </MemoryRouter>
      )
    )
    expect(container.querySelector('a')).toBeNull()
  })

  it('keeps a reachable account door in the game navigation without an overlay', async () => {
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={['/game/roadmap']}>
          <TelegramTabBar />
        </MemoryRouter>
      )
    )
    expect(
      container.querySelector('nav a[href="/game/account"]')?.textContent
    ).toContain('Ключи и XP')
    expect(
      container
        .querySelector('a[href="/game/account"]')
        ?.getAttribute('aria-current')
    ).toBeNull()
  })

  it('does not add the game account shortcut to unrelated app screens', async () => {
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={['/feed']}>
          <TelegramTabBar />
        </MemoryRouter>
      )
    )
    expect(container.querySelector('a[href="/game/account"]')).toBeNull()
  })
})
