// Telegram Login Widget
// Uses official Telegram Login Widget for web authentication

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '@/hooks/useLanguage'
import type { TelegramUser } from '@/atoms'
import { isTelegram } from '@/lib/telegram'
import {
  telegramAuthBotForEnvironment,
  telegramAuthLoginUrl,
} from '@vibee/atoms/telegram-auth'

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramAuthData) => void
  }
}

interface TelegramAuthData {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

interface TelegramLoginButtonProps {
  size?: 'small' | 'medium' | 'large'
  onSuccess?: () => void
  showFallback?: boolean
  showConfigurationAlert?: boolean
}

interface TelegramAuthConfigurationAlertProps {
  className?: string
  includeAuthConfiguration?: boolean
  additionalMessage?: string
}

const currentAuthBot = () =>
  telegramAuthBotForEnvironment(
    import.meta.env.MODE,
    import.meta.env.VITE_TELEGRAM_AUTH_BOT_USERNAME as string | undefined
  )

export function TelegramAuthConfigurationAlert({
  className,
  includeAuthConfiguration = true,
  additionalMessage,
}: TelegramAuthConfigurationAlertProps) {
  const authBot = currentAuthBot()
  const messages: string[] = []
  if (includeAuthConfiguration && !isTelegram() && !authBot.configured) {
    messages.push(
      'Локальный Telegram-бот не настроен. Запустите telegram-dev-doctor.'
    )
  }
  if (additionalMessage) messages.push(additionalMessage)
  if (messages.length === 0) return null

  return (
    <p className={className} role="alert">
      {messages.join(' ')}
    </p>
  )
}

// Telegram SVG icon
const TelegramIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
  </svg>
)

export function TelegramLoginButton({
  size = 'medium',
  // ПО УМОЛЧАНИЮ true, а не false.
  //
  // Официальный виджет отдаёт для этого домена «Bot domain invalid» — белую
  // плашку в шапке на каждой странице. Поймать это в коде нельзя: iframe
  // отрисовывается (186x28), просто с текстом ошибки внутри, а его содержимое
  // на чужом origin недоступно — поэтому widgetFailed никогда не срабатывал.
  //
  // Запасная кнопка открывает t.me/<bot>?start=login и работает всегда,
  // независимо от того, прописан домен в BotFather или нет. Показывать
  // заведомо сломанный виджет вместо рабочей кнопки нечем оправдать.
  showFallback = true,
  showConfigurationAlert = true,
}: TelegramLoginButtonProps) {
  const developmentUsername = import.meta.env
    .VITE_TELEGRAM_AUTH_BOT_USERNAME as string | undefined
  const authBot = telegramAuthBotForEnvironment(
    import.meta.env.MODE,
    developmentUsername
  )
  const loginUrl = telegramAuthLoginUrl(
    import.meta.env.MODE,
    developmentUsername
  )
  const { t } = useLanguage()
  const containerRef = useRef<HTMLDivElement>(null)
  const [widgetFailed, setWidgetFailed] = useState(false)
  const [awaitingMiniApp, setAwaitingMiniApp] = useState(false)

  useEffect(() => {
    // Define global callback for Telegram widget
    window.onTelegramAuth = () => {
      // Login Widget data is not Mini App initData. Continue inside the
      // configured bot instead of persisting an unverified client identity.
      if (!loginUrl) return
      setAwaitingMiniApp(true)
      window.open(loginUrl, '_blank', 'noopener,noreferrer')
    }

    // Only load native widget when not using fallback
    if (!showFallback && authBot.configured && containerRef.current) {
      containerRef.current.innerHTML = ''

      const script = document.createElement('script')
      script.src = 'https://telegram.org/js/telegram-widget.js?22'
      script.async = true
      script.setAttribute('data-telegram-login', authBot.username)
      script.setAttribute('data-size', size)
      script.setAttribute('data-onauth', 'onTelegramAuth(user)')
      script.setAttribute('data-request-access', 'write')

      // Detect if widget fails to render (iframe not created within timeout)
      const failTimer = setTimeout(() => {
        if (containerRef.current) {
          const iframe = containerRef.current.querySelector('iframe')
          if (!iframe || iframe.offsetHeight === 0) {
            setWidgetFailed(true)
          }
        }
      }, 5000)

      script.onerror = () => {
        clearTimeout(failTimer)
        setWidgetFailed(true)
      }

      containerRef.current.appendChild(script)

      return () => {
        clearTimeout(failTimer)
        delete window.onTelegramAuth
      }
    }

    return () => {
      delete window.onTelegramAuth
    }
  }, [authBot.configured, authBot.username, size, loginUrl, showFallback])

  // Fallback: Open bot directly in Telegram
  const handleFallbackClick = () => {
    if (!loginUrl) return
    window.open(loginUrl, '_blank', 'noopener,noreferrer')
  }

  // Внутри Mini App этот виджет не нужен и вреден: пользователь уже
  // авторизован Telegram, а сам iframe грузится с oauth.telegram.org и, если
  // домен не прописан у бота через BotFather /setdomain, показывает белый
  // блок «Bot domain invalid» прямо в шапке. Прочитать это состояние из кода
  // нельзя — содержимое кросс-доменного iframe недоступно, поэтому проверка
  // widgetFailed по высоте его не ловит: iframe отрисовывается (186x28),
  // просто с текстом ошибки внутри.
  if (isTelegram()) {
    return null
  }

  const useFallback = showFallback || widgetFailed

  return (
    <div className="telegram-login-wrapper">
      {/* Show custom button when showFallback is true or widget failed, hide native widget */}
      {useFallback ? (
        <button
          className={`telegram-login-btn ${size === 'small' ? 'small' : ''}`}
          onClick={handleFallbackClick}
          disabled={!authBot.configured}
          type="button"
        >
          <TelegramIcon />
          <span>
            {size === 'small' ? t('login.button') : t('login.buttonFull')}
          </span>
        </button>
      ) : (
        /* Native Telegram widget for header */
        <div ref={containerRef} className="telegram-login-container" />
      )}
      {awaitingMiniApp ? (
        <p role="status">
          Подтвердите активный профиль внутри @{authBot.username}.
        </p>
      ) : null}
      {showConfigurationAlert ? <TelegramAuthConfigurationAlert /> : null}
    </div>
  )
}

// Compact user avatar display (when logged in)
interface UserAvatarProps {
  user: TelegramUser
  avatarUrl?: string // Use avatar_url from database instead of user.photo_url
  onLogout: () => void
}

export function UserAvatar({
  user,
  avatarUrl: rawAvatarUrl,
  onLogout,
}: UserAvatarProps) {
  const { t } = useLanguage()
  const [imgError, setImgError] = useState(false)

  const avatarUrl =
    rawAvatarUrl && rawAvatarUrl !== 'null' && rawAvatarUrl !== 'undefined'
      ? rawAvatarUrl
      : undefined

  // Use username for profile link, fallback to user_{id}
  const profilePath = user.username ? `/${user.username}` : `/user_${user.id}`

  return (
    <div className="user-avatar-container">
      <Link
        to={profilePath}
        className="user-avatar-link"
        title={t('profile.viewProfile')}
      >
        {avatarUrl && !imgError ? (
          <img
            src={avatarUrl}
            alt={user.first_name}
            className="user-avatar-img"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="user-avatar-placeholder">
            {user.first_name.charAt(0)}
          </div>
        )}
        <span className="user-name">{user.first_name}</span>
      </Link>
      <button
        onClick={onLogout}
        className="logout-btn"
        title={t('auth.logout')}
      >
        &times;
      </button>
    </div>
  )
}
