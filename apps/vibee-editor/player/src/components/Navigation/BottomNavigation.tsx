import { useLocation, useNavigate } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import { Home, Search, PlusSquare, User, GraduationCap } from 'lucide-react';
import { myProfileAtom } from '@/atoms';
import { useLanguage } from '@/hooks/useLanguage';
import './BottomNavigation.css';

interface NavItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  path: string;
  matchPaths?: string[];
}

export function BottomNavigation() {
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const myProfile = useAtomValue(myProfileAtom);

  const navItems: NavItem[] = [
    {
      id: 'feed',
      icon: <Home size={24} />,
      label: t('nav.feed'),
      path: '/feed',
      matchPaths: ['/feed'],
    },
    {
      id: 'search',
      icon: <Search size={24} />,
      label: t('nav.search'),
      path: '/search',
      matchPaths: ['/search'],
    },
    {
      id: 'learn',
      icon: <GraduationCap size={24} />,
      label: t('nav.learn') || 'Learn',
      path: '/learn',
      matchPaths: ['/learn'],
    },
    {
      id: 'create',
      icon: <PlusSquare size={24} />,
      label: t('nav.create'),
      path: '/editor',
      matchPaths: ['/editor'],
    },
    {
      id: 'profile',
      icon: <User size={24} />,
      label: t('nav.profile'),
      path: myProfile?.username ? `/${myProfile.username}` : '/profile',
      matchPaths: myProfile?.username ? [`/${myProfile.username}`] : ['/profile'],
    },
  ];

  const isActive = (item: NavItem) => {
    if (item.matchPaths) {
      return item.matchPaths.some(p => location.pathname === p);
    }
    return location.pathname === item.path;
  };

  const handleNavClick = (item: NavItem) => {
    // Haptic feedback
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
    navigate(item.path);
  };

  // Don't show on landing page
  if (location.pathname === '/') {
    return null;
  }

  return (
    <nav className="bottom-nav">
      {navItems.map((item) => (
        <button
          key={item.id}
          className={`bottom-nav__item ${isActive(item) ? 'active' : ''}`}
          onClick={() => handleNavClick(item)}
          aria-label={item.label}
        >
          <span className="bottom-nav__icon">{item.icon}</span>
          <span className="bottom-nav__label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
