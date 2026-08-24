import { atom } from 'jotai'
import { userAtom } from './user'
import { RENDER_URL } from '../config'
import { getTelegramUser, getInitData } from '../lib/telegram'
import { getErrorMessage } from '../features/script/utils/errorMessages'
import { languageAtom } from './language'

// ===============================
// Профиль аватара: фото человека, от которого делается весь контент.
//
// Идея настройки: загрузил фото ОДИН раз — дальше липсинк и будущие
// генерации берут лицо отсюда. Это те же строки таблицы assets
// (type='avatar_photo'), что читает бот и агент (my_assets), поэтому
// «лицо человека» — не отдельная сущность, а файл с типом.
// ===============================

export interface AvatarPhoto {
  id: number
  url: string
  createdAt: string
}

export const avatarPhotosAtom = atom<AvatarPhoto[]>([])
export const avatarPhotosLoadingAtom = atom(false)
export const avatarPhotosErrorAtom = atom<string | null>(null)

function resolveTelegramId(user: { id?: number } | null): string | null {
  const fromTelegram = getTelegramUser()?.id
  if (fromTelegram) return String(fromTelegram)
  if (user?.id) return String(user.id)
  return null
}

/** Подпись + dev-ключ. В DEV на localhost подписи нет — тогда ключ агента
 *  из VITE_AGENT_KEY (в прод-сборку не попадает, см. Chat.tsx). */
function avatarHeaders(): Headers {
  const h = new Headers({ 'Content-Type': 'application/json' })
  const initData = getInitData()
  if (initData) {
    h.set('X-Telegram-Init-Data', initData)
    return h
  }
  const devKey = import.meta.env.DEV
    ? (import.meta.env.VITE_AGENT_KEY as string | undefined)
    : undefined
  if (devKey) h.set('X-Agent-Key', devKey)
  return h
}

export const loadAvatarPhotosAtom = atom(null, async (get, set) => {
  const telegramId = resolveTelegramId(get(userAtom))
  if (!telegramId) {
    set(avatarPhotosAtom, [])
    set(avatarPhotosErrorAtom, null)
    return
  }

  set(avatarPhotosLoadingAtom, true)
  set(avatarPhotosErrorAtom, null)
  try {
    const url = new URL(
      `${RENDER_URL}/api/assets/${encodeURIComponent(telegramId)}`
    )
    url.searchParams.set('type', 'avatar_photo')
    url.searchParams.set('limit', '50')

    const res = await fetch(url.toString(), { headers: avatarHeaders() })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status} — ${body.slice(0, 160) || 'no body'}`)
    }
    const data = await res.json()
    set(
      avatarPhotosAtom,
      (Array.isArray(data.assets) ? data.assets : []).map((a: any) => ({
        id: a.id,
        url: a.url,
        createdAt: a.createdAt,
      }))
    )
  } catch (e) {
    set(avatarPhotosErrorAtom, getErrorMessage(e, get(languageAtom)))
    set(avatarPhotosAtom, [])
  } finally {
    set(avatarPhotosLoadingAtom, false)
  }
})

/** Сохранить фото в профиль. Сервер сам знает, чей это профиль — по подписи. */
export const saveAvatarPhotoAtom = atom(
  null,
  async (get, set, url: string): Promise<boolean> => {
    set(avatarPhotosErrorAtom, null)
    try {
      const res = await fetch(`${RENDER_URL}/api/assets`, {
        method: 'POST',
        headers: avatarHeaders(),
        body: JSON.stringify({ url, type: 'avatar_photo' }),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(
          `HTTP ${res.status} — ${body.slice(0, 160) || 'no body'}`
        )
      }
      await set(loadAvatarPhotosAtom)
      return true
    } catch (e) {
      set(avatarPhotosErrorAtom, getErrorMessage(e, get(languageAtom)))
      return false
    }
  }
)

/** Убрать фото из профиля. Сервер удаляет только СВОИ avatar_photo —
 *  историю генераций этим путём не стереть. */
export const deleteAvatarPhotoAtom = atom(
  null,
  async (get, set, id: number): Promise<boolean> => {
    set(avatarPhotosErrorAtom, null)
    try {
      const res = await fetch(
        `${RENDER_URL}/api/assets?id=${encodeURIComponent(id)}`,
        { method: 'DELETE', headers: avatarHeaders() }
      )
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(
          `HTTP ${res.status} — ${body.slice(0, 160) || 'no body'}`
        )
      }
      await set(loadAvatarPhotosAtom)
      return true
    } catch (e) {
      set(avatarPhotosErrorAtom, getErrorMessage(e, get(languageAtom)))
      return false
    }
  }
)
