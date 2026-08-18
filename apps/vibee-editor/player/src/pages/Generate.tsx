import { useParams, Navigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { GeneratePanel, type GenerateTab } from '@/components/Panels/GeneratePanel';
import { ResultsGallery } from '@/components/Results/ResultsGallery';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { PanelError } from '@/components/Panels/PanelError';
import './Generate.css';

// Valid tabs for URL param
const VALID_TABS = ['image', 'video', 'audio', 'avatar'] as const;
type ValidTab = typeof VALID_TABS[number];

function isValidTab(tab: string | undefined): tab is ValidTab {
  return VALID_TABS.includes(tab as ValidTab);
}

// Map URL param to GenerateTab
function urlParamToTab(param: string | undefined): GenerateTab {
  if (param === 'avatar') return 'lipsync';
  if (param === 'image' || param === 'video' || param === 'audio') return param;
  return 'image';
}

function GenerateContent() {
  const { tab: urlTab } = useParams<{ tab: string }>();

  // Redirect invalid tabs to /generate/image
  if (urlTab && !isValidTab(urlTab)) {
    return <Navigate to="/generate/image" replace />;
  }

  const activeTab = urlParamToTab(urlTab);
  const resultsTab = activeTab === 'lipsync' ? 'lipsync' : activeTab;

  return (
    <div className="generate-page">
      <Header />

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
  );
}

export default function GeneratePage() {
  return <GenerateContent />;
}
