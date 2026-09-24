import { useEffect, useState } from 'react'
import { useLanguage } from '@/hooks/useLanguage'
import type { SendCard } from '@/atoms/agentChat'
import { answerSendCard } from '@/lib/agentStream'
import { toAbsoluteUrl } from '@/lib/mediaUrl'
import './SendCardView.css'

/**
 * A MESSAGE FOR A CLIENT, APPROVED WHERE IT WAS PREPARED.
 *
 * Owner, 2026-09-24: "I try to get Farisha's photo for approval so I can
 * send it to her, and I cannot work with the client properly." The agent
 * drew the portrait and prepared the send; the server put the card, with
 * its one-time secret, on this chat's stream -- and the app dropped it. The
 * agent then said "open @t27ai_bot and press Send there", which is a second
 * app for the one decision this screen exists for.
 *
 * Now the card is here, under the answer that made it: WHO it goes to, the
 * picture or video itself, the words, and two presses. Sending uses the
 * same door as the bot's button, so the rule is the same: nothing reaches
 * the client without the owner's press, and a card answered in the bot is
 * refused here (the secret is spent) rather than sent twice.
 */
export function SendCardView({
  card,
  onChange,
}: {
  card: SendCard
  onChange: (next: SendCard) => void
}) {
  const { t } = useLanguage()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (card.state !== 'waiting' || !card.expiresAt) return
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [card.state, card.expiresAt])

  const expired =
    card.state === 'waiting' && card.expiresAt ? now > card.expiresAt : false
  const who = card.display || card.target
  const minutesLeft =
    card.expiresAt && !expired
      ? Math.max(1, Math.round((card.expiresAt - now) / 60000))
      : null

  const press = async (send: boolean) => {
    onChange({ ...card, state: 'sending', error: undefined })
    const r = await answerSendCard(card, send)
    onChange(
      r.ok
        ? { ...card, state: send ? 'sent' : 'cancelled', error: undefined }
        : { ...card, state: 'failed', error: r.error }
    )
  }

  const m = card.media
  return (
    <div className="send-card" data-state={expired ? 'expired' : card.state}>
      <div className="send-card__head">
        <span className="send-card__label">{t('sendCard.title')}</span>
        <b>→ {who}</b>
      </div>

      {m ? (
        <div className="send-card__media">
          {m.kind === 'photo' ? (
            <img src={toAbsoluteUrl(m.url)} alt="" />
          ) : m.kind === 'video' || m.kind === 'video_note' ? (
            <video src={toAbsoluteUrl(m.url)} controls playsInline />
          ) : m.kind === 'voice' ? (
            <audio src={toAbsoluteUrl(m.url)} controls />
          ) : m.kind === 'album' ? (
            <div className="send-card__album">
              {m.urls.map(u => (
                <img key={u} src={toAbsoluteUrl(u)} alt="" />
              ))}
            </div>
          ) : (
            <a href={toAbsoluteUrl(m.url)} target="_blank" rel="noreferrer">
              📎 {(m.kind === 'document' && m.fileName) || t('sendCard.file')}
            </a>
          )}
        </div>
      ) : null}

      {card.what ? <p className="send-card__text">{card.what}</p> : null}

      {card.state === 'sent' ? (
        <p className="send-card__done">✓ {t('sendCard.sent', { who })}</p>
      ) : card.state === 'cancelled' ? (
        <p className="send-card__muted">{t('sendCard.cancelled')}</p>
      ) : expired ? (
        <p className="send-card__muted">{t('sendCard.expired')}</p>
      ) : (
        <>
          {card.state === 'failed' ? (
            <p className="send-card__error">
              {t('sendCard.failed')}: {card.error}
            </p>
          ) : null}
          <div className="send-card__acts">
            <button
              type="button"
              className="send-card__cancel"
              disabled={card.state === 'sending'}
              onClick={() => void press(false)}
            >
              {t('sendCard.cancel')}
            </button>
            <button
              type="button"
              className="send-card__send"
              disabled={card.state === 'sending'}
              onClick={() => void press(true)}
            >
              {card.state === 'sending' ? '…' : t('sendCard.send', { who })}
            </button>
          </div>
          {minutesLeft !== null ? (
            <p className="send-card__muted">
              {t('sendCard.left', { n: minutesLeft })}
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
