// Telegram Login Widget
// Uses official Telegram Login Widget for web authentication

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSetAtom } from 'jotai'
import { userAtom, fetchQuotaAtom, fetchMyProfileAtom } from '@/atoms'
import { useLanguage } from '@/hooks/useLanguage'
import type { TelegramUser } from '@/atoms'
import { isTelegram } from '@/lib/telegram'
import {
  exchangeTelegramWidget,
  resumeAppSessionRefresh,
} from '@/lib/appSession'
import { shouldUseTelegramFallback } from '@/lib/telegramWidget'
import { takeReturnTarget } from '@/lib/returnTarget'
import { sessionStore } from '@/lib/framedSession'

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
  botUsername?: string
  size?: 'small' | 'medium' | 'large'
  onSuccess?: () => void
  showFallback?: boolean
}

// Telegram SVG icon
const TelegramIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
  </svg>
)

/**
 * Домены, на которых виджет Telegram РАБОТАЕТ.
 *
 * Список положительный, а не отрицательный, и это главное в этом коде.
 * Раньше было наоборот: «фолбэк на localhost, везде остальное — виджет». При
 * переезде на app.t27.ai правило молча сломалось — домен не прописан боту
 * через BotFather /setdomain, и в шапке появилась белая плашка «Bot domain
 * invalid», прямо на первом экране человека, пришедшего из канала.
 *
 * Поймать это в коде нельзя: iframe отрисовывается (186×28), просто с
 * текстом ошибки внутри, а его содержимое на чужом origin недоступно.
 * Проверка по высоте такое не ловит. Значит, единственный надёжный способ —
 * знать заранее, где домен прописан.
 *
 * ЧТОБЫ ВЕРНУТЬ ВХОД В ОДИН КЛИК на app.t27.ai: владельцу нужно отправить
 * @BotFather команду /setdomain и указать app.t27.ai, после чего добавить
 * хост в этот список. До тех пор человек видит рабочую запасную кнопку, а
 * не английскую ошибку.
 */
export function TelegramLoginButton({
  botUsername = 't27ai_bot',
  size = 'medium',
  onSuccess,
  showFallback = shouldUseTelegramFallback(),
}: TelegramLoginButtonProps) {
  const { t } = useLanguage()
  const containerRef = useRef<HTMLDivElement>(null)
  const setUser = useSetAtom(userAtom)
  const fetchQuota = useSetAtom(fetchQuotaAtom)
  const fetchMyProfile = useSetAtom(fetchMyProfileAtom)
  const [widgetFailed, setWidgetFailed] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [authenticating, setAuthenticating] = useState(false)

  useEffect(() => {
    resumeAppSessionRefresh()
    // Define global callback for Telegram widget
    window.onTelegramAuth = data => {
      setAuthenticating(true)
      setHint(null)
      void exchangeTelegramWidget(data as unknown as Record<string, unknown>)
        .then(async session => {
          const verified = session.telegram_user
          if (!verified)
            throw new Error('Сервер не вернул подтверждённый профиль')
          const user: TelegramUser = {
            ...verified,
            // The signed widget hash is single-use verification material. It
            // must not enter persistent user state; the server session is the
            // only browser credential after this point.
            is_admin: false,
          }
          setUser(user)
          // Came from the game's sign-in chip: back to it, in this tab.
          const back = takeReturnTarget(sessionStore())
          if (back) {
            window.location.assign(back)
            return
          }
          await fetchMyProfile(user)
          await fetchQuota()
          onSuccess?.()
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error)
          setHint(`Вход не подтверждён сервером: ${message}`)
        })
        .finally(() => setAuthenticating(false))
    }

    // Only load native widget when not using fallback
    if (!showFallback && containerRef.current) {
      containerRef.current.innerHTML = ''

      const script = document.createElement('script')
      script.src = 'https://telegram.org/js/telegram-widget.js?22'
      script.async = true
      script.setAttribute('data-telegram-login', botUsername)
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
  }, [
    botUsername,
    size,
    setUser,
    fetchQuota,
    fetchMyProfile,
    onSuccess,
    showFallback,
  ])

  // Fallback: Open bot directly in Telegram
  const handleFallbackClick = () => {
    // Раньше здесь был переход t.me/<bot>?start=login — но бот-кассир не
    // отвечает на сообщения (и не должен), и человек упирался в тишину.
    // Честный путь: войти из самого Telegram, открыв мини-апп бота.
    setHint('Открываю подписанный Mini App у @' + botUsername)
    window.open(
      `https://t.me/${encodeURIComponent(botUsername)}?startapp=profile`,
      '_blank',
      'noopener,noreferrer'
    )
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
          type="button"
          disabled={authenticating}
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
      {hint && <p className="telegram-login-hint">{hint}</p>}
    </div>
  )
}

// Compact user avatar display (when logged in)
interface UserAvatarProps {
  user: TelegramUser
  avatarUrl?: string // Use avatar_url from database instead of user.photo_url
  /**
   * Выход. НЕОБЯЗАТЕЛЕН — и это главное в этом типе.
   *
   * Внутри мини-аппа выходить не из чего: личность даёт сам запуск Telegram,
   * а `telegramAutoLoginAtom` возвращает её при следующем же рендере. Кнопка
   * там не просто ничего не делала — она оставляла экран в противоречии:
   * шапка предлагала «Войти», а человек уже был снова опознан, и профиль
   * показывал «Пользователь не найден». Замерено вживую 07.09.2026.
   */
  onLogout?: () => void
  /**
   * Sign out on all devices. Optional for the same reason as onLogout, and
   * narrower: Header passes it only for a browser session outside Telegram.
   */
  onLogoutAll?: () => void
}

export function UserAvatar({
  user,
  avatarUrl: rawAvatarUrl,
  onLogout,
  onLogoutAll,
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
      {/*
        ВЫХОД ПОКАЗЫВАЕТСЯ ТОЛЬКО ТАМ, ГДЕ ЕМУ ЕСТЬ ЧТО ЗАКРЫТЬ.
        Условие живёт в Header: здесь мы лишь не рисуем то, чего не дали.
      */}
      {onLogout && (
        <button
          onClick={onLogout}
          className="logout-btn"
          title={t('auth.logout')}
        >
          &times;
        </button>
      )}
      {onLogoutAll && (
        <button
          type="button"
          onClick={onLogoutAll}
          className="logout-all-btn"
          title={t('auth.logoutAll')}
        >
          {t('auth.logoutAllShort')}
        </button>
      )}
    </div>
  )
}
