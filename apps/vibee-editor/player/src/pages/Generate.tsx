import { useParams, Navigate, NavLink } from 'react-router-dom'
import { Smile, Film, Image as ImageIcon, Mic } from 'lucide-react'
import { useLanguage } from '@/hooks/useLanguage'
import { Header } from '@/components/Header'
import {
  GeneratePanel,
  type GenerateTab,
} from '@/components/Panels/GeneratePanel'
import { ResultsGallery } from '@/components/Results/ResultsGallery'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { PanelError } from '@/components/Panels/PanelError'
import './Generate.css'

// Valid tabs for URL param
const VALID_TABS = ['image', 'video', 'audio', 'avatar'] as const
type ValidTab = (typeof VALID_TABS)[number]

function isValidTab(tab: string | undefined): tab is ValidTab {
  return VALID_TABS.includes(tab as ValidTab)
}

// Map URL param to GenerateTab
function urlParamToTab(param: string | undefined): GenerateTab {
  if (param === 'avatar') return 'lipsync'
  if (param === 'image' || param === 'video' || param === 'audio') return param
  return 'image'
}

/**
 * Выбор типа генерации ВНУТРИ страницы.
 *
 * Раньше четыре типа были четырьмя отдельными вкладками нижней панели —
 * аватар, видео, фото, голос. Это одна функция с разным результатом, и в
 * плоском ряду из девяти вкладок она занимала четыре места: полоса выходила
 * 476px против экрана 375px, часть уезжала вправо, и человек их не находил.
 *
 * Теперь снизу одна вкладка «ИИ», а тип выбирается здесь. Единственная другая
 * точка переключения — выпадающее меню в шапке; на телефоне оно требует двух
 * нажатий и закрывает контент, поэтому переключатель нужен и на странице.
 */
const GEN_TYPES = [
  { param: 'avatar', labelKey: 'tabs.avatar', icon: Smile },
  { param: 'video', labelKey: 'generate.video', icon: Film },
  { param: 'image', labelKey: 'generate.image', icon: ImageIcon },
  { param: 'audio', labelKey: 'generate.voice', icon: Mic },
] as const

function GenerateTypeSwitch() {
  const { t } = useLanguage()
  return (
    <nav className="gen-switch" aria-label={t('tabs.ai')}>
      {GEN_TYPES.map(({ param, labelKey, icon: Icon }) => (
        <NavLink
          key={param}
          to={`/generate/${param}`}
          className={({ isActive }) =>
            `gen-switch__item${isActive ? ' is-active' : ''}`
          }
        >
          <Icon size={16} aria-hidden="true" />
          <span className="gen-switch__label">{t(labelKey)}</span>
        </NavLink>
      ))}
    </nav>
  )
}

function GenerateContent() {
  const { tab: urlTab } = useParams<{ tab: string }>()

  // Redirect invalid tabs to /generate/image
  if (urlTab && !isValidTab(urlTab)) {
    return <Navigate to="/generate/image" replace />
  }

  const activeTab = urlParamToTab(urlTab)
  const resultsTab = activeTab === 'lipsync' ? 'lipsync' : activeTab

  return (
    <div className="generate-page">
      <Header />

      <GenerateTypeSwitch />

      <main className="generate-main">
        {/* Left panel: Generation form */}
        <aside className="generate-sidebar">
          <ErrorBoundary fallback={<PanelError />}>
            <GeneratePanel activeTab={activeTab} />
          </ErrorBoundary>
        </aside>

        {/* Right panel: Results gallery */}
        <section className="generate-content">
          <ErrorBoundary fallback={<PanelError />}>
            <ResultsGallery tab={resultsTab} />
          </ErrorBoundary>
        </section>
      </main>
    </div>
  )
}

export default function GeneratePage() {
  return <GenerateContent />
}
