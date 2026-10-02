/**
 * VOICE MODE INSIDE THE CHAT (owner, 2026-10-02: "why is the voice agent not
 * in the context of the chat?").
 *
 * The session always sent into the open conversation, but the full-screen
 * overlay covered it: what was said, the cards, the earlier answers -- the
 * very context the person talks about -- were out of sight until voice mode
 * was closed. ChatGPT had the same complaint and moved its voice into the
 * chat on 2025-11-25, keeping the separate screen as a setting. So does
 * this: a bar above the chat's own box, the conversation in view and
 * scrolling as it grows, the box still taking typed questions (answered
 * aloud), and the full screen one tap away.
 */
import { useSyncExternalStore } from 'react'
import { useAtomValue } from 'jotai'
import { useLanguage } from '@/hooks/useLanguage'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { isTelegram } from '@/lib/telegram'
import type { VoiceSession } from '@/lib/voice/session'
import { isMicError, micErrorText } from '@/lib/voice/micError'
import { openInBrowser } from '@/lib/voice/openInBrowser'
import { voiceModeAtom } from '@/lib/voice/chatVoice'
import { VoiceOrb } from './VoiceOrb'
import './Voice.css'

interface Props {
  session: VoiceSession
  onClose: () => void
  onExpand: () => void
}

export function VoiceDock({ session, onClose, onExpand }: Props) {
  const { t } = useLanguage()
  const snap = useSyncExternalStore(session.subscribe, () => session.snapshot)
  const mode = useAtomValue(voiceModeAtom)
  const reducedMotion = useReducedMotion()
  const inTelegram = isTelegram()
  const failed = snap.phase === 'error' && !snap.keyboard
  const micFailed = failed && isMicError(snap.error)
  const answering = snap.phase === 'thinking' || snap.phase === 'speaking'

  const onOrb = () => {
    if (snap.phase === 'error' || snap.phase === 'off') void session.start()
    else session.interrupt()
  }

  return (
    <section
      className={`voice-dock voice-dock--${snap.phase}`}
      aria-label={t('voice.title')}
      data-testid="voice-dock"
    >
      <div className="voice-dock__orb">
        <VoiceOrb
          getAnalyser={() => session.analyser()}
          phase={snap.phase}
          mode={mode}
          syntheticVoice={snap.fallbackVoice}
          reducedMotion={reducedMotion}
          onTap={onOrb}
          label={t('voice.orb')}
        />
      </div>

      <div className="voice-dock__text" aria-live="polite">
        <p className="voice-dock__phase">
          {snap.muted
            ? t('voice.muted')
            : snap.keyboard
              ? t('voice.type.label')
              : t(`voice.phase.${snap.phase}`)}
        </p>
        {failed && snap.error ? (
          <p className="voice-dock__error" role="alert">
            {t(micErrorText(snap.error, inTelegram))}
          </p>
        ) : snap.error && snap.phase !== 'error' ? (
          <p className="voice-dock__line">{t(snap.error)}</p>
        ) : snap.heard && !answering ? (
          // What the agent says is the chat's own last message, right above.
          <p className="voice-dock__line">{snap.heard}</p>
        ) : null}
      </div>

      <div className="voice-dock__buttons">
        {answering ? (
          <button
            type="button"
            className="voice-dock__btn"
            onClick={() => session.interrupt()}
            aria-label={t('voice.stop')}
            title={t('voice.stop')}
            data-testid="voice-stop"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="7" y="7" width="10" height="10" rx="2" />
            </svg>
          </button>
        ) : null}
        {micFailed && inTelegram ? (
          <button
            type="button"
            className="voice-dock__btn voice-dock__btn--wide"
            onClick={openInBrowser}
            data-testid="voice-open-browser"
          >
            {t('voice.openBrowser')}
          </button>
        ) : null}
        {!snap.keyboard ? (
          <button
            type="button"
            className={`voice-dock__btn${snap.muted ? ' is-on' : ''}`}
            onClick={() => session.toggleMute()}
            aria-pressed={snap.muted}
            aria-label={snap.muted ? t('voice.unmute') : t('voice.mute')}
            title={snap.muted ? t('voice.unmute') : t('voice.mute')}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
              {snap.muted ? <path d="M4 4l16 16" /> : null}
            </svg>
          </button>
        ) : null}
        <button
          type="button"
          className="voice-dock__btn"
          onClick={onExpand}
          aria-label={t('voice.expand')}
          title={t('voice.expand')}
          data-testid="voice-expand"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          </svg>
        </button>
        <button
          type="button"
          className="voice-dock__btn voice-dock__btn--end"
          onClick={onClose}
          data-testid="voice-close"
        >
          {t('voice.end')}
        </button>
      </div>
    </section>
  )
}
