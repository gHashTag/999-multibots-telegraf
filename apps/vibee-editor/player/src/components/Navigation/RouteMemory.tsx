import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { STORAGE_KEYS } from '@vibee/atoms'
import { myProfileAtom } from '@/atoms'
import { launchStartParam } from '@/lib/telegram'
import { IS_EMBED } from '@/lib/embed'

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
 * Куда можно возвращать.
 *
 * Список ЯВНЫЙ, а не «всё кроме служебного», из-за маршрута `/:username`: он
 * ловит любую одиночную строку, поэтому мусор в хранилище отрендерился бы
 * страницей профиля. Профиль возвращается по каноническому `/profile` —
 * см. запись ниже.
 */
const RESTORABLE = [
  /^\/feed(\/|$)/,
  /^\/chat(\/|$)/,
  /^\/editor(\/|$)/,
  /^\/generate(\/|$)/,
  /^\/templates(\/|$)/,
  /^\/search(\/|$)/,
  /^\/blog(\/|$)/,
  /^\/learn(\/|$)/,
  /^\/profile(\/|$)/,
]

function isRestorable(path: string): boolean {
  return RESTORABLE.some(re => re.test(path))
}

/** Куда уходит корень, когда памяти нет. */
const HOME = '/feed'

/**
 * Снято ДО монтирования React — по той же причине, что и LAUNCH_PATH в
 * TelegramProvider: к моменту эффектов путь уже переписан редиректом, а
 * записыватель ниже успел бы положить в хранилище «/feed» поверх запомненного.
 */
const REMEMBERED = readRemembered()

/**
 * A third-party frame (the game's TRI tab) may have no storage at all: a
 * browser that blocks third-party storage throws from the `localStorage`
 * getter itself, and a throw here, at module load, kills the whole bundle.
 */
function readRemembered(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(STORAGE_KEYS.lastRoute)
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
  const target =
    !IS_EMBED && !startParam && REMEMBERED && isRestorable(REMEMBERED)
      ? REMEMBERED
      : HOME

  return <Navigate to={target} replace />
}

/** Запоминает текущий экран. Ничего не рендерит. */
export function RouteMemory() {
  const location = useLocation()
  const myProfile = useAtomValue(myProfileAtom)

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

    if (!isRestorable(toStore)) return
    try {
      window.localStorage.setItem(STORAGE_KEYS.lastRoute, toStore)
    } catch {
      // Приватный режим или переполненная квота. Потеря памяти о вкладке —
      // не повод ронять навигацию.
    }
  }, [location.pathname, myProfile?.username])

  return null
}
