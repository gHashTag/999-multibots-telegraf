import { useState } from 'react'
import './BrowserKeys.css'
import { useLanguage } from '@/hooks/useLanguage'
import {
  pressInBrowser,
  answerApproval,
  type PendingApproval,
} from '@/lib/remoteBrowser'

/**
 * THE KEYS A PHONE CANNOT SEND THROUGH THE PICTURE.
 *
 * A swipe on the stream moves the remote mouse; it does not scroll. So a
 * page whose buttons sit below the edge could not be finished from a phone
 * (owner, 2026-09-22). Four keys, always under the picture.
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
