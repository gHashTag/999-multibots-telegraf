import { useEffect, useRef, useState } from 'react'
import { useAtomValue } from 'jotai'
import { API_BASE } from '@/config'
import { canAuthorizeRequestsAtom } from '@/atoms/telegramAuth'
import { apiFetch } from '@/lib/apiFetch'
import { isTelegram } from '@/lib/telegram'
import './PairWithApp.css'

/** Один заголовок на оба состояния панели, чтобы они не разъехались. */
const PANEL_TITLE = 'Войти в приложение на телефоне'

/**
 * Что стоит на месте кнопки, когда подписи нет.
 *
 * Вкладка «Агент» не может просто опустеть: сюда ведёт диплинк start_param
 * 'pair' (TelegramProvider), человек приходит СПЕЦИАЛЬНО за кодом. Поэтому
 * здесь не «недоступно», а дорога к подписанному запуску: команда /app
 * отвечает инлайн-кнопкой web_app, и вот её запуск initData уже несёт
 * (src/commands/appLoginCommand.ts).
 *
 * Формулировка зависит от isTelegram() только на словах: «вы в браузере» и
 * «вы в Telegram, но запуск без подписи» — разные ситуации для человека, хотя
 * сервер отвергает обе одинаково.
 */
function PairUnavailable({ inTelegram }: { inTelegram: boolean }) {
  return (
    <section className="pair-with-app">
      <h3 className="pair-with-app__title">{PANEL_TITLE}</h3>
      <p className="pair-with-app__unavailable" role="note">
        {inTelegram
          ? 'Этот запуск не несёт подписи Telegram — так открывается мини-апп с кнопки под полем ввода. Сервер не сможет подтвердить, кто вы, и код не выдаст.'
          : 'Код выдаётся только внутри Telegram: подпись запуска есть лишь там, а эта страница открыта в обычном браузере.'}
      </p>
      <ol className="pair-with-app__steps">
        <li>{'Откройте личный чат с ботом в Telegram.'}</li>
        <li>{'Отправьте команду /app и нажмите кнопку в его ответе.'}</li>
        <li>{'Профиль → «Агент»: кнопка с кодом будет здесь.'}</li>
      </ol>
    </section>
  )
}

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
  const requestInFlight = useRef(false)
  const canAuthorize = useAtomValue(canAuthorizeRequestsAtom)

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

  /**
   * ГЕЙТ ДО НАЖАТИЯ, А НЕ ПОСЛЕ ОТВЕТА СЕРВЕРА.
   *
   * `/api/auth/pair/start` выдаёт код только под подписанным initData
   * (render/session-routes.ts проверяет X-Telegram-Init-Data и отвечает 401
   * «подпись Telegram не принята»). Без подписи нажатие не могло сработать НИ
   * РАЗУ — тот же замер 2026-09-03: ни одной строки в `app_pairing_codes` за
   * сутки. Текст ошибки ниже уже человеческий, но кнопка, которая заведомо не
   * может сработать, до этого предлагалась как готовая к нажатию.
   *
   * Условие сервера — «нет подписи», а не «не Telegram»: запуск с reply-кнопки
   * идёт ИЗНУТРИ Telegram, но initData у него пустой (см. lib/telegram.ts), то
   * есть гейт на isTelegram() пропустил бы человека в тот же 401 на самом
   * частом способе запуска. Предикат берётся ровно тот, что применяет сервер,
   * и ровно из одного места — canAuthorizeRequestsAtom над
   * hasVerifiableInitData().
   */
  if (!canAuthorize) return <PairUnavailable inTelegram={isTelegram()} />

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
      /**
       * SHOW BOTH THE REASON AND WHAT TO DO ABOUT IT.
       *
       * This used to be the message alone, which is the server's `detail`
       * field -- "empty initData". True, and useless to a person: it names
       * the fault in protocol terms and says nothing about the next move.
       *
       * The next move lives in `hint`, which the server sends alongside ("the
       * code is issued only inside Telegram -- that is where the signature
       * is") and which `apiFetch` carefully attaches to the error object.
       * This screen was throwing it away. Measured 2026-09-03: not one new
       * row in `app_pairing_codes` in 24 hours against three claim attempts --
       * the person pressed the button, read "empty initData", and had no way
       * to learn that the mini app was open outside Telegram.
       */
      const hint = (requestError as { hint?: string } | null)?.hint
      const reason =
        requestError instanceof Error
          ? requestError.message
          : 'Не удалось получить код — попробуйте ещё раз'
      setError(hint ? `${reason}. ${hint}` : reason)
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
          : /*
               Число цифр не называется и здесь: кода ещё нет, а величина
               живёт на сервере (`PAIRING.DIGITS`) и уже менялась. Кнопка,
               обещающая шесть, приводила к экрану с восемью.
             */
            'Показать код для входа'}
    </button>
  )

  return (
    <section className="pair-with-app">
      <h3 className="pair-with-app__title">{PANEL_TITLE}</h3>
      {actionButton}

      {code ? (
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
              {/*
                Половина берётся ОТ ДЛИНЫ, а не «первые три».
                Код вырос с шести цифр до восьми, и жёсткая тройка резала его
                как «123 45678» — вид опечатки, а не группировки.
              */}
              {code.slice(0, Math.ceil(code.length / 2))}{' '}
              {code.slice(Math.ceil(code.length / 2))}
            </div>
            <p className="pair-with-app__instructions">
              {/*
                ЧИСЛО ЦИФР — ИЗ САМОГО КОДА, А НЕ ИЗ ПАМЯТИ АВТОРА.
                Здесь стояло «эти 6 цифр». Длину подняли до восьми на сервере
                (`PAIRING.DIGITS`), а текст остался: человек читал «6», видел
                восемь и решал, что ошибся он.
              */}
              {`Введите эти ${code.length} цифр в Trinity S³AI на телефоне: «Войти» → «Ввести код».`}
            </p>
          </div>
          <p className="pair-with-app__timer">
            {`Одноразовый код. Осталось ${minutes}:${seconds}`}
          </p>
        </>
      ) : (
        <>
          <ol className="pair-with-app__steps">
            {/* До нажатия кода ещё нет — значит и числа назвать нечем. */}
            <li>{'Нажмите кнопку — здесь появится код.'}</li>
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
