import { useEffect, useRef, useState } from 'react'
import { API_BASE } from '@/config'
import { apiFetch } from '@/lib/apiFetch'
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
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (secondsLeft <= 0) return
    timerRef.current = window.setTimeout(
      () =>
        setSecondsLeft(remaining => {
          if (remaining <= 1) {
            setCode(null)
            return 0
          }
          return remaining - 1
        }),
      1000
    )
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [secondsLeft])

  async function requestCode() {
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
      setCode(response.code)
      setSecondsLeft(response.expires_in)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Не удалось получить код — попробуйте ещё раз'
      )
    }
    setLoading(false)
  }

  const minutes = String(Math.floor(secondsLeft / 60))
  const seconds = String(secondsLeft % 60).padStart(2, '0')

  const actionButton = (
    <button
      className="pair-with-app__action"
      onClick={requestCode}
      disabled={loading}
    >
      {loading
        ? 'Получаем…'
        : code
          ? 'Получить новый код'
          : 'Показать 6-значный код'}
    </button>
  )

  return (
    <section className="pair-with-app">
      <h3 className="pair-with-app__title">
        {'Войти в приложение на телефоне'}
      </h3>

      {code ? (
        <>
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
          <p className="pair-with-app__timer">
            {`Одноразовый код. Осталось ${minutes}:${seconds}`}
          </p>
          {actionButton}
        </>
      ) : (
        <>
          {actionButton}
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
