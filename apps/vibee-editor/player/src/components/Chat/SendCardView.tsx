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
/**
 * A PREVIEW THAT DID NOT LOAD, ON THE ONE CARD WHERE HIDING IT IS WRONG.
 *
 * Everywhere else in this app a broken picture is quietly replaced -- by
 * initials, or by nothing. Here the picture IS the thing being approved: an
 * attachment that fails to render and says nothing leaves the owner pressing
 * Send on a message whose contents he cannot see.
 *
 * So this one speaks, and it speaks carefully. It does NOT promise that the
 * send will work: the preview failing in this browser says nothing certain
 * about what the server holds. It says the preview did not open and offers
 * the link, which is the one thing the owner can act on before deciding.
 */
function SendPreview({
  url,
  kind,
}: {
  url: string
  kind: 'photo' | 'video' | 'voice'
}) {
  const { t } = useLanguage()
  const [broken, setBroken] = useState(false)
  if (broken) {
    return (
      <p className="send-card__broken" role="status">
        {t('sendCard.previewBroken')}{' '}
        <a href={url} target="_blank" rel="noreferrer">
          {t('sendCard.previewOpen')}
        </a>
      </p>
    )
  }
  if (kind === 'photo')
    return <img src={url} alt="" onError={() => setBroken(true)} />
  if (kind === 'video')
    return (
      <video src={url} controls playsInline onError={() => setBroken(true)} />
    )
  return <audio src={url} controls onError={() => setBroken(true)} />
}

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
            <SendPreview url={toAbsoluteUrl(m.url)} kind="photo" />
          ) : m.kind === 'video' || m.kind === 'video_note' ? (
            <SendPreview url={toAbsoluteUrl(m.url)} kind="video" />
          ) : m.kind === 'voice' ? (
            <SendPreview url={toAbsoluteUrl(m.url)} kind="voice" />
          ) : m.kind === 'album' ? (
            <div className="send-card__album">
              {m.urls.map(u => (
                <SendPreview key={u} url={toAbsoluteUrl(u)} kind="photo" />
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
