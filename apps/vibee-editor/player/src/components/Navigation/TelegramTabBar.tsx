import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import {
  Home,
  Search,
  GraduationCap,
  PlusSquare,
  Smile,
  Film,
  Image as ImageIcon,
  Mic,
  User,
} from 'lucide-react';
import { myProfileAtom } from '@/atoms';
import { useLanguage } from '@/hooks/useLanguage';
import { haptic } from '@/lib/telegram';
import './TelegramTabBar.css';

// ===============================
// The single navigation surface for the app.
//
// This is the UNION of the two previously-dead components:
//   VerticalTabs      — feed, player(/editor), lipsync, video, image, audio
//   BottomNavigation  — feed, search, learn, create(/editor), profile
// 'feed' and 'player'/'create' pointed at the same routes and are merged, so
// 6 + 5 becomes 9 distinct tabs.
//
// Neither original was rendered anywhere; both are superseded by this file.
// ===============================

interface TabItem {
  id: string;
  route: string;
  labelKey: string;
  icon: React.ReactNode;
  /** Extra path prefixes that should light this tab up. */
  match: RegExp;
}

const TABS: TabItem[] = [
  { id: 'feed', route: '/feed', labelKey: 'nav.feed', icon: <Home size={20} />, match: /^\/feed/ },
  { id: 'search', route: '/search', labelKey: 'nav.search', icon: <Search size={20} />, match: /^\/search/ },
  { id: 'learn', route: '/learn', labelKey: 'nav.learn', icon: <GraduationCap size={20} />, match: /^\/learn/ },
  { id: 'editor', route: '/editor', labelKey: 'nav.create', icon: <PlusSquare size={20} />, match: /^\/editor/ },
  { id: 'avatar', route: '/generate/avatar', labelKey: 'tabs.avatar', icon: <Smile size={20} />, match: /^\/generate\/avatar/ },
  { id: 'video', route: '/generate/video', labelKey: 'generate.video', icon: <Film size={20} />, match: /^\/generate\/video/ },
  { id: 'image', route: '/generate/image', labelKey: 'generate.image', icon: <ImageIcon size={20} />, match: /^\/generate\/image/ },
  { id: 'audio', route: '/generate/audio', labelKey: 'generate.audio', icon: <Mic size={20} />, match: /^\/generate\/audio/ },
  { id: 'profile', route: '/profile', labelKey: 'nav.profile', icon: <User size={20} />, match: /^\/profile/ },
];

/** Pages that own the full screen and must not be overlapped. */
const HIDDEN_EXACT = new Set([
  '/', // transient — redirects to /feed
  '/home', // marketing landing
  '/privacy-policy',
  '/terms-service',
  '/terms-of-service',
]);
const HIDDEN_PREFIXES = ['/instagram/'];

export function TelegramTabBar() {
  const { t } = useLanguage();
  const location = useLocation();
  const myProfile = useAtomValue(myProfileAtom);

  const hidden =
    HIDDEN_EXACT.has(location.pathname) ||
    HIDDEN_PREFIXES.some(p => location.pathname.startsWith(p));

  // Published on <body> so page layout can reserve space for the bar without
  // every page needing to know it exists.
  useEffect(() => {
    if (hidden) {
      document.body.removeAttribute('data-tabbar');
    } else {
      document.body.setAttribute('data-tabbar', 'visible');
    }
    return () => document.body.removeAttribute('data-tabbar');
  }, [hidden]);

  if (hidden) return null;

  const activeId =
    TABS.find(tab => tab.match.test(location.pathname))?.id ??
    // /:username is the profile route for a logged-in user
    (myProfile?.username && location.pathname === `/${myProfile.username}`
      ? 'profile'
      : undefined);

  return (
    <nav className="tma-tabbar" aria-label="Primary">
      <div className="tma-tabbar__scroll">
        {TABS.map(tab => {
          // ProfileRedirect resolves /profile to /:username, but linking
          // straight there avoids a redirect hop when the profile is loaded.
          const to =
            tab.id === 'profile' && myProfile?.username
              ? `/${myProfile.username}`
              : tab.route;

          return (
            <Link
              key={tab.id}
              to={to}
              className={`tma-tabbar__item ${activeId === tab.id ? 'active' : ''}`}
              onClick={() => haptic.selection()}
              aria-current={activeId === tab.id ? 'page' : undefined}
            >
              <span className="tma-tabbar__icon">{tab.icon}</span>
              <span className="tma-tabbar__label">{t(tab.labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export { TABS as TAB_BAR_ITEMS };
