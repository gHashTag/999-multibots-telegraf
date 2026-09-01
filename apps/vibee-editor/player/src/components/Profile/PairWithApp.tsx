import { useEffect, useRef, useState } from 'react'
import { API_BASE } from '@/config'
import { apiFetch } from '@/lib/apiFetch'
import { getAppAccessToken } from '@/lib/appSession'
import { getInitData } from '@/lib/telegram'
import { TelegramMiniAppQr } from './TelegramMiniAppQr'
import './PairWithApp.css'

/**
 * Issues a short-lived code that pairs the signed-in Telegram identity with
 * the native app. The app cannot obtain Telegram initData itself, so the code
 * is created only on this verified page and consumed exactly once elsewhere.
 * Six visible digits avoid putting a refresh token into a URL, logs, or the
 * clipboard.
 */
export function PairWithApp() {
  const [code, setCode] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [clockNow, setClockNow] = useState(() => Date.now())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [identityRequired, setIdentityRequired] = useState(
    () => !getInitData() && !getAppAccessToken()
  )
  const requestInFlight = useRef(false)

  useEffect(() => {
    if (expiresAt === null) return

    const syncDeadline = () => {
      const currentTime = Date.now()
      setClockNow(currentTime)
      if (currentTime >= expiresAt) {
        setCode(null)
        setExpiresAt(null)
      }
    }

    const timer = window.setInterval(syncDeadline, 1000)
    window.addEventListener('focus', syncDeadline)
    document.addEventListener('visibilitychange', syncDeadline)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', syncDeadline)
      document.removeEventListener('visibilitychange', syncDeadline)
    }
  }, [expiresAt])

  async function requestCode() {
    if (requestInFlight.current) return
    requestInFlight.current = true
    setLoading(true)
    setError(null)
    try {
      const response = await apiFetch<{ code: string; expires_in: number }>(
        `${API_BASE}/api/auth/pair/start`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        }
      )
      const issuedAt = Date.now()
      const lifetimeSeconds = Number.isFinite(response.expires_in)
        ? Math.max(0, response.expires_in)
        : 0
      setClockNow(issuedAt)
      setExpiresAt(issuedAt + lifetimeSeconds * 1000)
      setCode(lifetimeSeconds > 0 ? response.code : null)
    } catch (requestError) {
      if ((requestError as { status?: number })?.status === 401) {
        setIdentityRequired(true)
        setError(null)
        return
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Не удалось получить код — попробуйте ещё раз'
      )
    } finally {
      requestInFlight.current = false
      setLoading(false)
    }
  }

  const secondsLeft =
    expiresAt === null
      ? 0
      : Math.max(0, Math.ceil((expiresAt - clockNow) / 1000))
  const minutes = String(Math.floor(secondsLeft / 60))
  const seconds = String(secondsLeft % 60).padStart(2, '0')

  const actionButton = (
    <button
      type="button"
      className="pair-with-app__action"
      onClick={requestCode}
      aria-disabled={loading}
      aria-busy={loading}
    >
      {loading
        ? 'Получаем…'
        : code
          ? 'Получить новый код'
          : 'Показать 6-значный код'}
    </button>
  )

  const telegramLogin = (
    <div
      className="pair-with-app__auth-required"
      role="status"
      aria-live="polite"
    >
      <strong>{'Нужен подтверждённый вход Telegram'}</strong>
      <p>
        {
          'Откройте Mini App @t27ai_bot и вернитесь в Профиль → Агент. Служебные данные вводить нигде не нужно.'
        }
      </p>
      <a
        className="pair-with-app__telegram-link"
        href="https://t.me/t27ai_bot?startapp=profile"
        target="_blank"
        rel="noreferrer"
      >
        {'Открыть Mini App @t27ai_bot'}
      </a>
    </div>
  )

  return (
    <section className="pair-with-app">
      <h3 className="pair-with-app__title">
        {'Войти в приложение на телефоне'}
      </h3>
      {identityRequired ? telegramLogin : actionButton}
      <TelegramMiniAppQr expanded={identityRequired} />

      {identityRequired ? null : code ? (
        <>
          <div
            className="pair-with-app__result"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <div
              className="pair-with-app__code"
              aria-label={`Код ${code.split('').join(' ')}`}
            >
              {code.slice(0, 3)} {code.slice(3)}
            </div>
            <p className="pair-with-app__instructions">
              {
                'Введите эти 6 цифр в Trinity S³AI на телефоне: «Войти» → «Ввести код».'
              }
            </p>
          </div>
          <p className="pair-with-app__timer">
            {`Одноразовый код. Осталось ${minutes}:${seconds}`}
          </p>
        </>
      ) : (
        <>
          <ol className="pair-with-app__steps">
            <li>{'Нажмите кнопку — здесь появятся 6 цифр.'}</li>
            <li>{'Откройте Trinity S³AI на телефоне.'}</li>
            <li>{'Выберите «Войти» → «Ввести код» и наберите эти цифры.'}</li>
          </ol>
          <p className="pair-with-app__note">
            {'Код действует 2 минуты и подходит только для одного входа.'}
          </p>
        </>
      )}

      {error && (
        <p className="pair-with-app__error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
