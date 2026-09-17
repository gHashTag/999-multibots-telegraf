import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSetAtom } from 'jotai'
import { fetchMyProfileAtom } from '@/atoms'
import { useTelegramWebApp } from '@/hooks/useTelegramWebApp'
import { getInitData, isTelegram, launchStartParam } from '@/lib/telegram'
import { telegramAutoLoginAtom } from '@/atoms/telegramAuth'
import { exchangeTelegramLaunch } from '@/lib/appSession'

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
 * The start parameter is honoured when it names a known screen, so deep links
 * keep working. WHERE that parameter is read from is not obvious, and reading
 * it from Telegram's field alone is why this whole table matched nothing for
 * every button the bot shows -- see `launchStartParam` in lib/telegram.ts.
 */
const START_PARAM_ROUTES: Record<string, string> = {
  feed: '/feed',
  search: '/search',
  learn: '/learn',
  editor: '/editor',
  create: '/editor',
  avatar: '/generate/avatar',
  video: '/generate/video',
  image: '/generate/image',
  audio: '/generate/audio',
  profile: '/profile',
  /*
   * The /start greeting in the bot (src/navigation/helpers/startGreeting.ts)
   * offers the hive, the agent and the club as web_app buttons. `club` lands
   * on the profile because the welcome road and the club card live there;
   * one screen, two addresses, same reasoning as `pair` below.
   */
  hive: '/hive',
  chat: '/chat',
  club: '/profile',
  /**
   * `pair` — SIGN-IN FOR THE NATIVE APP. It was missing, and that alone made
   * signing in impossible.
   *
   * The bot sends exactly this value: `appLoginCommand.ts` declares its start
   * parameter as 'pair' and builds the button with `buildMiniAppUrl('pair')`.
   * A value this map does not know is NOT an error -- it falls through to
   * `TELEGRAM_HOME`, the feed. So the person pressed "Sign in to the app",
   * landed on the feed, never saw a code, typed something anyway on the
   * iPhone and got "код не найден".
   *
   * Production measurement 2026-09-03 matches that line for line: the logs
   * carry `POST /api/auth/pair/start` and THREE `POST /api/auth/pair/claim`,
   * while `app_pairing_codes` gained no row in 24 hours. No code existed for
   * a single second; all three claims failed as `unknown`.
   *
   * Points at `/profile` because the card that shows the code
   * (`PairWithApp`) lives there. No separate route was added: one screen with
   * two addresses is one more pair that will eventually drift apart.
   */
  /*
   * НА ВКЛАДКУ, ГДЕ КОД, А НЕ «КУДА-НИБУДЬ В ПРОФИЛЬ».
   *
   * Бот пишет: «Нажмите кнопку — откроется окно с кодом». Кнопка вела на
   * `/profile`, профиль открывался на «Шаблонах», а код живёт во вкладке
   * «Агент» — о которой в сообщении ни слова. Человек, пришедший за кодом по
   * единственному рекламируемому пути, кода не видел.
   */
  pair: '/profile?tab=agent',
}

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

    const startParam = launchStartParam()
    const target = startParam && START_PARAM_ROUTES[startParam]

    redirected.current = true

    // Без start_param делать нечего: роутер уже увёл "/" на /feed.
    if (!target || target === TELEGRAM_HOME) return

    navigate(target, { replace: true })
  }, [navigate])

  return null
}
