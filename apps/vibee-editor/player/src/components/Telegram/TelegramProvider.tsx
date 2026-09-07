import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSetAtom } from 'jotai'
import { fetchMyProfileAtom } from '@/atoms'
import { useTelegramWebApp } from '@/hooks/useTelegramWebApp'
import { getWebApp, getInitData, isTelegram } from '@/lib/telegram'
import { telegramAutoLoginAtom } from '@/atoms/telegramAuth'
import { exchangeTelegramLaunch } from '@/lib/appSession'
import { resolveMiniAppStartRoute } from '@/lib/miniAppRoutes'

// ===============================
// Mounts the Telegram runtime wiring. Must render INSIDE <BrowserRouter>
// (useTelegramWebApp calls useNavigate/useLocation) and outside <Routes>.
// Renders nothing.
// ===============================

/**
 * Telegram can only launch the single URL configured in BotFather, always at
 * "/" plus a #tgWebAppData fragment — it cannot open a path. "/" renders the
 * marketing landing (HomePage), which is exactly the page the tab bar hides on,
 * so without this redirect a Mini App user sees a landing page and no tabs.
 *
 * start_param (?startapp=... / t.me/bot/app?startapp=feed) is honoured when it
 * names a known tab, so deep links keep working.
 */
const TELEGRAM_HOME = '/feed'

/**
 * Путь, с которого приложение реально стартовало, снятый ДО монтирования React.
 *
 * Читать location.pathname внутри эффекта нельзя: маршрут "/" редиректит на
 * /feed через <Navigate>, чей эффект успевает отработать раньше нашего. К
 * моменту эффекта путь уже /feed, проверка "стартовали ли мы с /" даёт false,
 * и диплинк по start_param молча теряется.
 */
const LAUNCH_PATH =
  typeof window !== 'undefined' ? window.location.pathname : '/'
const LAUNCH_SEARCH =
  typeof window !== 'undefined' ? window.location.search : ''

export function TelegramProvider() {
  useTelegramWebApp()

  const navigate = useNavigate()
  const redirected = useRef(false)
  const autoLogin = useSetAtom(telegramAutoLoginAtom)

  // Личность берётся из launch-данных сразу на монтировании. Без этого
  // userAtom внутри мини-аппа не заполнялся вообще ничем, и человек упирался
  // в модалку «Login to Export», у которой внутри Telegram нет ни одной
  // кнопки.
  const fetchMyProfile = useSetAtom(fetchMyProfileAtom)

  /*
   * ОБМЕН ПОДПИСИ ЗАПУСКА НА СЕССИЮ — ОДИН РАЗ ЗА ЗАПУСК.
   *
   * `/api/auth/telegram` не звал никто: маршрут был написан, покрыт тестами,
   * задеплоен и не имел ни одного посетителя, а весь мини-апп ходил по
   * заголовку подписи на каждом запросе.
   *
   * Ссылка на «уже пробовали» нужна, потому что эффект может пройти повторно
   * (StrictMode в разработке, перемонтирование), а каждый лишний обмен — это
   * лишний запрос в базу. Повтор по той же строке сервер и так сводит к одной
   * семье (app_launch_families), но не просить дважды дешевле, чем сводить.
   *
   * Отказ НЕ ЛОМАЕТ НИЧЕГО: не вышло — работаем по подписи, как вчера.
   */
  const обменПробовали = useRef(false)
  useEffect(() => {
    if (обменПробовали.current) return
    const initData = getInitData()
    if (!initData) return
    обменПробовали.current = true
    void exchangeTelegramLaunch(initData)
  }, [])

  useEffect(() => {
    const r = autoLogin()
    if (r?.applied) {
      console.log('[TelegramAuth] вход из launch-данных')
      // Синк профиля из Telegram (имя, username, аватар → users+profiles):
      // автологин раньше заполнял только память клиента, и профиль
      // показывал автора последнего поста вместо человека.
      fetchMyProfile().catch(() => {})
    }
  }, [autoLogin, fetchMyProfile])

  useEffect(() => {
    if (redirected.current) return
    if (!isTelegram()) return
    // Переписываем только маршрут запуска.
    if (LAUNCH_PATH !== '/') return

    const startParam = getWebApp()?.initDataUnsafe?.start_param
    const target = resolveMiniAppStartRoute(startParam, LAUNCH_SEARCH)

    redirected.current = true

    // Без start_param делать нечего: роутер уже увёл "/" на /feed.
    if (!target || target === TELEGRAM_HOME) return

    navigate(target, { replace: true })
  }, [navigate])

  return null
}
