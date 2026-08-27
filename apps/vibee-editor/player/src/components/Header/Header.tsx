import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAtomValue, useSetAtom } from 'jotai'
import { useLanguage } from '@/hooks/useLanguage'
import {
  projectAtom,
  // User & Quota atoms
  userAtom,
  renderQuotaAtom,
  showLoginModalAtom,
  fetchQuotaAtom,
  logoutAtom,
  myProfileAtom,
  sidebarTabAtom,
  type SidebarTab,
  // Instagram connection
  instagramStatusAtom,
  fetchInstagramStatusAtom,
  connectInstagramAtom,
  disconnectInstagramAtom,
  // Dev mode
  isDevModeAtom,
  hasUnlimitedRendersAtom,
} from '@/atoms'
import {
  X,
  Zap,
  Keyboard,
  Instagram,
  Link2,
  Unlink,
  Loader2,
} from 'lucide-react'
import {
  TelegramLoginButton,
  UserAvatar,
  PaywallModal,
} from '@/components/Auth'
import { RemixBadge } from '@/components/RemixBadge'
import './styles.css'
import { LoginModal } from '@/components/Auth/LoginModal'
import { brandingAtom, loadBrandingAtom } from '@/atoms/branding'
import { isTelegram } from '@/lib/telegram'

// Page navigation tabs - 6 main tabs
const NAV_TABS = [
  { id: 'feed', emoji: '🌐', labelKey: 'tabs.feed', route: '/feed' },
  { id: 'blog', emoji: '📜', labelKey: 'tabs.blog', route: '/blog' },
  { id: 'search', emoji: '🔍', labelKey: 'tabs.search', route: '/search' },
  { id: 'editor', emoji: '▶️', labelKey: 'tabs.editor', route: '/editor' },
  {
    id: 'ai',
    emoji: '✨',
    labelKey: 'tabs.ai',
    route: '/generate',
    hasSubmenu: true,
  },
  {
    id: 'profile',
    emoji: '👤',
    labelKey: 'tabs.profile',
    route: '/profile',
    isDynamic: true,
  },
] as const

// AI submenu items - Order: Script (first!), Templates, Avatar, Video, Photo, Voice, Music
const AI_SUBMENU: {
  id: string
  emoji: string
  labelKey: string
  route: string
  sidebarTab: SidebarTab
}[] = [
  {
    id: 'script',
    emoji: '📝',
    labelKey: 'tabs.script',
    route: '/generate/script',
    sidebarTab: 'script',
  },
  {
    id: 'templates',
    emoji: '📋',
    labelKey: 'tabs.templates',
    route: '/generate/templates',
    sidebarTab: 'templates',
  },
  {
    id: 'avatar',
    emoji: '👄',
    labelKey: 'tabs.avatar',
    route: '/generate/avatar',
    sidebarTab: 'lipsync',
  },
  {
    id: 'video',
    emoji: '🎬',
    labelKey: 'generate.video',
    route: '/generate/video',
    sidebarTab: 'video',
  },
  {
    id: 'image',
    emoji: '📷',
    labelKey: 'generate.image',
    route: '/generate/image',
    sidebarTab: 'image',
  },
  {
    id: 'voice',
    emoji: '🎤',
    labelKey: 'generate.voice',
    route: '/generate/voice',
    sidebarTab: 'voice',
  },
  {
    id: 'music',
    emoji: '🎵',
    labelKey: 'generate.music',
    route: '/generate/music',
    sidebarTab: 'music',
  },
]

// Route patterns to match for active state
const ROUTE_PATTERNS: Record<string, RegExp> = {
  feed: /^\/feed/,
  search: /^\/search/,
  editor: /^\/editor/,
  ai: /^\/generate/,
  profile: /^\/(?!feed|search|editor|generate|templates|chat)[^/]+$/, // matches /:username but not known routes
}

// Export settings stored in localStorage
interface ExportSettings {
  codec: 'h264' | 'h265' | 'vp9' | 'prores'
  quality: 'high' | 'medium' | 'low'
}

const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  codec: 'h264',
  quality: 'high',
}

function getExportSettings(): ExportSettings {
  try {
    const saved = localStorage.getItem('vibee-export-settings')
    return saved
      ? { ...DEFAULT_EXPORT_SETTINGS, ...JSON.parse(saved) }
      : DEFAULT_EXPORT_SETTINGS
  } catch {
    return DEFAULT_EXPORT_SETTINGS
  }
}

function saveExportSettings(settings: ExportSettings) {
  localStorage.setItem('vibee-export-settings', JSON.stringify(settings))
}

interface HeaderProps {
  wsStatus?: 'connected' | 'disconnected'
  wsClientId?: string | null
}

export function Header({ wsStatus, wsClientId }: HeaderProps) {
  // Language hook
  const { lang, setLang, t } = useLanguage()
  const location = useLocation()
  const navigate = useNavigate()

  // Jotai atoms
  const project = useAtomValue(projectAtom)
  const myProfile = useAtomValue(myProfileAtom)

  // User & Quota state
  const user = useAtomValue(userAtom)
  const quota = useAtomValue(renderQuotaAtom)
  const showLoginModal = useAtomValue(showLoginModalAtom)
  const isDevMode = useAtomValue(isDevModeAtom)
  const hasUnlimitedRenders = useAtomValue(hasUnlimitedRendersAtom)

  // User actions
  const fetchQuota = useSetAtom(fetchQuotaAtom)
  const logout = useSetAtom(logoutAtom)

  // White label: внутри мини-аппа шапка носит имя и аватар бота владельца,
  // а не наш логотип. Бренд подтверждается подписью на сервере.
  const branding = useAtomValue(brandingAtom)
  const loadBranding = useSetAtom(loadBrandingAtom)
  useEffect(() => {
    void loadBranding()
  }, [loadBranding])

  /**
   * Заголовок вкладки — часть того же бренда, что и шапка.
   *
   * Выше объяснено, почему вспышка «VIBEE перед именем партнёра» в шапке —
   * не косметика. Во вкладке браузера то же имя стояло НАВСЕГДА: в index.html
   * зашито «VIBEE - AI Video Editor», и `document.title` не менял никто
   * (грепом по всему src — ноль совпадений). То есть партнёр, купивший
   * приложение под своим именем, видел чужое в каждой вкладке.
   *
   * Ждём `resolved`, а не `branded`: до ответа сервера неизвестно, чей это
   * бот, и переписывать заголовок раньше времени значит воспроизвести ту же
   * вспышку, только в заголовке.
   */
  useEffect(() => {
    if (!branding.resolved) return
    const next = branding.title || t('app.title')
    if (next && document.title !== next) document.title = next
  }, [branding.resolved, branding.title, t])
  const setShowLoginModal = useSetAtom(showLoginModalAtom)
  const setSidebarTab = useSetAtom(sidebarTabAtom)

  // Instagram connection
  const instagramStatus = useAtomValue(instagramStatusAtom)
  const fetchInstagramStatus = useSetAtom(fetchInstagramStatusAtom)
  const connectInstagram = useSetAtom(connectInstagramAtom)
  const disconnectInstagram = useSetAtom(disconnectInstagramAtom)
  const [isConnectingInstagram, setIsConnectingInstagram] = useState(false)
  const [isDisconnectingInstagram, setIsDisconnectingInstagram] =
    useState(false)

  // Fetch quota on mount if user is logged in
  useEffect(() => {
    if (user) {
      fetchQuota()
    }
  }, [user, fetchQuota])

  // Haptic feedback helper
  const triggerHaptic = useCallback((duration = 10) => {
    if ('vibrate' in navigator) {
      navigator.vibrate(duration)
    }
  }, [])

  // Handle tab click with haptic
  const handleTabClick = useCallback(
    (e: React.MouseEvent, tab: (typeof NAV_TABS)[number]) => {
      triggerHaptic()

      // For profile tab, use dynamic route
      if (tab.id === 'profile' && myProfile?.username) {
        e.preventDefault()
        navigate(`/${myProfile.username}`)
      }
    },
    [triggerHaptic, myProfile, navigate]
  )

  // Get profile route dynamically
  const getTabRoute = useCallback(
    (tab: (typeof NAV_TABS)[number]) => {
      if (tab.id === 'profile' && myProfile?.username) {
        return `/${myProfile.username}`
      }
      return tab.route
    },
    [myProfile]
  )

  // Find active tab index for slide indicator
  const activeTabIndex = NAV_TABS.findIndex(tab =>
    ROUTE_PATTERNS[tab.id]?.test(location.pathname)
  )

  const [showSettings, setShowSettings] = useState(false)
  const [exportSettings, setExportSettings] =
    useState<ExportSettings>(getExportSettings)
  const [showAiSubmenu, setShowAiSubmenu] = useState(false)
  const aiSubmenuRef = useRef<HTMLDivElement>(null)

  // Close AI submenu when clicking outside
  useEffect(() => {
    if (!showAiSubmenu) return

    const handleClickOutside = (e: MouseEvent) => {
      if (
        aiSubmenuRef.current &&
        !aiSubmenuRef.current.contains(e.target as Node)
      ) {
        setShowAiSubmenu(false)
      }
    }

    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showAiSubmenu])

  // Fetch Instagram status when settings modal opens
  useEffect(() => {
    if (showSettings && user) {
      fetchInstagramStatus()
    }
  }, [showSettings, user, fetchInstagramStatus])

  const handleSettingsChange = (key: keyof ExportSettings, value: string) => {
    const newSettings = { ...exportSettings, [key]: value }
    setExportSettings(newSettings)
    saveExportSettings(newSettings)
  }

  // Instagram connect handler
  const handleConnectInstagram = useCallback(async () => {
    setIsConnectingInstagram(true)
    try {
      await connectInstagram()
      // Poll for status updates after OAuth redirect
      const pollStatus = setInterval(async () => {
        await fetchInstagramStatus()
      }, 2000)
      setTimeout(() => clearInterval(pollStatus), 60000)
    } finally {
      setIsConnectingInstagram(false)
    }
  }, [connectInstagram, fetchInstagramStatus])

  // Instagram disconnect handler
  const handleDisconnectInstagram = useCallback(async () => {
    setIsDisconnectingInstagram(true)
    try {
      await disconnectInstagram()
    } finally {
      setIsDisconnectingInstagram(false)
    }
  }, [disconnectInstagram])

  // Note: Undo/Redo, Play, Save, Load, Reset buttons moved to Timeline.tsx

  return (
    <>
      {/* Skip navigation link for keyboard users */}
      <a href="#main-content" className="skip-nav">
        {t('a11y.skipToContent')}
      </a>
      <header className="header" role="banner">
        <div className="header-left">
          <Link to="/" className="logo">
            {/* Порядок веток важен.
                Раньше «бренда нет» и «бренд ещё не приехал» были неотличимы, и
                в обоих случаях сразу рисовался наш логотип. Внутри
                партнёрского бота это давало вспышку: человек видел VIBEE, а
                через мгновение — бренд партнёра. Партнёр покупает приложение
                под своим именем, чужое перед ним недопустимо.
                Поэтому внутри Telegram, пока ответ /branding не получен, место
                держит пустая заглушка тех же размеров — она не мигает и не
                двигает соседние элементы. На открытом вебе брендинга не будет
                никогда, ждать нечего, логотип показывается сразу. */}
            {branding.branded ? (
              <span className="logo-brand">
                {branding.avatarUrl ? (
                  <img
                    src={branding.avatarUrl}
                    alt={branding.title || ''}
                    className="logo-brand-avatar"
                  />
                ) : null}
                <span className="logo-brand-title">{branding.title}</span>
              </span>
            ) : !branding.resolved && isTelegram() ? (
              <span className="logo-placeholder" aria-hidden="true" />
            ) : (
              <span className="logo-t27">
                <img
                  src="/t27-mark.svg"
                  alt=""
                  aria-hidden="true"
                  className="logo-t27-mark"
                />
                <span className="logo-t27-text">Trinity S³AI</span>
              </span>
            )}
          </Link>
        </div>

        {/* Centered Navigation Tabs with Glassmorphism */}
        <nav className="header-tabs" aria-label="Main navigation">
          {/* Slide indicator */}
          {activeTabIndex >= 0 && (
            <div
              className="header-tabs-indicator"
              style={
                { '--active-index': activeTabIndex } as React.CSSProperties
              }
            />
          )}

          {NAV_TABS.map(tab => {
            const isActive = ROUTE_PATTERNS[tab.id]?.test(location.pathname)
            const tabRoute = getTabRoute(tab)
            const hasSubmenu = 'hasSubmenu' in tab && tab.hasSubmenu

            // AI tab with click submenu
            if (hasSubmenu) {
              return (
                <div
                  key={tab.id}
                  className="header-tab-wrapper"
                  ref={aiSubmenuRef}
                >
                  <Link
                    to={tabRoute}
                    className={`header-tab ${isActive ? 'active' : ''}`}
                    title={t(tab.labelKey)}
                    onClick={e => {
                      e.preventDefault()
                      e.stopPropagation()
                      triggerHaptic()
                      setShowAiSubmenu(!showAiSubmenu)
                    }}
                  >
                    <span className="header-tab-emoji">{tab.emoji}</span>
                    <span className="header-tab-label">{t(tab.labelKey)}</span>
                  </Link>

                  {/* AI Click Submenu */}
                  {showAiSubmenu && (
                    <div
                      className="header-submenu"
                      onClick={e => e.stopPropagation()}
                    >
                      {AI_SUBMENU.map(item => (
                        <Link
                          key={item.id}
                          to={item.route}
                          className="header-submenu-item"
                          onClick={() => {
                            triggerHaptic()
                            setShowAiSubmenu(false)
                            setSidebarTab(item.sidebarTab) // Sync with Editor asset tabs
                          }}
                        >
                          <span className="submenu-emoji">{item.emoji}</span>
                          <span className="submenu-label">
                            {t(item.labelKey)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )
            }

            return (
              <Link
                key={tab.id}
                to={tabRoute}
                className={`header-tab ${isActive ? 'active' : ''}`}
                title={t(tab.labelKey)}
                onClick={e => handleTabClick(e, tab)}
              >
                <span className="header-tab-emoji">{tab.emoji}</span>
                <span className="header-tab-label">{t(tab.labelKey)}</span>
              </Link>
            )
          })}
        </nav>

        <div className="header-center">
          <RemixBadge />
        </div>

        <div className="header-right">
          {/* Language Switcher */}
          <button
            className="header-button lang-toggle"
            onClick={() => setLang(lang === 'en' ? 'ru' : 'en')}
            title={
              lang === 'en' ? 'Переключить на русский' : 'Switch to English'
            }
          >
            {lang.toUpperCase()}
          </button>

          {/* User login / Quota display */}
          {user ? (
            <div className="user-section">
              {/* Quota display - show unlimited for dev/admin */}
              {hasUnlimitedRenders ? (
                <div
                  className="quota-display unlimited"
                  title={
                    isDevMode
                      ? 'Development mode - unlimited renders'
                      : 'Admin mode - unlimited renders'
                  }
                >
                  <Zap size={14} />
                  <span>∞ {isDevMode ? 'DEV' : 'ADMIN'}</span>
                </div>
              ) : (
                quota && (
                  <div
                    className={`quota-display ${
                      quota.free_remaining === 0 && !quota.subscription
                        ? 'exhausted'
                        : quota.free_remaining <= 1
                          ? 'warning'
                          : ''
                    }`}
                    title={`${quota.total_renders} renders used`}
                  >
                    <Zap size={14} />
                    <span>
                      {quota.subscription
                        ? quota.subscription.remaining === null
                          ? t('quota.unlimited')
                          : `${quota.subscription.remaining} ${t('quota.left')}`
                        : `${quota.free_remaining}/3 ${t('quota.free')}`}
                    </span>
                  </div>
                )
              )}
              <UserAvatar
                user={user}
                avatarUrl={myProfile?.avatar_url}
                onLogout={logout}
              />
            </div>
          ) : (
            <TelegramLoginButton onSuccess={() => setShowLoginModal(false)} />
          )}
        </div>

        {/* Note: Export button, blob warning dialogs, reset/save dialogs moved to Timeline.tsx */}

        {/* Settings Modal */}
        {showSettings && (
          <div
            className="settings-overlay"
            onClick={() => setShowSettings(false)}
          >
            <div className="settings-modal" onClick={e => e.stopPropagation()}>
              <div className="settings-header">
                <h2>{t('settings.title')}</h2>
                <button
                  className="settings-close"
                  onClick={() => setShowSettings(false)}
                >
                  <X size={20} />
                </button>
              </div>

              <div className="settings-content">
                {/* Export Settings */}
                <div className="settings-section">
                  <h3>{t('settings.export')}</h3>
                  <div className="settings-row">
                    <label>{t('settings.codec')}</label>
                    <select
                      value={exportSettings.codec}
                      onChange={e =>
                        handleSettingsChange('codec', e.target.value)
                      }
                    >
                      <option value="h264">{t('codec.h264')}</option>
                      <option value="h265">{t('codec.h265')}</option>
                      <option value="vp9">{t('codec.vp9')}</option>
                      <option value="prores">{t('codec.prores')}</option>
                    </select>
                  </div>
                  <div className="settings-row">
                    <label>{t('settings.quality')}</label>
                    <select
                      value={exportSettings.quality}
                      onChange={e =>
                        handleSettingsChange('quality', e.target.value)
                      }
                    >
                      <option value="high">{t('quality.high')}</option>
                      <option value="medium">{t('quality.medium')}</option>
                      <option value="low">{t('quality.low')}</option>
                    </select>
                  </div>
                </div>

                {/* Keyboard Shortcuts */}
                <div className="settings-section">
                  <h3>
                    <Keyboard size={16} /> {t('settings.shortcuts')}
                  </h3>
                  <div className="shortcuts-grid">
                    <div className="shortcut-item">
                      <kbd>Space</kbd>
                      <span>{t('shortcut.playPause')}</span>
                    </div>
                    <div className="shortcut-item">
                      <kbd>J / K / L</kbd>
                      <span>{t('shortcut.jkl')}</span>
                    </div>
                    <div className="shortcut-item">
                      <kbd>Cmd/Ctrl + Z</kbd>
                      <span>{t('shortcut.undo')}</span>
                    </div>
                    <div className="shortcut-item">
                      <kbd>Cmd/Ctrl + Shift + Z</kbd>
                      <span>{t('shortcut.redo')}</span>
                    </div>
                    <div className="shortcut-item">
                      <kbd>Cmd/Ctrl + A</kbd>
                      <span>{t('shortcut.selectAll')}</span>
                    </div>
                    <div className="shortcut-item">
                      <kbd>Cmd/Ctrl + C</kbd>
                      <span>{t('shortcut.copy')}</span>
                    </div>
                    <div className="shortcut-item">
                      <kbd>Cmd/Ctrl + V</kbd>
                      <span>{t('shortcut.paste')}</span>
                    </div>
                    <div className="shortcut-item">
                      <kbd>Cmd/Ctrl + D</kbd>
                      <span>{t('shortcut.duplicate')}</span>
                    </div>
                    <div className="shortcut-item">
                      <kbd>Delete / Backspace</kbd>
                      <span>{t('shortcut.delete')}</span>
                    </div>
                    <div className="shortcut-item">
                      <kbd>Escape</kbd>
                      <span>{t('shortcut.clearSelection')}</span>
                    </div>
                    <div className="shortcut-item">
                      <kbd>Arrow Left/Right</kbd>
                      <span>{t('shortcut.move1Frame')}</span>
                    </div>
                    <div className="shortcut-item">
                      <kbd>Shift + Arrow</kbd>
                      <span>{t('shortcut.move10Frames')}</span>
                    </div>
                    <div className="shortcut-item">
                      <kbd>Home / End</kbd>
                      <span>{t('shortcut.goToStartEnd')}</span>
                    </div>
                  </div>
                </div>

                {/* Project Info */}
                <div className="settings-section">
                  <h3>{t('settings.project')}</h3>
                  <div className="project-info">
                    <div className="info-row">
                      <span>{t('settings.name')}:</span>
                      <span>{project.name}</span>
                    </div>
                    <div className="info-row">
                      <span>{t('settings.resolution')}:</span>
                      <span>
                        {project.width} x {project.height}
                      </span>
                    </div>
                    <div className="info-row">
                      <span>{t('settings.fps')}:</span>
                      <span>{project.fps}</span>
                    </div>
                    <div className="info-row">
                      <span>{t('settings.duration')}:</span>
                      <span>
                        {(project.durationInFrames / project.fps).toFixed(1)}s (
                        {project.durationInFrames} frames)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Social Connections */}
                {user && (
                  <div className="settings-section">
                    <h3>
                      <Link2 size={16} /> {t('settings.connections')}
                    </h3>
                    <div className="connections-list">
                      {/* Instagram */}
                      <div className="connection-item">
                        <div className="connection-info">
                          <Instagram size={20} className="instagram-icon" />
                          <div className="connection-details">
                            <span className="connection-name">Instagram</span>
                            {instagramStatus?.connected ? (
                              <span className="connection-status connected">
                                @{instagramStatus.instagram_username}
                              </span>
                            ) : (
                              <span className="connection-status">
                                {t('settings.notConnected')}
                              </span>
                            )}
                          </div>
                        </div>
                        {instagramStatus?.connected ? (
                          <button
                            className="connection-btn disconnect"
                            onClick={handleDisconnectInstagram}
                            disabled={isDisconnectingInstagram}
                          >
                            {isDisconnectingInstagram ? (
                              <Loader2 size={14} className="spinning" />
                            ) : (
                              <Unlink size={14} />
                            )}
                            <span>{t('settings.disconnect')}</span>
                          </button>
                        ) : instagramStatus?.unavailable ? (
                          /**
                           * Кнопки нет НАМЕРЕННО — та же причина, что в
                           * модалке публикации: интеграции с Instagram на
                           * сервере не существует, и нажатие не делало
                           * ничего. Настройки — как раз то место, где
                           * человек ищет объяснение, а не пустую кнопку.
                           */
                          <span className="connection-unavailable">
                            {t('publish.instagramUnavailable')}
                          </span>
                        ) : (
                          <button
                            className="connection-btn connect"
                            onClick={handleConnectInstagram}
                            disabled={isConnectingInstagram}
                          >
                            {isConnectingInstagram ? (
                              <Loader2 size={14} className="spinning" />
                            ) : (
                              <Link2 size={14} />
                            )}
                            <span>{t('settings.connect')}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Paywall Modal */}
        <PaywallModal />

        {/* Login Modal */}
        <LoginModal />
      </header>
    </>
  )
}
