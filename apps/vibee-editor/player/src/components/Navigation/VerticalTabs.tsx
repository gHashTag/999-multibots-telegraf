import { Link, useLocation } from 'react-router-dom';
import { useLanguage } from '@/hooks/useLanguage';
import './VerticalTabs.css';

// Tab configuration with routes
const TABS = [
  { id: 'feed', emoji: '🌐', labelKey: 'tabs.feed', route: '/feed' },
  { id: 'player', emoji: '▶️', labelKey: 'tabs.player', route: '/editor' },
  { id: 'lipsync', emoji: '👄', labelKey: 'tabs.avatar', route: '/generate/avatar' },
  { id: 'video', emoji: '🎬', labelKey: 'generate.video', route: '/generate/video' },
  { id: 'image', emoji: '📷', labelKey: 'generate.image', route: '/generate/image' },
  { id: 'audio', emoji: '🎤', labelKey: 'generate.audio', route: '/generate/audio' },
] as const;

// Route patterns to match for each tab
const ROUTE_PATTERNS: Record<string, RegExp> = {
  'feed': /^\/feed/,
  'player': /^\/editor/,
  'lipsync': /^\/generate\/avatar/,
  'video': /^\/generate\/video/,
  'image': /^\/generate\/image/,
  'audio': /^\/generate\/audio/,
};

interface VerticalTabsProps {
  className?: string;
}

export function VerticalTabs({ className = '' }: VerticalTabsProps) {
  const { t } = useLanguage();
  const location = useLocation();

  // Determine active tab based on current route
  const activeTab = TABS.find(tab =>
    ROUTE_PATTERNS[tab.id]?.test(location.pathname)
  )?.id || 'feed';

  return (
    <nav className={`vertical-tabs ${className}`}>
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          to={tab.route}
          className={`vertical-tab ${activeTab === tab.id ? 'active' : ''}`}
          title={t(tab.labelKey)}
        >
          <span className="tab-emoji">{tab.emoji}</span>
          <span className="tab-label">{t(tab.labelKey)}</span>
        </Link>
      ))}
    </nav>
  );
}

export { TABS };
