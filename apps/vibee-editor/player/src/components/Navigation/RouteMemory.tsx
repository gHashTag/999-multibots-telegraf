import { useEffect, useRef } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { STORAGE_KEYS } from '@vibee/atoms'
import { myProfileAtom } from '@/atoms'
import { cloudGet, cloudSet, launchStartParam } from '@/lib/telegram'
import { IS_EMBED } from '@/lib/embed'
import { isWelcomed } from '@/lib/welcomeMemory'
import {
  CLOUD_LAST_CHAT,
  HOME,
  cloudResume,
  decodeChatMark,
  encodeChatMark,
  isConversation,
  isRestorable,
  resumeTarget,
} from '@/lib/launchMemory'

/**
 * Приложение открывается там, где человека прервали.
 *
 * ЗАЧЕМ. Telegram умеет запускать мини-апп только по одному URL из BotFather —
 * всегда с корня. Корень уводил на ленту. Значит любой возврат в приложение —
 * свернул окно, ушёл в переписку, телефон выгрузил вкладку — выбрасывал
 * человека на ленту с любого экрана. Особенно дорого это на вкладке «Агент»:
 * туда пишут задание, а не реплику.
 *
 * ЧЕМ ЭТО НЕ ЯВЛЯЕТСЯ. Не история навигации и не «шаг назад». Хранится ровно
 * один путь — последний, и только чтобы выбрать стартовый экран.
 */

/**
 * THE FIRST SCREEN OF A FIRST LAUNCH: who we are and what is sold
 * (pages/Welcome.tsx). Shown once; the page sets the flag as it opens
 * (lib/welcomeMemory.ts).
 */
export const WELCOME = '/welcome'

/**
 * Снято ДО монтирования React — по той же причине, что и LAUNCH_PATH в
 * TelegramProvider: к моменту эффектов путь уже переписан редиректом, а
 * записыватель ниже успел бы положить в хранилище «/feed» поверх запомненного.
 */
const REMEMBERED = readRemembered(STORAGE_KEYS.lastRoute)
const LAST_CHAT = readRemembered(STORAGE_KEYS.lastChat)
/** When this device last wrote a conversation, read before anything rewrites it. */
const LAST_CHAT_AT = Number(readRemembered(STORAGE_KEYS.lastChatAt)) || 0
/** Where a greeted person is sent from "/" (LaunchRedirect). */
const RESUMED = resumeTarget(REMEMBERED, LAST_CHAT)

/**
 * A third-party frame (the game's TRI tab) may have no storage at all: a
 * browser that blocks third-party storage throws from the `localStorage`
 * getter itself, and a throw here, at module load, kills the whole bundle.
 */
function readRemembered(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

/**
 * Элемент маршрута «/».
 *
 * ПОЧЕМУ РЕДИРЕКТ, А НЕ navigate() ИЗ ЭФФЕКТА. Первая попытка так и делала — и
 * не работала: страницы ленивые, `<Routes>` живёт внутри `<Suspense>`, поэтому
 * эффект `<Navigate to="/feed">` отрабатывает ПОЗЖЕ эффектов соседей и молча
 * перебивал восстановление. Решение — не спорить с редиректом, а вычислить его
 * цель. Гонки не остаётся вовсе.
 */
export function LaunchRedirect() {
  // Прямая ссылка сильнее памяти: человек попросил конкретный экран.
  // One source for that parameter, app-wide (lib/telegram.ts). What stood here
  // was a read of Telegram's own field, which a bot button never fills.
  const startParam = launchStartParam()
  // Inside the game's TRI frame the game chose the screen; the remembered one
  // belongs to the real app.
  // A person who has never been greeted sees who we are first -- unless a
  // link asked for a screen, or the game's frame chose one.
  const target =
    IS_EMBED || startParam ? HOME : !isWelcomed() ? WELCOME : RESUMED

  return <Navigate to={target} replace />
}

/**
 * Запоминает текущий экран. Ничего не рендерит.
 *
 * Also carries the last conversation across devices: localStorage lives in one
 * Telegram client, so a chat left on the phone was unknown to the desktop. The
 * conversation is mirrored to Telegram's CloudStorage with a timestamp, and
 * once the launch lands, a newer mark from another device moves the person on
 * -- only from a page they passed through, and only if they have not moved.
 */
export function RouteMemory() {
  const location = useLocation()
  const navigate = useNavigate()
  const myProfile = useAtomValue(myProfileAtom)
  // The first screen after "/" is the restored one: landing on it again is not
  // a new conversation, and stamping it would outdate the other device's mark.
  const landing = useRef(true)
  const asked = useRef(false)
  const here = useRef(location.pathname)

  useEffect(() => {
    here.current = location.pathname
  }, [location.pathname])

  useEffect(() => {
    if (asked.current || location.pathname !== RESUMED) return
    asked.current = true
    if (IS_EMBED || launchStartParam() || !isWelcomed()) return
    void cloudGet(CLOUD_LAST_CHAT).then(raw => {
      const to = cloudResume({
        landed: RESUMED,
        current: here.current,
        localAt: LAST_CHAT_AT,
        cloud: decodeChatMark(raw),
      })
      if (to) navigate(to, { replace: true })
    })
  }, [location.pathname, navigate])

  useEffect(() => {
    // Screens opened inside the game's TRI frame are not where the person
    // left the real app. The frame's localStorage is the real app's (same
    // site on t27.ai, same origin under /game/), so nothing is written.
    if (IS_EMBED) return
    const path = location.pathname
    const username = myProfile?.username

    // `/profile` живёт как редирект на `/:username`, поэтому запоминаем
    // канонический `/profile`: чужой профиль возвращать незачем, а свой по
    // прямому пути сломается, если username сменится.
    const toStore = username && path === `/${username}` ? '/profile' : path

    const restored = landing.current && toStore === RESUMED
    if (path !== '/') landing.current = false

    if (!isRestorable(toStore)) return
    try {
      window.localStorage.setItem(STORAGE_KEYS.lastRoute, toStore)
      if (isConversation(toStore)) {
        window.localStorage.setItem(STORAGE_KEYS.lastChat, toStore)
        if (!restored) {
          const at = Date.now()
          window.localStorage.setItem(STORAGE_KEYS.lastChatAt, String(at))
          cloudSet(CLOUD_LAST_CHAT, encodeChatMark({ path: toStore, at }))
        }
      }
    } catch {
      // Приватный режим или переполненная квота. Потеря памяти о вкладке —
      // не повод ронять навигацию.
    }
  }, [location.pathname, myProfile?.username])

  return null
}
