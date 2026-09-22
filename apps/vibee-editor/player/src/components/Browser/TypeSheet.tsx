import { useEffect, useRef, useState } from 'react'
import './TypeSheet.css'
import { useLanguage } from '@/hooks/useLanguage'
import {
  readBrowserFocus,
  typeInBrowser,
  isSecretField,
  type BrowserFocus,
  type InputRequestView,
} from '@/lib/remoteBrowser'

/** How often the sheet asks where the text would go, while it is open. */
export const FOCUS_POLL_MS = 1500

type T = (key: string, vars?: Record<string, string | number>) => string

/** "the Password field on accounts.google.com", in the person's language. Pure. */
export function whereItGoes(focus: BrowserFocus | null, t: T): string {
  if (!focus || focus.field === 'none') return t('browser.type.noField')
  const kind =
    focus.field === 'password'
      ? t('browser.type.kind.password')
      : focus.field === 'email'
        ? t('browser.type.kind.email')
        : t('browser.type.kind.text')
  const label = focus.label ? ` «${focus.label}»` : ''
  return t('browser.type.target', { kind, label, host: focus.host || '—' })
}

/**
 * TYPE ON THE PHONE, LAND IN THE BROWSER.
 *
 * The phone's own keyboard, paste and autocorrect, in a plain field; the
 * words go into whichever field has focus in the person's browser
 * (render/src/browser/person-type.ts). It says where BEFORE sending, hides
 * a password as it is typed, and forgets the text the moment it is sent.
 */
export function TypeSheet({
  onClose,
  request = null,
}: {
  onClose: () => void
  /** The agent is waiting for this (render input-request.ts). */
  request?: InputRequestView | null
}) {
  const { t } = useLanguage()
  const [focus, setFocus] = useState<BrowserFocus | null>(null)
  const [text, setText] = useState('')
  const [shown, setShown] = useState(false)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ ok: boolean; line: string } | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    const look = async () => {
      const f = await readBrowserFocus()
      if (alive) setFocus(f)
    }
    void look()
    const timer = window.setInterval(() => void look(), FOCUS_POLL_MS)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [])

  const secret = isSecretField(focus) || request?.kind === 'password'
  const canSend = !busy && (text.length > 0 || focus?.field !== 'none')

  const send = async (enter: boolean) => {
    if (busy) return
    setBusy(true)
    setSaid(null)
    const n = text.length
    const out = await typeInBrowser(text, enter)
    setBusy(false)
    if (out.ok) {
      /* Gone from the phone as soon as it is in the browser. */
      setText('')
      setShown(false)
      setSaid({ ok: true, line: t('browser.type.done', { n }) })
      if (out.focus) setFocus(out.focus)
      input.current?.focus()
    } else {
      setSaid({
        ok: false,
        line:
          out.reason === 'no-field'
            ? t('browser.type.noField')
            : t('browser.type.failed'),
      })
    }
  }

  return (
    <section className="type-sheet" aria-labelledby="type-sheet-title">
      <header className="type-sheet__head">
        <h2 id="type-sheet-title">{t('browser.type.title')}</h2>
        <button
          type="button"
          className="type-sheet__close"
          aria-label={t('browser.type.close')}
          onClick={onClose}
        >
          ×
        </button>
      </header>

      {request ? (
        <p className="type-sheet__ask" role="status">
          <b>{t(`browser.type.ask.${request.kind}`)}</b>
          {request.why ? <span>{request.why}</span> : null}
        </p>
      ) : null}

      <p
        className={
          focus && focus.field !== 'none'
            ? 'type-sheet__target'
            : 'type-sheet__target type-sheet__target--none'
        }
        aria-live="polite"
      >
        {whereItGoes(focus, t)}
      </p>

      <form
        className="type-sheet__row"
        onSubmit={e => {
          e.preventDefault()
          void send(true)
        }}
      >
        <input
          ref={input}
          className="type-sheet__input"
          type={secret && !shown ? 'password' : 'text'}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            /* The phone's "send" key: never left to implicit form submission. */
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void send(true)
            }
          }}
          placeholder={t('browser.type.placeholder')}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="send"
          aria-label={t('browser.type.placeholder')}
        />
        {secret ? (
          <button
            type="button"
            className="type-sheet__eye"
            aria-pressed={shown}
            aria-label={shown ? t('browser.type.hide') : t('browser.type.show')}
            onClick={() => setShown(v => !v)}
          >
            {shown ? '◉' : '◎'}
          </button>
        ) : null}
      </form>

      <div className="type-sheet__buttons">
        <button
          type="button"
          className="type-sheet__btn"
          disabled={!canSend || text.length === 0}
          onClick={() => void send(false)}
        >
          {t('browser.type.put')}
        </button>
        <button
          type="button"
          className="type-sheet__btn type-sheet__btn--go"
          disabled={!canSend}
          onClick={() => void send(true)}
        >
          {t('browser.type.putEnter')}
        </button>
      </div>

      {said ? (
        <p
          className={said.ok ? 'type-sheet__said' : 'type-sheet__said is-error'}
          role="status"
        >
          {said.line}
        </p>
      ) : (
        <p className="type-sheet__note">{t('browser.type.privacy')}</p>
      )}
    </section>
  )
}
