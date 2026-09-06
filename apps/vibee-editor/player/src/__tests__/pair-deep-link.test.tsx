import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Provider, createStore } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * ПУТЬ, КОТОРЫЙ БОТ РЕКЛАМИРУЕТ, ДОЛЖЕН ВЕСТИ ТУДА, ЧТО ОН ОБЕЩАЕТ.
 *
 * Найдено 07.09.2026.
 *
 * Команда `/app` пишет человеку: «Нажмите кнопку — откроется окно с кодом».
 * Кнопка открывала мини-апп на `/profile`, профиль открывался на вкладке
 * «Шаблоны», а код входа живёт во вкладке «Агент» — о которой в сообщении нет
 * ни слова.
 *
 * То есть человек, пришедший ЗА КОДОМ по единственному рекламируемому пути,
 * кода не видел. Это тот же род дефекта, что «шесть цифр против восьми»:
 * обещание и поведение разошлись, и разошлись молча.
 */

vi.mock('@/config', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@/config')),
  API_BASE: 'https://api.example.test',
}))
vi.mock('@/lib/apiFetch', () => ({
  authHeaders: () => ({}),
  apiFetch: vi.fn(async () => ({ code: '12345678', expires_in: 120 })),
}))

import { ProfileRedirect } from '../App'
import { myProfileAtom, userAtom } from '@/atoms'

describe('переход на профиль сохраняет строку запроса', () => {
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
    window.history.replaceState({}, '', '/')
  })

  it('?tab=agent доживает до адреса профиля', async () => {
    /*
     * Переход, теряющий `?tab=`, снова высадил бы человека на «Шаблоны», и вся
     * правка стала бы косметикой. Проверяется САМ переход: MemoryRouter
     * записывает, куда он ведёт.
     */
    window.history.replaceState({}, '', '/profile?tab=agent')
    const store = createStore()
    store.set(userAtom, {
      id: 1,
      first_name: 'Т',
      username: 'кто-то',
      auth_date: 1,
      hash: '',
      is_admin: false,
    } as never)
    store.set(myProfileAtom, null)

    let куда = ''
    root = createRoot(host)
    await act(async () => {
      root!.render(
        <Provider store={store}>
          <MemoryRouter initialEntries={['/profile?tab=agent']}>
            <ProfileRedirect />
            <ЗаписатьАдрес onПуть={п => (куда = п)} />
          </MemoryRouter>
        </Provider>
      )
    })
    expect(куда).toContain('tab=agent')
  })
})

import { useLocation } from 'react-router-dom'
function ЗаписатьАдрес({ onПуть }: { onПуть: (п: string) => void }) {
  const l = useLocation()
  onПуть(l.pathname + l.search)
  return null
}

describe('ссылка бота указывает на вкладку с кодом', () => {
  const ПРОВАЙДЕР = fs
    .readFileSync(
      path.join(__dirname, '..', 'components', 'Telegram', 'TelegramProvider.tsx'),
      'utf8'
    )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('start_param «pair» ведёт на вкладку агента, а не в профиль вообще', () => {
    expect(ПРОВАЙДЕР).toContain("pair: '/profile?tab=agent'")
    // Голый '/profile' высаживал на «Шаблоны» — именно это и чинится.
    expect(ПРОВАЙДЕР).not.toMatch(/pair: '\/profile',/)
  })
})

describe('вкладка берётся из адреса и сверяется со списком', () => {
  const ВКЛАДКИ = fs
    .readFileSync(
      path.join(__dirname, '..', 'components', 'Profile', 'ProfileTabs.tsx'),
      'utf8'
    )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('начальная вкладка читается из ?tab=', () => {
    expect(ВКЛАДКИ).toContain("searchParams.get('tab')")
  })

  it('чужое имя вкладки не проходит', () => {
    // Иначе строка из адреса открывала бы несуществующий раздел.
    expect(ВКЛАДКИ).toContain('ВСЕ_ВКЛАДКИ.includes(')
    expect(ВКЛАДКИ).toContain(": 'templates'")
  })
})
