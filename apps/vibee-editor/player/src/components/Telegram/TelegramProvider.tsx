import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSetAtom } from 'jotai'
import { fetchMyProfileAtom } from '@/atoms';
import { useTelegramWebApp } from '@/hooks/useTelegramWebApp';
import { getWebApp, isTelegram } from '@/lib/telegram';
import { telegramAutoLoginAtom } from '@/atoms/telegramAuth';

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

/**
 * Путь, с которого приложение реально стартовало, снятый ДО монтирования React.
 *
 * Читать location.pathname внутри эффекта нельзя: маршрут "/" редиректит на
 * /feed через <Navigate>, чей эффект успевает отработать раньше нашего. К
 * моменту эффекта путь уже /feed, проверка "стартовали ли мы с /" даёт false,
 * и диплинк по start_param молча теряется.
 */
const LAUNCH_PATH =
  typeof window !== 'undefined' ? window.location.pathname : '/';

export function TelegramProvider() {
  useTelegramWebApp();

  const navigate = useNavigate();
  const redirected = useRef(false);
  const autoLogin = useSetAtom(telegramAutoLoginAtom);

  // Личность берётся из launch-данных сразу на монтировании. Без этого
  // userAtom внутри мини-аппа не заполнялся вообще ничем, и человек упирался
  // в модалку «Login to Export», у которой внутри Telegram нет ни одной
  // кнопки.
  const fetchMyProfile = useSetAtom(fetchMyProfileAtom);

  useEffect(() => {
    const r = autoLogin();
    if (r?.applied) {
      console.log('[TelegramAuth] вход из launch-данных');
      // Синк профиля из Telegram (имя, username, аватар → users+profiles):
      // автологин раньше заполнял только память клиента, и профиль
      // показывал автора последнего поста вместо человека.
      fetchMyProfile().catch(() => {});
    }
  }, [autoLogin, fetchMyProfile]);

  useEffect(() => {
    if (redirected.current) return;
    if (!isTelegram()) return;
    // Переписываем только маршрут запуска.
    if (LAUNCH_PATH !== '/') return;

    const startParam = getWebApp()?.initDataUnsafe?.start_param;
    const target = startParam && START_PARAM_ROUTES[startParam];

    redirected.current = true;

    // Без start_param делать нечего: роутер уже увёл "/" на /feed.
    if (!target || target === TELEGRAM_HOME) return;

    navigate(target, { replace: true });
  }, [navigate]);

  return null;
}
