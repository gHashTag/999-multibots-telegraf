import { useCallback, useEffect, useState } from 'react'
import './ConnectTelegram.css'
import { API_BASE } from '../../config'
import { authHeaders } from '@/lib/apiFetch'
import { useLanguage } from '@/hooks/useLanguage'
import { ConnectCode } from './ConnectCode'

/**
 * CONNECTING YOUR OWN TELEGRAM — A SCREEN THAT DOES NOT LIE ABOUT WHAT HAPPENS.
 *
 * The owner: "the bot must ask for access inside Telegram itself, so all the
 * setup for clients lives there".
 *
 * The code is NOT asked for in chat: a login code sent as a message inside
 * Telegram is invalidated by the platform -- that is how it protects people
 * from the commonest account theft. The form lives on our own domain, and the
 * code never travels through correspondence.
 *
 * ── HONESTY MATTERS MORE THAN BEAUTY HERE ─────────────────────────────────
 *
 * A person is handing over access to their correspondence. The screen has to
 * say so plainly, BEFORE the phone number: what the assistant gets, what is
 * not stored, and how to disconnect. A form that stays quiet and looks "like
 * Telegram" is phishing by shape, whatever it is by intention. So: our own
 * heading, our own words, and no attempt to look like a system dialog.
 *
 * ── ONE DECISION PER SCREEN ───────────────────────────────────────────────
 *
 * The owner, 2026-09-08: "the login needs a separately laid out screen for the
 * code, so the complexity does not scare people off -- this is the main
 * function, a personal assistant and a CRM".
 *
 * Everything used to render in one block, so the consent list about reading
 * your dialogs stayed on screen while the person typed a login code. This file
 * is now a router: consent and phone here, the code in `ConnectCode`, the
 * two-factor password on its own. Each screen asks for one thing.
 */

type Step = 'checking' | 'connected' | 'phone' | 'code' | 'password'

export function ConnectTelegram() {
  const { t } = useLanguage()
  const [step, setStep] = useState<Step>('checking')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [handle, setHandle] = useState('')
  const [viaApp, setViaApp] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /** Number filled in, not typed. Affects only the caption under the field. */
  const [phoneFromTelegram, setPhoneFromTelegram] = useState(false)

  const ask = useCallback(
    async (path: string, method: string, body?: unknown) => {
      const r = await fetch(`${API_BASE}${path}`, {
        method,
        headers: authHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || d?.ok === false) {
        throw new Error(d?.error || `сервер ответил ${r.status}`)
      }
      return d
    },
    []
  )

  useEffect(() => {
    let alive = true
    ask('/api/tg/connect/status', 'GET')
      .then(d => {
        if (!alive) return
        /*
         * THE NUMBER IS FILLED IN, BUT NOT SENT BY ITSELF.
         *
         * The owner asked for "no typing by hand". Filling it in: yes. Pressing
         * "Get the code" on somebody's behalf: no -- that is the beginning of
         * access to their correspondence.
         *
         * The field stays visible and editable. A number substituted silently
         * is worse than one typed by hand, because the person cannot see which
         * number is about to be used.
         */
        if (d.phone) {
          setPhone(p => p || String(d.phone))
          setPhoneFromTelegram(true)
        }
        setStep(d['подключено'] ? 'connected' : 'phone')
      })
      .catch(() => {
        // Could not ask -- show the form. Claiming "not connected" would be a
        // guess, while offering to connect is always safe.
        if (alive) setStep('phone')
      })
    return () => {
      alive = false
    }
  }, [ask])

  /**
   * Turn Telegram's own wording into something a person can act on.
   *
   * The owner saw "Error: You can only invoke MTProtoRequests" on screen after
   * typing a correct code. That was a genuine bug in our code, now fixed -- but
   * the SHAPE of the message is the second problem: raw protocol text tells the
   * person nothing about what to do, and makes a working screen look broken.
   *
   * Unknown errors are passed through unchanged. Replacing them with a friendly
   * "something went wrong" would hide the only clue anybody has, and this screen
   * has already cost one evening of that.
   */
  function inPlainWords(raw: string): string {
    const up = raw.toUpperCase()
    if (up.includes('PHONE_CODE_INVALID'))
      return 'Код не подошёл. Проверьте цифры и попробуйте снова.'
    if (up.includes('PHONE_CODE_EXPIRED'))
      return 'Код устарел — запросите новый.'
    if (up.includes('PHONE_NUMBER_INVALID'))
      return 'Такого номера нет. Нужен международный вид: +79991234567.'
    if (up.includes('FLOOD_WAIT')) {
      const secs = /FLOOD_WAIT_(\d+)/.exec(up)?.[1]
      return secs
        ? `Слишком много попыток. Подождите ${Math.ceil(Number(secs) / 60)} мин.`
        : 'Слишком много попыток — подождите немного.'
    }
    if (up.includes('SESSION_PASSWORD_NEEDED'))
      return 'Нужен пароль двухфакторной защиты.'
    if (up.includes('PASSWORD_HASH_INVALID')) return 'Пароль не подошёл.'
    if (up.includes('ВХОД НЕ НАЧАТ') || up.includes('ИСТЁК'))
      return 'Вход истёк — начните заново, код живёт пару минут.'
    return raw
  }

  const run = async (job: () => Promise<void>) => {
    setError(null)
    setBusy(true)
    try {
      await job()
    } catch (e) {
      setError(inPlainWords(e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(false)
    }
  }

  /** Shared by "Get the code" and "Request a new code" -- one login start. */
  const startLogin = () =>
    run(async () => {
      const d = await ask('/api/tg/connect/start', 'POST', { phone })
      setHandle(d.handle)
      setPhone(d.phone)
      setViaApp(d.viaApp !== false)
      setCode('')
      setStep('code')
    })

  if (step === 'checking') return null

  if (step === 'connected') {
    return (
      <section className="connect-tg">
        <h3>{t('connect.done.title')}</h3>
        <p>{t('connect.done.body')}</p>
        <button
          type="button"
          className="connect-tg__off"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await ask('/api/tg/connect', 'DELETE')
              setStep('phone')
            })
          }
        >
          {t('connect.done.off')}
        </button>
        {error && <p className="connect-tg__error">{error}</p>}
      </section>
    )
  }

  if (step === 'code') {
    return (
      <ConnectCode
        phone={phone}
        viaApp={viaApp}
        code={code}
        onCode={setCode}
        busy={busy}
        error={error}
        onBack={() => {
          setError(null)
          setStep('phone')
        }}
        onResend={() => void startLogin()}
        onSubmit={() =>
          void run(async () => {
            const d = await ask('/api/tg/connect/code', 'POST', {
              handle,
              code,
            })
            setCode('')
            setStep(d['нужен_пароль'] ? 'password' : 'connected')
          })
        }
      />
    )
  }

  if (step === 'password') {
    return (
      <section className="connect-tg">
        <h3>{t('connect.pass.title')}</h3>
        <p className="connect-tg__hint">{t('connect.pass.hint')}</p>
        <input
          type="password"
          autoComplete="current-password"
          aria-label={t('connect.pass.label')}
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <button
          type="button"
          disabled={busy || !password}
          onClick={() =>
            void run(async () => {
              await ask('/api/tg/connect/password', 'POST', {
                handle,
                password,
              })
              setPassword('')
              setStep('connected')
            })
          }
        >
          {busy ? t('connect.pass.going') : t('connect.pass.go')}
        </button>
        {error && <p className="connect-tg__error">{error}</p>}
      </section>
    )
  }

  return (
    <section className="connect-tg">
      <header className="connect-tg__top">
        <h3>{t('connect.title')}</h3>
        <span className="connect-tg__step">
          {t('connect.step', { n: 1, total: 2 })}
        </span>
      </header>

      <p className="connect-tg__lead">{t('connect.lead')}</p>

      {/*
        Consent BEFORE the phone number, not in small print under a button. A
        person decides knowing the consequences -- otherwise it is not consent.

        It lives on THIS screen and not on the code screen: repeating "the
        assistant can read your dialogs" at the moment somebody types a
        credential reads as a warning rather than as information, and that is
        where people stop.
      */}
      <ul className="connect-tg__facts">
        <li>{t('connect.can.read')}</li>
        <li>{t('connect.can.write')}</li>
        <li>{t('connect.can.secret')}</li>
        {/*
          THE NUMBER IS STORED NOW, AND IT SAYS SO.
          This used to read "phone, code and password are not stored". Once the
          number began to be filled in, that became a lie -- and a screen that
          promises not to store and stores is worse than one that promises
          nothing.
        */}
        <li>{t('connect.can.phone')}</li>
        <li>{t('connect.can.off')}</li>
      </ul>

      <label className="connect-tg__label" htmlFor="connect-tg-phone">
        {t('connect.phone.title')}
      </label>
      <input
        id="connect-tg-phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="+7 999 123-45-67"
        value={phone}
        onChange={e => setPhone(e.target.value)}
      />
      <p className="connect-tg__hint">
        {phoneFromTelegram
          ? // Say WHERE the number came from: one that appears silently looks
            // like somebody else's, and people re-check it instead of pressing.
            t('connect.phone.fromTelegram')
          : t('connect.phone.hint')}
      </p>

      {error && <p className="connect-tg__error">{error}</p>}

      <button
        type="button"
        disabled={busy || !phone.trim()}
        onClick={() => void startLogin()}
      >
        {busy ? t('connect.phone.going') : t('connect.phone.go')}
      </button>
    </section>
  )
}
