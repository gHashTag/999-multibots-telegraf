import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { installGlobalClientErrorReporting } from '@/lib/clientErrorBeacon'
import './index.css'
import './styles/design-system.css'
// Declares the open-web defaults for every --app-* property, so the Telegram
// runtime hook only ever overrides them. Must load after the base sheets.
import './styles/telegram.css'
import App from './App.tsx'
import { initSentry } from './lib/sentry'
import { captureReturnTarget } from './lib/returnTarget'
import { sessionStore } from './lib/framedSession'
import { IS_EMBED } from './lib/embed'
import { isTelegram } from './lib/telegram'

// Initialize Sentry error tracking
initSentry()

/*
 * ПОДСТАВНОЙ TELEGRAM — ДО МОНТИРОВАНИЯ, иначе поздно: `TelegramProvider`
 * смотрит на `window.Telegram` при монтировании.
 *
 * ИМПОРТ ДИНАМИЧЕСКИЙ И ВНУТРИ `DEV`, И ЭТО НЕ СТИЛЬ.
 *
 * Сначала здесь стоял обычный статический импорт, а защитой служило
 * `import.meta.env.DEV` ВНУТРИ модуля. Проверка `telegram-dev-mock.test.ts`
 * собрала продакшен-бандл и нашла в нём подставку: мёртвую ветку минификатор
 * убрал, а модуль остался в графе вместе со строками. Защита, которую никто
 * не собрал и не поискал, — это надежда.
 *
 * Динамический импорт под статически ложным условием Rollup выбрасывает
 * вместе со всем модулем: в продакшен-бандле от него не остаётся ни байта.
 */
if (import.meta.env.DEV) {
  const модуль = await import('./lib/telegramDevMock')
  модуль.включитьПодставнойTelegram()
}

// ===============================
// Storage Version — force reset when defaults change
// Bump this value whenever production defaults are updated
// ===============================
const STORAGE_VERSION = '4'
const VERSION_KEY = 'vibee-storage-version'

/**
 * A third-party frame (the game's TRI tab on t27.ai) may have no storage at
 * all: a browser that blocks third-party storage throws SecurityError from the
 * `localStorage` getter itself. That throw here would kill the bundle before
 * anything mounts. Storage that is not there has nothing to reset.
 */
function localStorageOrNull(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

const storedVersion = localStorageOrNull()
  ? localStorage.getItem(VERSION_KEY)
  : STORAGE_VERSION
if (storedVersion !== STORAGE_VERSION) {
  // Clear all VIBEE storage keys so new defaults take effect
  /**
   * ЧТО ПЕРЕЖИВАЕТ СБРОС.
   *
   * Сброс задуман для УМОЛЧАНИЙ редактора: поднимаем версию — новые значения
   * вступают в силу. Но подметал он всё подряд по префиксу «vibee-», включая
   * переписку человека с агентом и его недописанное сообщение. Это не
   * настройка: туда пишут задание — «сделай рилс про то-то, вот таким
   * голосом». Терять его при обновлении приложения нельзя, а владелец
   * сообщил ровно об этом: «история чата после перезагрузки».
   *
   * Список именно положительный: всё новое по умолчанию сбрасывается, как и
   * раньше, а уцелеть должно только то, что человек написал сам.
   */
  const KEEP = new Set([
    'vibee-agent-chat',
    'vibee-agent-chat-draft',
    'vibee-last-route',
    'vibee-soul',
  ])
  const keysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (
      key &&
      !KEEP.has(key) &&
      (key.startsWith('vibee-') ||
        key.startsWith('@vibee/') ||
        key.startsWith('editor:'))
    ) {
      keysToRemove.push(key)
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key))
  localStorage.setItem(VERSION_KEY, STORAGE_VERSION)
  if (keysToRemove.length > 0) {
    console.log(
      `[VIBEE] Storage reset (v${storedVersion} → v${STORAGE_VERSION}), cleared ${keysToRemove.length} keys`
    )
  }
}

// Register Service Workers
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Video Cache Service Worker (Phase 12 optimization)
    // Provides persistent video caching across sessions
    navigator.serviceWorker.register('/sw-video-cache.js').catch(error => {
      console.log('Video Cache SW registration failed:', error)
    })
  })
}

installGlobalClientErrorReporting()

// `?return=` from the game's sign-in chip, read before LaunchRedirect drops the
// query. Top level on the open web only (lib/returnTarget.ts).
captureReturnTarget(
  window,
  sessionStore(),
  window.self === window.top && !IS_EMBED && !isTelegram()
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
