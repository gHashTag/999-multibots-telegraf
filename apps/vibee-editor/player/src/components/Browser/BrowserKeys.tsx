import { useState } from 'react'
import './BrowserKeys.css'
import { useLanguage } from '@/hooks/useLanguage'
import {
  pressInBrowser,
  answerApproval,
  chooseInBrowser,
  type PendingApproval,
  type InputRequestView,
} from '@/lib/remoteBrowser'

/**
 * THE KEYS A PHONE CANNOT SEND THROUGH THE PICTURE.
 *
 * A swipe on the stream moves the remote mouse; it does not scroll. So a
 * page whose buttons sit below the edge could not be finished from a phone
 * (owner, 2026-09-22). Five keys, always under the picture.
 */
export function BrowserKeys() {
  const { t } = useLanguage()
  const [busy, setBusy] = useState(false)
  const press = async (what: Parameters<typeof pressInBrowser>[0]) => {
    if (busy) return
    setBusy(true)
    await pressInBrowser(what)
    setBusy(false)
  }
  return (
    <div
      className="browser-keys"
      role="toolbar"
      aria-label={t('browser.keys.label')}
    >
      <button
        type="button"
        disabled={busy}
        aria-label={t('browser.keys.up')}
        onClick={() => void press({ scroll: 'up' })}
      >
        ▲
      </button>
      <button
        type="button"
        disabled={busy}
        aria-label={t('browser.keys.down')}
        onClick={() => void press({ scroll: 'down' })}
      >
        ▼
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void press({ key: 'Tab' })}
      >
        Tab ⇥
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void press({ key: 'Escape' })}
      >
        Esc
      </button>
      {/* Tab to a page's button, Enter presses it: "Save" without a tap. */}
      <button
        type="button"
        disabled={busy}
        className="browser-keys__enter"
        onClick={() => void press({ key: 'Enter' })}
      >
        Enter ⏎
      </button>
    </div>
  )
}

/**
 * THE AGENT'S QUESTION, ON THE SCREEN WHERE THE PERSON IS LOOKING.
 *
 * It used to be a Telegram message only; the owner watched the agent stand
 * still and never saw why. Allow opens the guarded page to the agent for a
 * few minutes; Decline is final for this question.
 */
export function AskedPermission({
  approval,
  onAnswered,
}: {
  approval: PendingApproval
  onAnswered: () => void
}) {
  const { t } = useLanguage()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const answer = async (allow: boolean) => {
    setBusy(true)
    const ok = await answerApproval(approval.id, allow)
    setBusy(false)
    setFailed(!ok)
    if (ok) onAnswered()
  }
  return (
    <section
      className="asked-permission"
      role="alertdialog"
      aria-labelledby="asked-permission-title"
    >
      <h2 id="asked-permission-title">{t('browser.ask.title')}</h2>
      <p className="asked-permission__what">«{approval.what}»</p>
      <div className="asked-permission__buttons">
        <button
          type="button"
          className="asked-permission__no"
          disabled={busy}
          onClick={() => void answer(false)}
        >
          {t('browser.ask.deny')}
        </button>
        <button
          type="button"
          className="asked-permission__yes"
          disabled={busy}
          onClick={() => void answer(true)}
        >
          {t('browser.ask.allow')}
        </button>
      </div>
      <p className="asked-permission__note">
        {failed ? t('browser.ask.failed') : t('browser.ask.note')}
      </p>
    </section>
  )
}

/**
 * THE AGENT NEEDS A DECISION, OR A HAND (render input-request.ts).
 *
 * choice: the agent's own options as buttons ("Skip" / "Save").
 * action: something only the person can do -- a captcha, a push on their
 * phone, a QR code -- done in the window above, then Done or Cannot.
 */
export function AskedChoice({
  request,
  onAnswered,
}: {
  request: InputRequestView
  onAnswered: () => void
}) {
  const { t } = useLanguage()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const action = request.kind === 'action'
  const pick = async (option: string) => {
    setBusy(true)
    const ok = await chooseInBrowser(request.id, option)
    setBusy(false)
    setFailed(!ok)
    if (ok) onAnswered()
  }
  const labelOf = (o: string) =>
    action
      ? o === 'done'
        ? t('browser.choice.done')
        : t('browser.choice.cannot')
      : o
  return (
    <section
      className="asked-permission asked-choice"
      role="alertdialog"
      aria-labelledby="asked-choice-title"
    >
      <h2 id="asked-choice-title">
        {action ? t('browser.choice.actionTitle') : t('browser.choice.title')}
      </h2>
      <p className="asked-permission__what">{request.why}</p>
      {action ? (
        <p className="asked-permission__note">
          {t('browser.choice.actionHint')}
        </p>
      ) : null}
      <div
        className={
          request.options.length > 2
            ? 'asked-choice__list'
            : 'asked-permission__buttons'
        }
      >
        {request.options.map((o, i) => (
          <button
            key={o}
            type="button"
            disabled={busy}
            className={
              (action ? o === 'done' : i === 0)
                ? 'asked-permission__yes'
                : 'asked-permission__no'
            }
            onClick={() => void pick(o)}
          >
            {labelOf(o)}
          </button>
        ))}
      </div>
      {failed ? (
        <p className="asked-permission__note">{t('browser.ask.failed')}</p>
      ) : null}
    </section>
  )
}
