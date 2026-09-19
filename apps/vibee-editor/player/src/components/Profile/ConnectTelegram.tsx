import { useCallback, useEffect, useState } from 'react'
import './ConnectTelegram.css'
import { API_BASE } from '../../config'
import { authHeaders } from '@/lib/apiFetch'
import { useLanguage } from '@/hooks/useLanguage'
import { ConnectCode } from './ConnectCode'
import { ConnectQr } from './ConnectQr'
import { accountLabel, runQrPoll, type QrAccountSeen } from './qrPoll'
import { NOTHING_SENT, readSentCode, type SentCode } from './connectDelivery'
import {
  browserStore,
  clearAttempt,
  loadAttempt,
  remainingWait,
  saveAttempt,
} from './connectAttemptStore'
import { getWebApp, isTelegram } from '@/lib/telegram'
import { useSetAtom } from 'jotai'
import { agentTelegramConnectedAtom } from '@/atoms/agentTelegram'

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

type Step = 'checking' | 'connected' | 'phone' | 'code' | 'qr' | 'password'

/**
 * The chat named "Telegram": the service account behind +42777, which is where
 * a login code for a session from our server arrives. A phone-number link, so
 * it opens the chat itself rather than a search.
 */
const TELEGRAM_SERVICE_CHAT = 'https://t.me/+42777'

export function ConnectTelegram() {
  const { t } = useLanguage()
  const [step, setStep] = useState<Step>('checking')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [handle, setHandle] = useState('')
  /** What Telegram said about the code it sent: channel, next one, wait. */
  const [sent, setSent] = useState<SentCode>(NOTHING_SENT)
  /** The `tg://login` link on the QR screen; the server renews it. */
  const [qrUrl, setQrUrl] = useState('')
  /** Which account connected. After a QR scan nobody typed a number, so */
  /** "connected" alone would not say which of two accounts held the camera. */
  const [account, setAccount] = useState<QrAccountSeen | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /** Number filled in, not typed. Affects only the caption under the field. */
  const [phoneFromTelegram, setPhoneFromTelegram] = useState(false)
  // Shared with the profile gate: it opens the profile the moment this is true.
  const setConnected = useSetAtom(agentTelegramConnectedAtom)

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
        setConnected(!!d['подключено'])
        if (d['подключено']) {
          clearAttempt(browserStore())
          setStep('connected')
          return
        }
        /*
         * BACK FROM THE "TELEGRAM" CHAT: THE LOGIN IS WHERE IT WAS LEFT.
         *
         * On a client that closes the Mini App when another chat is opened,
         * the person returned to an empty phone form, asked for a code again,
         * and killed the code they had just gone to read. An attempt younger
         * than the server's ten minutes is resumed on the code screen, with
         * only the wait they still owe.
         */
        const now = Date.now()
        const saved = loadAttempt(browserStore(), now)
        if (saved) {
          setHandle(saved.handle)
          setPhone(saved.phone)
          setSent({
            ...saved.sent,
            resendAfter: remainingWait(saved, now),
            round: 1,
          })
          setStep('code')
          return
        }
        setStep('phone')
      })
      .catch(() => {
        // Could not ask -- show the form. Claiming "not connected" would be a
        // guess, while offering to connect is always safe.
        if (alive) {
          setConnected(false)
          setStep('phone')
        }
      })
    return () => {
      alive = false
    }
  }, [ask, setConnected])

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
  /** The server no longer has its half: ten minutes passed, or a deploy. */
  function attemptIsGone(raw: string): boolean {
    const up = raw.toUpperCase()
    return up.includes('ВХОД НЕ НАЧАТ') || up.includes('ИСТЁК')
  }

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
    if (up.includes('SEND_CODE_UNAVAILABLE'))
      return 'У Telegram нет другого способа доставить код на этот номер. Откройте Telegram там, где этот номер уже вошёл: код в чате «Telegram».'
    if (up.includes('PHONE_NUMBER_FLOOD'))
      return 'Код для этого номера запрашивали слишком часто. Telegram снимет ограничение сам, обычно через несколько часов.'
    if (up.includes('SESSION_PASSWORD_NEEDED'))
      return 'Нужен пароль двухфакторной защиты.'
    if (up.includes('PASSWORD_HASH_INVALID')) return 'Пароль не подошёл.'
    if (attemptIsGone(raw))
      return 'Вход истёк — начните заново, код живёт пару минут.'
    return raw
  }

  const run = async (job: () => Promise<void>) => {
    setError(null)
    setBusy(true)
    try {
      await job()
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e)
      // A remembered attempt the server has dropped would bring the person
      // back to a dead code screen on the next launch.
      if (attemptIsGone(raw)) clearAttempt(browserStore())
      setError(inPlainWords(raw))
    } finally {
      setBusy(false)
    }
  }

  const startLogin = () =>
    run(async () => {
      const d = await ask('/api/tg/connect/start', 'POST', { phone })
      setHandle(d.handle)
      setPhone(d.phone)
      setSent(was => readSentCode(d, was.round + 1))
      saveAttempt(
        browserStore(),
        { handle: d.handle, phone: d.phone, sent: readSentCode(d, 1) },
        Date.now()
      )
      setCode('')
      setStep('code')
    })

  /**
   * "Request a new code" is NOT a second login start.
   *
   * It used to call `startLogin`, which is `auth.sendCode` again: the same
   * code through the same channel, however often it was pressed. The resend
   * route continues the same attempt with `auth.resendCode`, which is the call
   * that moves Telegram to its next channel. The handle does not change.
   */
  const resendCode = () =>
    run(async () => {
      const d = await ask('/api/tg/connect/resend', 'POST', { handle })
      setSent(was => readSentCode(d, was.round + 1))
      saveAttempt(
        browserStore(),
        { handle, phone, sent: readSentCode(d, 1) },
        Date.now()
      )
      setCode('')
    })

  /**
   * THE WAY IN THAT WAITS FOR NO CODE.
   *
   * Telegram delivers a login code for our server only into the Telegram app,
   * and the owner spent two days learning what that means when it does not
   * come. A QR login has nothing to deliver: the person scans from the
   * Telegram they are already signed in to and confirms there.
   */
  const startQr = () =>
    run(async () => {
      const d = await ask('/api/tg/connect/qr/start', 'POST')
      // A code login left half-way is a different attempt: it is let go, so
      // coming back later does not resume a screen the person walked away from.
      clearAttempt(browserStore())
      setHandle(d.handle)
      setQrUrl(String(d.url ?? ''))
      setStep('qr')
    })

  useEffect(() => {
    if (step !== 'qr' || !handle) return
    let alive = true
    void runQrPoll({
      poll: () => ask('/api/tg/connect/qr/poll', 'POST', { handle }),
      wait: ms => new Promise(r => window.setTimeout(r, ms)),
      alive: () => alive,
      onUrl: setQrUrl,
      onTransientError: m => setError(inPlainWords(m)),
      isGone: attemptIsGone,
    }).then(end => {
      if (!alive) return
      if (end.kind === 'connected') {
        setError(null)
        setAccount(end.account ?? null)
        setConnected(true)
        setStep('connected')
      } else if (end.kind === 'password') {
        setError(null)
        setStep('password')
      } else if (end.kind === 'gone') {
        setError(inPlainWords(end.message))
        setStep('phone')
      }
    })
    return () => {
      alive = false
    }
    // `inPlainWords` and `attemptIsGone` are pure and defined in this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, handle, ask, setConnected])

  /** Absent outside Telegram, so the code screen does not draw the button. */
  const webApp = isTelegram() ? getWebApp() : null
  const openServiceChat =
    typeof webApp?.openTelegramLink === 'function'
      ? () => webApp.openTelegramLink(TELEGRAM_SERVICE_CHAT)
      : undefined

  if (step === 'checking') return null

  if (step === 'connected') {
    return (
      <section className="connect-tg">
        <h3>{t('connect.done.title')}</h3>
        {accountLabel(account) && (
          <p className="connect-tg__account">
            {t('connect.done.account', { name: accountLabel(account) })}
          </p>
        )}
        <p>{t('connect.done.body')}</p>
        <button
          type="button"
          className="connect-tg__off"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await ask('/api/tg/connect', 'DELETE')
              clearAttempt(browserStore())
              setAccount(null)
              setConnected(false)
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
        delivery={sent.delivery}
        emailPattern={sent.emailPattern}
        canResend={sent.canResend}
        resendAfter={sent.resendAfter}
        round={sent.round}
        code={code}
        onCode={setCode}
        busy={busy}
        error={error}
        onBack={() => {
          // A different number is a different login: the old one is let go.
          clearAttempt(browserStore())
          setError(null)
          setStep('phone')
        }}
        onResend={() => void resendCode()}
        onOpenChat={openServiceChat}
        onUseQr={() => void startQr()}
        onSubmit={() =>
          void run(async () => {
            const d = await ask('/api/tg/connect/code', 'POST', {
              handle,
              code,
            })
            setCode('')
            // Signed in, or on to the password: the code step is over either
            // way, and a finished attempt must not be resumed.
            clearAttempt(browserStore())
            if (!d['нужен_пароль']) setConnected(true)
            setStep(d['нужен_пароль'] ? 'password' : 'connected')
          })
        }
      />
    )
  }

  if (step === 'qr') {
    return (
      <ConnectQr
        url={qrUrl}
        error={error}
        canOpenHere={webApp?.platform === 'android'}
        onBack={() => {
          setError(null)
          setStep('phone')
        }}
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
              const d = await ask('/api/tg/connect/password', 'POST', {
                handle,
                password,
              })
              setAccount(d.account ?? null)
              setPassword('')
              setConnected(true)
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

      {/*
        THE SECOND DOOR, ON THE FIRST SCREEN.

        Offered here and not only after a code has failed to come: a person who
        already knows codes do not reach them should not have to request one
        more to find the way round. Secondary on purpose -- for most people the
        code is one tap and the QR needs a second screen.
      */}
      <button
        type="button"
        className="connect-tg__qr"
        disabled={busy}
        onClick={() => void startQr()}
      >
        {t('connect.qr.offer')}
      </button>
      <p className="connect-tg__hint">{t('connect.qr.offerHint')}</p>
    </section>
  )
}
