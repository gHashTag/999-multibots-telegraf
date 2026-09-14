import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { STORAGE_KEYS } from '@vibee/atoms'
import { myProfileAtom } from '@/atoms'
import { getWebApp } from '@/lib/telegram'

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
const REMEMBERED =
  typeof window !== 'undefined'
    ? window.localStorage.getItem(STORAGE_KEYS.lastRoute)
    : null

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
  const startParam = getWebApp()?.initDataUnsafe?.start_param
  const target =
    !startParam && REMEMBERED && isRestorable(REMEMBERED) ? REMEMBERED : HOME

  return <Navigate to={target} replace />
}

/** Запоминает текущий экран. Ничего не рендерит. */
export function RouteMemory() {
  const location = useLocation()
  const myProfile = useAtomValue(myProfileAtom)

  useEffect(() => {
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
