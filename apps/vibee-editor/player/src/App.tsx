import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { LanguageProvider } from '@/hooks/useLanguage'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { JotaiProvider } from '@/atoms/Provider'
import { myProfileAtom, userAtom } from '@/atoms'
import { API_BASE } from '@/config'
import { authHeaders } from '@/lib/apiFetch'
import { TamaguiProvider } from '@/providers/TamaguiProvider'
import { ToastContainer } from '@/components/Toast/Toast'
import { PageTransition } from '@/components/PageTransition'
import { TelegramProvider } from '@/components/Telegram/TelegramProvider'
import { TelegramTabBar } from '@/components/Navigation/TelegramTabBar'
import {
  RouteMemory,
  LaunchRedirect,
} from '@/components/Navigation/RouteMemory'
import './App.css'

// Lazy load pages for code splitting
const HomePage = lazy(() => import('@/pages/Home'))
const EditorPage = lazy(() => import('@/pages/Editor'))
const ChatPage = lazy(() => import('@/pages/Chat'))
const ProfilePage = lazy(() => import('@/pages/Profile'))
const FeedPage = lazy(() => import('@/pages/Feed'))
const BlogPage = lazy(() => import('@/pages/Blog'))
const SearchPage = lazy(() => import('@/pages/Search'))
const GeneratePage = lazy(() => import('@/pages/Generate'))
const HivePage = lazy(() => import('@/pages/Hive'))
const CrmPage = lazy(() => import('@/pages/Crm'))
const CrmClientPage = lazy(() => import('@/pages/CrmClient'))
const ScriptPage = lazy(() => import('@/pages/Script'))
const TemplatesPage = lazy(() => import('@/pages/Templates'))
const InstagramCallbackPage = lazy(() => import('@/pages/InstagramCallback'))
const PrivacyPolicyPage = lazy(() => import('@/pages/PrivacyPolicy'))
const TermsServicePage = lazy(() => import('@/pages/TermsService'))
const LearnPage = lazy(() => import('@/pages/Learn'))

// Redirect /profile to /:username for current user
// Экспортируется РАДИ ПРОВЕРОК: три ветки этой функции (имя есть / имя знает
// сервер / имени нет нигде) различаются только тем, что видит человек, и
// проверить их через всё приложение значит не проверить их вовсе.
export function ProfileRedirect() {
  const myProfile = useAtomValue(myProfileAtom)
  const user = useAtomValue(userAtom)
  const [поИдентификатору, setПоИдентификатору] = useState<
    // cyrillic-ok: pre-existing name, reflowed by the first prettier run
    string | null | undefined
  >(undefined)
  const username = myProfile?.username || user?.username

  /**
   * ИМЯ СПРАШИВАЕМ У СЕРВЕРА, ЕСЛИ ЗАПУСК ЕГО НЕ ДАЛ.
   *
   * Найдено 07.09.2026 живым прогоном мини-аппа.
   *
   * Профиль открывается по адресу `/:username`, а имя бралось ровно из двух
   * мест: профиля, уже загруженного в память, и launch-данных Telegram. Ни
   * одно не гарантировано:
   *
   *  - у множества аккаунтов Telegram @имени НЕТ ВОВСЕ;
   *  - Telegram кладёт `username` в launch-данные не всегда.
   *
   * В обоих случаях человек попадал на экран «Профиль не открыть: подпись
   * Telegram сюда не пришла» — при том что подпись пришла, человек опознан, и
   * дело совсем не в ней. Ложная причина хуже отсутствия причины: она уводит
   * искать не там, и «почему я не зашёл через TMA» — ровно этот вопрос.
   *
   * Сервер знает имя: он синхронизирует его из Telegram при входе, и маршрут
   * `GET /api/users/id/:telegram_id` его отдаёт. Один запрос превращает тупик
   * в рабочий экран.
   */
  useEffect(() => {
    if (username || !user?.id) return
    let живо = true
    fetch(`${API_BASE}/api/users/id/${encodeURIComponent(String(user.id))}`, {
      headers: authHeaders(),
    })
      .then(о => (о.ok ? о.json() : null))
      .then(д => {
        if (живо) setПоИдентификатору(д?.username || null)
      })
      .catch(() => {
        // Сеть отвалилась — это НЕ «имени нет». Ниже отличается одно от
        // другого: `null` значит «спросили, имени нет», `undefined` — «ещё
        // не знаем».
        if (живо) setПоИдентификатору(null)
      })
    return () => {
      живо = false
    }
  }, [username, user?.id])

  /*
   * СТРОКА ЗАПРОСА ПЕРЕЖИВАЕТ ПЕРЕХОД.
   *
   * `/profile?tab=agent` — то, чем бот открывает экран кода. Переход,
   * теряющий `?tab=`, снова высаживал бы человека на «Шаблоны», и правка выше
   * стала бы косметикой.
   */
  const хвост = typeof window !== 'undefined' ? window.location.search : ''
  if (username) {
    return <Navigate to={`/${username}${хвост}`} replace />
  }
  if (поИдентификатору) {
    return <Navigate to={`/${поИдентификатору}${хвост}`} replace />
  }
  // Ещё спрашиваем — молчим. Показать «профиль не открыть» и через миг увести
  // на профиль значит мигнуть человеку неправдой.
  if (user?.id && поИдентификатору === undefined) {
    return null
  }
  if (user?.id) {
    return <ProfileHasNoUsername />
  }
  /**
   * НЕ на ленту молча.
   *
   * Человек, попросивший свой профиль и получивший ленту, не понимает, что
   * произошло: экран выглядит рабочим, просто чужим. Нашлось на скриншоте
   * нативного приложения — там вкладка «Профиль» показывала ленту ВСЕГДА,
   * потому что у WKWebView нет подписи Telegram и узнать человека нечем.
   *
   * Объясняем ЗДЕСЬ, а не редиректом с меткой в адресе: метка, которую никто
   * не читает, — декорация, и в этом репозитории таких уже хватало.
   */
  return <ProfileNeedsSignIn />
}

/**
 * Человек опознан, но открывать профиль НЕ ПО ЧЕМУ: имени нет ни у Telegram,
 * ни у сервера.
 *
 * Отдельный экран, потому что причина другая. Раньше сюда попадали на текст
 * «подпись Telegram сюда не пришла» — при живой подписи. Человек шёл проверять
 * Telegram, перезапускать мини-апп и писать в поддержку о том, чего нет.
 */
function ProfileHasNoUsername() {
  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 24,
        textAlign: 'center',
      }}
    >
      <h2 style={{ margin: 0, fontSize: 18 }}>Профиль открывается по имени</h2>
      <p
        style={{
          margin: 0,
          maxWidth: 420,
          opacity: 0.7,
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        Мы вас узнали, но у вашего аккаунта Telegram нет @имени — а страница
        профиля живёт по нему. Задайте имя в Telegram: «Настройки» → «Имя
        пользователя», и вернитесь сюда.
      </p>
      <a
        href="/feed"
        style={{
          marginTop: 8,
          minHeight: 44,
          display: 'inline-flex',
          alignItems: 'center',
          padding: '0 16px',
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.15)',
          textDecoration: 'none',
          color: 'inherit',
        }}
      >
        Открыть ленту
      </a>
    </div>
  )
}

/**
 * Что показать вместо профиля, когда неизвестно, чей он.
 *
 * Пустой экран честнее подменённого, но объясняющий — лучше обоих.
 */
function ProfileNeedsSignIn() {
  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 24,
        textAlign: 'center',
      }}
    >
      <h2 style={{ margin: 0, fontSize: 18 }}>Профиль не открыть</h2>
      <p
        style={{
          margin: 0,
          maxWidth: 420,
          opacity: 0.7,
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        Мы не знаем, чей профиль показывать: подпись Telegram сюда не пришла.
        Откройте приложение внутри Telegram — там она есть.
      </p>
      <a
        href="/feed"
        style={{
          marginTop: 8,
          minHeight: 44,
          display: 'inline-flex',
          alignItems: 'center',
          padding: '0 20px',
          borderRadius: 10,
          background: '#2f6b3f',
          color: '#000',
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        Открыть ленту
      </a>
    </div>
  )
}

/**
 * THE ROUTE TABLE, ON ITS OWN.
 *
 * Exported so a test can mount it inside a MemoryRouter and ask "where does
 * `/crm/123` land?" without the providers, the tab bar and the Telegram
 * bridge around it. `App` below renders exactly this.
 */
export function AppRoutes() {
  return (
    <Routes>
      {/* The root opens where the person was interrupted, or on the feed
          when nothing is remembered. A redirect rather than rendering
          FeedPage at "/" keeps the feed on one canonical URL -- the tab
          highlight depends on it. */}
      <Route path="/" element={<LaunchRedirect />} />
      {/* The marketing landing moved here so it would not be lost. */}
      <Route path="/home" element={<HomePage />} />
      <Route path="/feed" element={<FeedPage />} />
      {/* The t27.ai blog through the RSS proxy -- same design canon. */}
      <Route path="/blog" element={<BlogPage />} />
      <Route path="/search" element={<SearchPage />} />
      <Route
        path="/editor"
        element={<Navigate to="/generate/editor" replace />}
      />
      <Route
        path="/generate"
        element={<Navigate to="/generate/script" replace />}
      />
      <Route path="/generate/script" element={<ScriptPage />} />
      <Route path="/generate/editor" element={<EditorPage />} />
      <Route path="/generate/:tab" element={<GeneratePage />} />
      <Route path="/hive" element={<HivePage />} />
      {/* The former sub-tab addresses still land on the hive. */}
      <Route path="/hive/*" element={<Navigate to="/hive" replace />} />
      <Route path="/crm" element={<CrmPage />} />
      {/* One client's workspace and the thread about them. Declared before
          `/:username`, and tested to resolve here rather than to a profile
          named "123". */}
      <Route path="/crm/:clientId" element={<CrmClientPage />} />
      <Route path="/crm/:clientId/chat" element={<ChatPage />} />
      <Route path="/templates" element={<TemplatesPage />} />
      <Route path="/chat" element={<ChatPage />} />
      <Route path="/instagram/callback" element={<InstagramCallbackPage />} />
      <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
      <Route path="/terms-service" element={<TermsServicePage />} />
      <Route path="/terms-of-service" element={<TermsServicePage />} />
      <Route path="/learn" element={<LearnPage />} />
      <Route path="/profile" element={<ProfileRedirect />} />
      <Route path="/:username" element={<ProfilePage />} />
    </Routes>
  )
}

// Loading fallback
function PageLoader() {
  return (
    <div className="page-loader">
      <div className="page-loader__spinner" />
    </div>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <TamaguiProvider>
        <JotaiProvider>
          <LanguageProvider>
            <BrowserRouter>
              <>
                <PageTransition>
                  <Suspense fallback={<PageLoader />}>
                    <AppRoutes />
                  </Suspense>
                </PageTransition>
                {/* Both live inside <BrowserRouter> (they use useLocation /
                    useNavigate) but outside <PageTransition>, so the tab bar
                    does not animate or unmount on every navigation, and
                    outside <Suspense> so it stays visible while a lazy page
                    chunk loads. */}
                <TelegramProvider />
                {/* Порядок важен: TelegramProvider первым, чтобы диплинк по
                    start_param отработал раньше восстановления экрана. */}
                <RouteMemory />
                <TelegramTabBar />
                <ToastContainer />
              </>
            </BrowserRouter>
          </LanguageProvider>
        </JotaiProvider>
      </TamaguiProvider>
    </ErrorBoundary>
  )
}

export default App
