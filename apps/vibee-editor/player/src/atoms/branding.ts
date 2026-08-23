import { atom } from 'jotai'
import { RENDER_URL } from '../config'
import { apiFetch } from '../lib/apiFetch'

/**
 * White label: шапка носит имя и аватар ТОГО бота, из которого открыли
 * приложение.
 *
 * Приложение продаётся вместе с ботами, поэтому «VIBEE» в шапке уместно только
 * на открытом вебе. Внутри мини-аппа там должен стоять бренд владельца бота.
 *
 * Какой это бот, честно знает только подпись initData — она сделана токеном
 * именно того бота. Поэтому бренд запрашивается у сервера, а не берётся из
 * параметра ссылки: параметр подделает кто угодно, и чужой бот показал бы
 * себя под нашим именем (или наоборот).
 */

export interface Branding {
  branded: boolean
  title?: string
  username?: string
  /** Путь у рендер-сервера; прямая ссылка Telegram содержит токен бота. */
  avatarUrl?: string | null
}

export const brandingAtom = atom<Branding>({ branded: false })

export const loadBrandingAtom = atom(null, async (get, set) => {
  if (get(brandingAtom).branded) return
  try {
    const data = await apiFetch<Branding>(`${RENDER_URL}/branding`)
    if (data?.branded) {
      set(brandingAtom, {
        ...data,
        avatarUrl: data.avatarUrl ? `${RENDER_URL}${data.avatarUrl}` : null,
      })
    }
  } catch {
    // Бренд — украшение, а не функция: молча остаёмся на своём логотипе.
    // Ронять шапку из-за него нельзя.
  }
})
