import { lazy, Suspense, useEffect, useState } from 'react'
import { reportArrival } from '@/lib/traffic'
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { LanguageProvider } from '@/hooks/useLanguage'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { JotaiProvider } from '@/atoms/Provider'
import { myProfileAtom, userAtom } from '@/atoms'
import { API_BASE } from '@/config'
import { authHeaders } from '@/lib/apiFetch'
import { TamaguiProvider } from '@/providers/TamaguiProvider'
import { ToastContainer } from '@/components/Toast/Toast'
import { AiFillLayer } from '@/components/AiFill/AiFillLayer'
import { PageTransition } from '@/components/PageTransition'
import { TelegramProvider } from '@/components/Telegram/TelegramProvider'
import { TelegramTabBar } from '@/components/Navigation/TelegramTabBar'
import {
  RouteMemory,
  LaunchRedirect,
} from '@/components/Navigation/RouteMemory'
import { EmbedBridge } from '@/components/Navigation/EmbedBridge'
import { ReturnToGame } from '@/components/Navigation/ReturnToGame'
import { LoginModal } from '@/components/Auth/LoginModal'
import { EmbedGuestGate } from '@/components/Navigation/EmbedGuestGate'
import './App.css'

// Lazy load pages for code splitting
const HomePage = lazy(() => import('@/pages/Home'))
const EditorPage = lazy(() => import('@/pages/Editor'))
const ChatPage = lazy(() => import('@/pages/Chat'))
const AgentsPage = lazy(() => import('@/pages/Agents'))
const AgentHarnessPage = lazy(() => import('@/pages/AgentHarness'))
const AgentDashboardPage = lazy(() => import('@/pages/AgentDashboard'))
const ProfilePage = lazy(() => import('@/pages/Profile'))
const FeedPage = lazy(() => import('@/pages/Feed'))
const BlogPage = lazy(() => import('@/pages/Blog'))
const GeneratePage = lazy(() => import('@/pages/Generate'))
const HivePage = lazy(() => import('@/pages/Hive'))
const BrowserPage = lazy(() => import('@/pages/Browser'))
const StoryPage = lazy(() => import('@/pages/Story'))
import { useBrowserWatch } from '@/hooks/useBrowserWatch'
import { BrandLoader } from '@/components/BrandLoader/BrandLoader'
import { isBrowserPath, keepMounted, KEEP_BROWSER_MS } from '@/lib/keptBrowser'
const CrmPage = lazy(() => import('@/pages/Crm'))
const CrmClientPage = lazy(() => import('@/pages/CrmClient'))
const CrmGroupPage = lazy(() => import('@/pages/CrmGroup'))
const ScriptPage = lazy(() => import('@/pages/Script'))
const TemplatesPage = lazy(() => import('@/pages/Templates'))
const InstagramCallbackPage = lazy(() => import('@/pages/InstagramCallback'))
const PrivacyPolicyPage = lazy(() => import('@/pages/PrivacyPolicy'))
const TermsServicePage = lazy(() => import('@/pages/TermsService'))
const LearnPage = lazy(() => import('@/pages/Learn'))
const PairPage = lazy(() => import('@/pages/Pair'))

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
  /*
   * An agent can start the person's browser at any moment. This watches for
   * that and switches the screen to it ONCE, so the work can be followed as
   * it happens. All of its rules are in lib/browserWatch.ts, with tests.
   */
  useBrowserWatch()

  // Inside the game's TRI frame, screens that need a person show a guest the
  // sign-in panel instead (components/Navigation/EmbedGuestGate.tsx).
  return (
    <EmbedGuestGate>
      <RouteTable />
      <KeptBrowser />
    </EmbedGuestGate>
  )
}

/**
 * The Browser tab, kept alive and hidden for a while after the person leaves
 * it, so coming back is instant instead of a full reconnect. The rule is in
 * lib/keptBrowser.ts; this only applies it.
 */
function KeptBrowser() {
  const { pathname } = useLocation()
  const onBrowser = isBrowserPath(pathname)
  const [leftAt, setLeftAt] = useState<number | null>(null)
  const [, tick] = useState(0)

  useEffect(() => {
    if (onBrowser) {
      setLeftAt(null)
      return
    }
    setLeftAt(was => (was === null ? Date.now() : was))
  }, [onBrowser])

  /* Let it go when the time is up, not at the next render by chance. */
  useEffect(() => {
    if (onBrowser || leftAt === null) return
    const wait = Math.max(0, leftAt + KEEP_BROWSER_MS - Date.now())
    const timer = setTimeout(() => tick(n => n + 1), wait)
    return () => clearTimeout(timer)
  }, [onBrowser, leftAt])

  const [ever, setEver] = useState(onBrowser)
  useEffect(() => {
    if (onBrowser) setEver(true)
  }, [onBrowser])

  const mounted = keepMounted(onBrowser, ever ? leftAt : null, Date.now())
  if (!mounted) return null
  return (
    <div hidden={!onBrowser}>
      <BrowserPage />
    </div>
  )
}

function RouteTable() {
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
      {/*
        THE LEADS SCREEN BECAME SECTIONS OF THE CRM (owner, 2026-09-23).
        Its five tabs sat at the bottom, under the app's own bar, and the
        address matched none of the bar's six destinations. Old links keep
        working: they land on the section they meant.
      */}
      <Route
        path="/search"
        element={<Navigate to="/crm?tab=leads" replace />}
      />
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
      {/* The Queen's board inside the app, at its own clean address
          (owner, 2026-09-26). nginx sends a top-level /queen/ here. */}
      <Route path="/queen" element={<HivePage />} />
      {/* The former sub-tab addresses still land on the hive. */}
      <Route path="/hive/*" element={<Navigate to="/hive" replace />} />
      {/* The person's own remote browser: one pod, one profile, started on
          demand. See docs/architecture/remote-browser-per-user.md. */}
      {/* Rendered by KeptBrowser below, which outlives a visit to another
          tab; the route stays so nothing else claims the address. */}
      <Route path="/browser" element={null} />
      {/* The person's own story reels: her face, her voice, any topic, one
          press. Her bot opens it with ?start=app_story. */}
      <Route path="/story" element={<StoryPage />} />
      <Route path="/crm" element={<CrmPage />} />
      {/* One client's workspace and the thread about them. Declared before
          `/:username`, and tested to resolve here rather than to a profile
          named "123". */}
      <Route path="/crm/:clientId" element={<CrmClientPage />} />
      <Route path="/crm/:clientId/chat" element={<ChatPage />} />
      {/* One group, read-only: what was said and who said it (#2950). */}
      <Route path="/crm/g/:chatId/chat" element={<CrmGroupPage />} />
      <Route path="/templates" element={<TemplatesPage />} />
      <Route path="/agents" element={<AgentsPage />} />
      <Route path="/agents/connect" element={<AgentHarnessPage />} />
      <Route path="/agents/:agentId/work" element={<ChatPage />} />
      {/* Every agent's own dashboard (owner, 2026-09-26). */}
      <Route path="/agents/:agentId" element={<AgentDashboardPage />} />
      <Route path="/chat" element={<ChatPage />} />
      <Route path="/instagram/callback" element={<InstagramCallbackPage />} />
      <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
      <Route path="/terms-service" element={<TermsServicePage />} />
      <Route path="/terms-of-service" element={<TermsServicePage />} />
      <Route path="/learn" element={<LearnPage />} />
      <Route path="/profile" element={<ProfileRedirect />} />
      {/* The app sign-in code. Its own address because the profile is behind
          the welcome road, and the road's third card is the club price -- so
          the one screen the bot advertises as "a window with your code" was
          answering with a bill. Declared before `/:username`, like /crm above,
          or a profile named "pair" would swallow it. */}
      <Route path="/pair" element={<PairPage />} />
      <Route path="/:username" element={<ProfilePage />} />
    </Routes>
  )
}

// Loading fallback: the product's own loader, not a bare ring.
function PageLoader() {
  return <BrandLoader fill />
}

function App() {
  /* A visit from a tagged link is counted once, by channel (#2974). */
  useEffect(() => {
    void reportArrival()
  }, [])
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
                    {/* Tells the game around the TRI frame which route this
                        is. Inside this Suspense, after the routes, so its
                        `ready` waits for the lazy page to render; renders
                        nothing and does nothing outside embed. */}
                    <EmbedBridge />
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
                {/* Back to the game after signing in, when its chip sent
                    the person here with ?return=. */}
                <ReturnToGame />
                {/* The one sign-in card for the whole app, and it lives here
                    rather than in the header. ReturnToGame above sits outside
                    <Routes> and can open it on ANY screen, while /learn draws
                    its own LearnHeader and no shared header at all: somebody
                    returning there pressed "Sign in" on the board, the atom
                    was set, and nobody drew the card. Mounted next to what
                    opens it is the one place that cannot repeat on the next
                    page without a Header. */}
                <LoginModal />
                <TelegramTabBar />
                <ToastContainer />
                {/* "✨ AI" beside any field worth filling (lib/aiFill.ts):
                    one layer that follows focus, so a new form gets the
                    button without anybody remembering to add it. */}
                <AiFillLayer />
              </>
            </BrowserRouter>
          </LanguageProvider>
        </JotaiProvider>
      </TamaguiProvider>
    </ErrorBoundary>
  )
}

export default App
