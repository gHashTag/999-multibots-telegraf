import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '@/hooks/useLanguage'
import './ConnectCode.css'

/**
 * THE CODE SCREEN, ON ITS OWN.
 *
 * The owner: "the login needs a separately laid out screen for the code, so
 * people are not scared off by the complexity -- this is the main function of
 * the bot, a personal assistant and a CRM".
 *
 * It used to be a fragment inside the connect form, which meant the five-line
 * consent list about reading your correspondence stayed on screen WHILE the
 * person typed a login code. That is the worst possible moment for it: the
 * decision was already taken one screen earlier, and re-reading "the agent can
 * read your dialogs" at the exact second you hand over a credential reads as a
 * warning, not as information. People stop there.
 *
 * So: one screen, one job. Where the code went, a field shaped like the code
 * itself, and a way back if the number was wrong.
 *
 * ── WHY THE CELLS ARE A COSTUME OVER ONE REAL INPUT ────────────────────────
 *
 * Five separate <input>s is the usual way, and it breaks the things people
 * actually do: pasting a code lands one digit in one box, one-time-code
 * autofill has nothing to fill, backspace across a boundary does nothing, and
 * a screen reader announces five unlabelled fields. Here a single real input
 * spans the row, invisible, and the cells beneath merely display its
 * characters -- so paste, autofill, backspace, IME and selection stay native
 * and free.
 *
 * ── WHY NOTHING SUBMITS BY ITSELF ──────────────────────────────────────────
 *
 * A five-digit code is the common case, not a promise: Telegram may send four
 * to seven, and `нормализоватьКод` on the server accepts that whole range. The
 * length is not returned by GramJS's `sendCode`, so auto-submitting at five
 * digits would guess -- and a wrong guess shows a red error to somebody who
 * did nothing wrong, on the screen where fear costs the most. The button is
 * big, always visible, and always the person's own decision.
 */

const MIN_CELLS = 5
const MAX_DIGITS = 7

/** Seconds before the person may ask Telegram for another code. */
const RESEND_AFTER_S = 60

export interface ConnectCodeProps {
  phone: string
  /** Did Telegram deliver the code inside the app, or by SMS? */
  viaApp: boolean
  code: string
  onCode: (v: string) => void
  busy: boolean
  error: string | null
  onSubmit: () => void
  onBack: () => void
  onResend: () => void
}

export function ConnectCode(props: ConnectCodeProps) {
  const { t } = useLanguage()
  const field = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  const [left, setLeft] = useState(RESEND_AFTER_S)

  useEffect(() => {
    if (left <= 0) return
    const id = window.setInterval(() => setLeft(s => (s > 0 ? s - 1 : 0)), 1000)
    return () => window.clearInterval(id)
  }, [left])

  const digits = props.code
  const cells = Math.max(MIN_CELLS, digits.length)
  const ready = digits.length >= 4 && !props.busy

  return (
    <section className="tg-code">
      <header className="tg-code__top">
        <button
          type="button"
          className="tg-code__back"
          onClick={props.onBack}
          disabled={props.busy}
        >
          {/* An arrow plus the word: an arrow alone is a guess, and this is
              the only way out of the screen if the number was mistyped. */}
          <span aria-hidden="true">←</span> {t('connect.back')}
        </button>
        <span className="tg-code__step">
          {t('connect.step', { n: 2, total: 2 })}
        </span>
      </header>

      <h3 className="tg-code__title">{t('connect.code.title')}</h3>

      {/*
        WHERE THE CODE WENT, AS A FACT RATHER THAN A GUESS.

        The old screen asserted "the code was sent to Telegram". Telegram
        chooses between an in-app message and an SMS by itself, so when it
        chose SMS the sentence was simply false, and the person scrolled their
        chats looking for something that was in their notification shade. The
        server now passes `isCodeViaApp` through, so this line reports.
      */}
      <p className="tg-code__where">
        {props.viaApp ? t('connect.code.viaApp') : t('connect.code.viaSms')}{' '}
        <span className="tg-code__phone">
          {t('connect.code.to', { phone: props.phone })}
        </span>
      </p>

      <button
        type="button"
        className="tg-code__change"
        onClick={props.onBack}
        disabled={props.busy}
      >
        {t('connect.code.change')}
      </button>

      <div
        className={`tg-code__field${focused ? ' is-focused' : ''}`}
        onClick={() => field.current?.focus()}
      >
        {Array.from({ length: cells }, (_, i) => (
          <span
            key={i}
            className={
              'tg-code__cell' +
              (digits[i] ? ' is-filled' : '') +
              /*
               * The next cell is marked WHETHER OR NOT the field has focus.
               *
               * Screenshotted on a phone-sized viewport: an empty, unfocused
               * row is five identical dark slabs with nothing saying where to
               * start -- it reads as a disabled control, and the keyboard does
               * not always open by itself inside a Mini App webview. The
               * marker is dimmer without focus and full strength with it, so
               * it invites first and confirms second.
               */
              (i === Math.min(digits.length, cells - 1) && !digits[i]
                ? ' is-next'
                : '')
            }
            aria-hidden="true"
          >
            {digits[i] ?? ''}
          </span>
        ))}
        <input
          ref={field}
          className="tg-code__input"
          value={digits}
          onChange={e =>
            props.onCode(e.target.value.replace(/\D/g, '').slice(0, MAX_DIGITS))
          }
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={e => {
            if (e.key === 'Enter' && ready) props.onSubmit()
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          aria-label={t('connect.code.label')}
        />
      </div>

      {props.error && <p className="tg-code__error">{props.error}</p>}

      <button
        type="button"
        className="tg-code__go"
        disabled={!ready}
        onClick={props.onSubmit}
      >
        {props.busy ? t('connect.code.going') : t('connect.code.go')}
      </button>

      {/*
        The warning sits BELOW the action, deliberately. Above the field it
        reads as an accusation at the moment of typing; below it, it is the
        thing to remember afterwards -- and "us included" is the part that
        matters, because we are the ones who could plausibly ask.
      */}
      <p className="tg-code__warn">{t('connect.code.warn')}</p>

      {left > 0 ? (
        <p className="tg-code__resend is-waiting">
          {t('connect.code.resendIn', { sec: left })}
        </p>
      ) : (
        <button
          type="button"
          className="tg-code__resend"
          disabled={props.busy}
          onClick={() => {
            setLeft(RESEND_AFTER_S)
            props.onResend()
          }}
        >
          {t('connect.code.resend')}
        </button>
      )}
    </section>
  )
}
