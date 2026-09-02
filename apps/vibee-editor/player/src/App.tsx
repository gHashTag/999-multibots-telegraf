import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { LanguageProvider } from '@/hooks/useLanguage'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { JotaiProvider } from '@/atoms/Provider'
import { myProfileAtom, userAtom } from '@/atoms'
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
const ScriptPage = lazy(() => import('@/pages/Script'))
const TemplatesPage = lazy(() => import('@/pages/Templates'))
const InstagramCallbackPage = lazy(() => import('@/pages/InstagramCallback'))
const PrivacyPolicyPage = lazy(() => import('@/pages/PrivacyPolicy'))
const TermsServicePage = lazy(() => import('@/pages/TermsService'))
const LearnPage = lazy(() => import('@/pages/Learn'))

// Redirect /profile to /:username for current user
function ProfileRedirect() {
  const myProfile = useAtomValue(myProfileAtom)
  const user = useAtomValue(userAtom)
  const username = myProfile?.username || user?.username
  if (username) {
    return <Navigate to={`/${username}`} replace />
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
                    <Routes>
                      {/* Главная открывается там, где человека прервали, а без
                      памяти — на ленте. Редирект, а не рендер FeedPage прямо
                      на "/", чтобы у ленты остался один канонический URL — от
                      него зависит подсветка таба. */}
                      <Route path="/" element={<LaunchRedirect />} />
                      {/* Маркетинговый лендинг переехал сюда, чтобы не пропасть. */}
                      <Route path="/home" element={<HomePage />} />
                      <Route path="/feed" element={<FeedPage />} />
                      {/* Блог t27.ai через RSS-прокси — тот же канон дизайна. */}
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
                      <Route path="/templates" element={<TemplatesPage />} />
                      <Route path="/chat" element={<ChatPage />} />
                      <Route
                        path="/instagram/callback"
                        element={<InstagramCallbackPage />}
                      />
                      <Route
                        path="/privacy-policy"
                        element={<PrivacyPolicyPage />}
                      />
                      <Route
                        path="/terms-service"
                        element={<TermsServicePage />}
                      />
                      <Route
                        path="/terms-of-service"
                        element={<TermsServicePage />}
                      />
                      <Route path="/learn" element={<LearnPage />} />
                      <Route path="/profile" element={<ProfileRedirect />} />
                      <Route path="/:username" element={<ProfilePage />} />
                    </Routes>
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
