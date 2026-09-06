import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Provider, createStore } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ВКЛАДКА «ПРОФИЛЬ» БЫЛА ТУПИКОМ С ЛОЖНОЙ ПРИЧИНОЙ.
 *
 * Найдено 07.09.2026 живым прогоном мини-аппа.
 *
 * Профиль открывается по адресу `/:username`, а имя бралось ровно из двух
 * мест: уже загруженного профиля и launch-данных Telegram. Ни одно не
 * гарантировано — у множества аккаунтов @имени нет вовсе, и Telegram кладёт
 * `username` в launch-данные не всегда.
 *
 * Человек попадал на экран «Профиль не открыть: подпись Telegram сюда не
 * пришла» — при живой подписи и полностью опознанном пользователе. Ложная
 * причина уводит искать не там: перезапускать мини-апп, проверять Telegram,
 * писать в поддержку о том, чего нет.
 *
 * Сервер имя знает — он синхронизирует его при входе. Один запрос по
 * `telegram_id` превращает тупик в рабочий экран.
 */

/*
 * Подделываем модуль ЧАСТИЧНО: App.tsx тянет за собой пол-приложения, и у
 * каждого свои экспорты из `@/config`. Полная подделка требует перечислить
 * их все и молча ломается на следующем добавленном.
 */
vi.mock('@/config', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@/config')),
  API_BASE: 'https://api.example.test',
}))
vi.mock('@/lib/apiFetch', () => ({ authHeaders: () => ({}) }))

import { ProfileRedirect } from '../App'
import { myProfileAtom, userAtom } from '@/atoms'

const пользователь = (username?: string) =>
  ({
    id: 144022504,
    first_name: 'Тест',
    username,
    auth_date: 1,
    hash: '',
    is_admin: false,
  }) as never

describe('переход на свой профиль', () => {
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
    vi.unstubAllGlobals()
  })

  const показать = async (username: string | undefined, ответСервера: unknown) => {
    const store = createStore()
    store.set(userAtom, пользователь(username))
    store.set(myProfileAtom, null)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        ответСервера === null
          ? new Response('', { status: 404 })
          : new Response(JSON.stringify(ответСервера), { status: 200 })
      )
    )
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <Provider store={store}>
          <MemoryRouter initialEntries={['/profile']}>
            <ProfileRedirect />
          </MemoryRouter>
        </Provider>
      )
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  it('имя из launch-данных: сервер не спрашивается вовсе', async () => {
    await показать('извест', { username: 'другое' })
    expect(fetch).not.toHaveBeenCalled()
    expect(host.textContent).not.toContain('Профиль не открыть')
  })

  it('имени нет — спрашиваем сервер и уходим на профиль', async () => {
    /*
     * ГЛАВНОЕ. Раньше здесь показывалось «подпись Telegram сюда не пришла»,
     * при том что подпись пришла и человек опознан.
     */
    await показать(undefined, { username: 't27_dev' })
    expect(fetch).toHaveBeenCalledTimes(1)
    const адрес = String(
      (fetch as never as { mock: { calls: unknown[][] } }).mock.calls[0][0]
    )
    expect(адрес).toContain('/api/users/id/144022504')
    expect(host.textContent).not.toContain('Профиль не открыть')
    expect(host.textContent).not.toContain('Профиль открывается по имени')
  })

  it('имени нет НИГДЕ — причина названа верно, и это не подпись', async () => {
    await показать(undefined, null)
    expect(host.textContent).toContain('Профиль открывается по имени')
    expect(host.textContent).not.toContain('подпись Telegram сюда не пришла')
  })

  it('пока спрашиваем — молчим, а не мигаем отказом', async () => {
    /*
     * Показать «профиль не открыть» и через миг увести на профиль — значит
     * мигнуть человеку неправдой. Заметно и запоминается именно оно.
     */
    const store = createStore()
    store.set(userAtom, пользователь(undefined))
    store.set(myProfileAtom, null)
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <Provider store={store}>
          <MemoryRouter initialEntries={['/profile']}>
            <ProfileRedirect />
          </MemoryRouter>
        </Provider>
      )
    })
    expect(host.textContent).toBe('')
  })
})
