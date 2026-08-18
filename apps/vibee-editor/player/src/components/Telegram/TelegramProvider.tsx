import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTelegramWebApp } from '@/hooks/useTelegramWebApp';
import { getWebApp, isTelegram } from '@/lib/telegram';

// ===============================
// Mounts the Telegram runtime wiring. Must render INSIDE <BrowserRouter>
// (useTelegramWebApp calls useNavigate/useLocation) and outside <Routes>.
// Renders nothing.
// ===============================

/**
 * Telegram can only launch the single URL configured in BotFather, always at
 * "/" plus a #tgWebAppData fragment — it cannot open a path. "/" renders the
 * marketing landing (HomePage), which is exactly the page the tab bar hides on,
 * so without this redirect a Mini App user sees a landing page and no tabs.
 *
 * start_param (?startapp=... / t.me/bot/app?startapp=feed) is honoured when it
 * names a known tab, so deep links keep working.
 */
const START_PARAM_ROUTES: Record<string, string> = {
  feed: '/feed',
  search: '/search',
  learn: '/learn',
  editor: '/editor',
  create: '/editor',
  avatar: '/generate/avatar',
  video: '/generate/video',
  image: '/generate/image',
  audio: '/generate/audio',
  profile: '/profile',
};

const TELEGRAM_HOME = '/feed';

export function TelegramProvider() {
  useTelegramWebApp();

  const navigate = useNavigate();
  const location = useLocation();
  const redirected = useRef(false);

  useEffect(() => {
    if (redirected.current) return;
    if (!isTelegram()) return;
    // Only rewrite the launch route. Once the user has navigated anywhere,
    // "/" is a deliberate choice and must be left alone.
    if (location.pathname !== '/') return;

    redirected.current = true;

    const startParam = getWebApp()?.initDataUnsafe?.start_param;
    const target =
      (startParam && START_PARAM_ROUTES[startParam]) || TELEGRAM_HOME;

    navigate(target, { replace: true });
  }, [navigate, location.pathname]);

  return null;
}
