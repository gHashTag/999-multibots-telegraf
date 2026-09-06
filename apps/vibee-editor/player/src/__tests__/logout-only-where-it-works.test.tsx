import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * «ВЫЙТИ» ВНУТРИ TELEGRAM БЫЛО КНОПКОЙ, КОТОРАЯ НЕ МОГЛА СРАБОТАТЬ.
 *
 * Найдено живым прогоном мини-аппа 07.09.2026.
 *
 * Личность внутри мини-аппа даёт САМ ЗАПУСК Telegram, а `telegramAutoLoginAtom`
 * возвращает её при следующем же рендере. Нажатие чистило память — и через
 * доли секунды человек снова был опознан.
 *
 * Хуже, чем бездействие: замер показал противоречие. Шапка предлагала «Войти»,
 * `sessionStorage` уже содержал пользователя, а профиль отвечал «Пользователь
 * не найден». Человек видит три разных ответа на вопрос «я вошёл?».
 *
 * Выход осмыслен там, где вход был отдельным действием: в вебе, где есть
 * Bearer-сессия. Внутри Telegram выйти — значит закрыть мини-апп.
 */

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ t: (k: string) => k }),
}))

import { UserAvatar } from '../components/Auth/TelegramLoginButton'

const человек = {
  id: 1,
  first_name: 'Тест',
  username: 'test',
  auth_date: 1,
  hash: '',
  is_admin: false,
} as never

describe('выход показывается только там, где ему есть что закрыть', () => {
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

  const показать = (onLogout?: () => void) => {
    root = createRoot(host)
    act(() => {
      root!.render(
        <MemoryRouter>
          <UserAvatar user={человек} onLogout={onLogout} />
        </MemoryRouter>
      )
    })
  }

  it('есть сессия — кнопка есть', () => {
    показать(() => {})
    expect(host.querySelector('.logout-btn')).not.toBeNull()
  })

  it('сессии нет — кнопки НЕТ', () => {
    // Внутри Telegram сессии браузера не бывает: initData не обменивается на
    // неё ни одним клиентом. Значит и выходить не из чего.
    показать(undefined)
    expect(host.querySelector('.logout-btn')).toBeNull()
  })

  it('имя человека видно в обоих случаях — убрали выход, а не личность', () => {
    показать(undefined)
    expect(host.textContent).toContain('Тест')
  })
})

describe('шапка решает по сессии, а не по факту входа', () => {
  const КОД = fs
    .readFileSync(
      path.join(__dirname, '..', 'components', 'Header', 'Header.tsx'),
      'utf8'
    )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('выход передаётся только при Bearer-сессии', () => {
    expect(КОД).toContain('onLogout={getAppAccessToken() ? handleLogout : undefined}')
  })

  it('условие не выродилось в «всегда»', () => {
    // `onLogout={handleLogout}` вернуло бы кнопку внутрь Telegram молча.
    expect(КОД).not.toMatch(/onLogout=\{handleLogout\}/)
  })
})
