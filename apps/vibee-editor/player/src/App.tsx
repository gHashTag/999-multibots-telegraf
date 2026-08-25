import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import { LanguageProvider } from '@/hooks/useLanguage';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { JotaiProvider } from '@/atoms/Provider';
import { myProfileAtom, userAtom } from '@/atoms';
import { TamaguiProvider } from '@/providers/TamaguiProvider';
import { ConditionalWeb3Provider } from '@/providers/ConditionalWeb3Provider';
import { ToastContainer } from '@/components/Toast/Toast';
import { PageTransition } from '@/components/PageTransition';
import { TelegramProvider } from '@/components/Telegram/TelegramProvider';
import { TelegramTabBar } from '@/components/Navigation/TelegramTabBar';
import { RouteMemory, LaunchRedirect } from '@/components/Navigation/RouteMemory';
import './App.css';

// Lazy load pages for code splitting
const HomePage = lazy(() => import('@/pages/Home'));
const EditorPage = lazy(() => import('@/pages/Editor'));
const ChatPage = lazy(() => import('@/pages/Chat'));
const ProfilePage = lazy(() => import('@/pages/Profile'));
const FeedPage = lazy(() => import('@/pages/Feed'));
const BlogPage = lazy(() => import('@/pages/Blog'));
const SearchPage = lazy(() => import('@/pages/Search'));
const GeneratePage = lazy(() => import('@/pages/Generate'));
const ScriptPage = lazy(() => import('@/pages/Script'));
const TemplatesPage = lazy(() => import('@/pages/Templates'));
const InstagramCallbackPage = lazy(() => import('@/pages/InstagramCallback'));
const PrivacyPolicyPage = lazy(() => import('@/pages/PrivacyPolicy'));
const TermsServicePage = lazy(() => import('@/pages/TermsService'));
const LearnPage = lazy(() => import('@/pages/Learn'));

// Redirect /profile to /:username for current user
function ProfileRedirect() {
  const myProfile = useAtomValue(myProfileAtom);
  const user = useAtomValue(userAtom);
  const username = myProfile?.username || user?.username;
  if (username) {
    return <Navigate to={`/${username}`} replace />;
  }
  // Not logged in — go to feed
  return <Navigate to="/feed" replace />;
}

// Loading fallback
function PageLoader() {
  return (
    <div className="page-loader">
      <div className="page-loader__spinner" />
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <TamaguiProvider>
        <JotaiProvider>
          <LanguageProvider>
            <BrowserRouter>
              <ConditionalWeb3Provider>
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
                  <Route path="/editor" element={<EditorPage />} />
                  <Route path="/generate" element={<Navigate to="/generate/script" replace />} />
                  <Route path="/generate/script" element={<ScriptPage />} />
                  <Route path="/generate/:tab" element={<GeneratePage />} />
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
              </ConditionalWeb3Provider>
            </BrowserRouter>
          </LanguageProvider>
        </JotaiProvider>
      </TamaguiProvider>
    </ErrorBoundary>
  );
}

export default App;
