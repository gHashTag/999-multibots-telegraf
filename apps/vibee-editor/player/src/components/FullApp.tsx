import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { LanguageProvider } from '@/hooks/useLanguage'
import { JotaiProvider } from '@/atoms/Provider'
import { TamaguiProvider } from '@/providers/TamaguiProvider'
import { ToastContainer } from '@/components/Toast/Toast'
import { PageTransition } from '@/components/PageTransition'
import { BrandLoader } from '@/components/BrandLoader/BrandLoader'

// Lazy load pages for code splitting
const HomePage = lazy(() => import('@/pages/Home'))
const EditorPage = lazy(() => import('@/pages/Editor'))
const ChatPage = lazy(() => import('@/pages/Chat'))
const ProfilePage = lazy(() => import('@/pages/Profile'))
const FeedPage = lazy(() => import('@/pages/Feed'))
const GeneratePage = lazy(() => import('@/pages/Generate'))
const ScriptPage = lazy(() => import('@/pages/Script'))
const TemplatesPage = lazy(() => import('@/pages/Templates'))
const InstagramCallbackPage = lazy(() => import('@/pages/InstagramCallback'))
const PrivacyPolicyPage = lazy(() => import('@/pages/PrivacyPolicy'))
const TermsServicePage = lazy(() => import('@/pages/TermsService'))

// Loading fallback: the product's own loader, not a bare ring.
function PageLoader() {
  return <BrandLoader fill />
}

function FullApp() {
  return (
    <TamaguiProvider>
      <JotaiProvider>
        <LanguageProvider>
          <PageTransition>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/feed" element={<FeedPage />} />
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
                <Route path="/editor" element={<EditorPage />} />
                <Route
                  path="/generate"
                  element={<Navigate to="/generate/script" replace />}
                />
                <Route path="/generate/script" element={<ScriptPage />} />
                <Route path="/generate/:tab" element={<GeneratePage />} />
                <Route path="/templates" element={<TemplatesPage />} />
                <Route path="/chat" element={<ChatPage />} />
                <Route
                  path="/instagram/callback"
                  element={<InstagramCallbackPage />}
                />
                <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
                <Route path="/terms-service" element={<TermsServicePage />} />
                <Route
                  path="/terms-of-service"
                  element={<TermsServicePage />}
                />
                <Route path="/:username" element={<ProfilePage />} />
              </Routes>
            </Suspense>
          </PageTransition>
          <ToastContainer />
        </LanguageProvider>
      </JotaiProvider>
    </TamaguiProvider>
  )
}

export default FullApp
