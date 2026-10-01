/**
 * Voice mode, full screen: the mark in the middle, what was heard and what is
 * being said under it, the visual and the voice to choose at the bottom.
 *
 * The session is created and started by the tap that opened this (see
 * Chat.tsx): this component only shows it and lets it be steered.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { useAtom } from 'jotai'
import { useLanguage } from '@/hooks/useLanguage'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { getWebApp, isTelegram } from '@/lib/telegram'
import type { VoiceSession } from '@/lib/voice/session'
import { isMicError, micErrorText } from '@/lib/voice/micError'
import {
  fetchVoiceStatus,
  voiceLabel,
  type VoiceStatus,
} from '@/lib/voice/voiceApi'
import {
  VOICE_MODES,
  voiceModeAtom,
  voiceNameAtom,
  type VoiceMode,
} from '@/lib/voice/chatVoice'
import { VoiceOrb } from './VoiceOrb'
import './Voice.css'

interface Props {
  session: VoiceSession
  onClose: () => void
}

/**
 * A WebView that will not hand over the microphone is a dead end inside
 * Telegram; the same page in the phone's browser asks for it normally.
 */
function openInBrowser(): void {
  const url = `${window.location.origin}${window.location.pathname}`
  const wa = getWebApp()
  if (wa && typeof wa.openLink === 'function') wa.openLink(url)
  else window.open(url, '_blank', 'noopener')
}

export function VoiceOverlay({ session, onClose }: Props) {
  const { t, lang } = useLanguage()
  const snap = useSyncExternalStore(session.subscribe, () => session.snapshot)
  const [mode, setMode] = useAtom(voiceModeAtom)
  const [names, setNames] = useAtom(voiceNameAtom)
  const [status, setStatus] = useState<VoiceStatus | null>(null)
  const reducedMotion = useReducedMotion()
  const [inTelegram] = useState(isTelegram)

  useEffect(() => {
    void fetchVoiceStatus().then(setStatus)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const voices = status?.voices[lang] ?? []
  const chosen = names[lang] ?? voices[0] ?? ''
  const micFailed = snap.phase === 'error' && isMicError(snap.error)

  const restart = () => void session.start()
  const onOrb = () => {
    if (snap.phase === 'error' || snap.phase === 'off') restart()
    else session.interrupt()
  }

  return (
    <div
      className={`voice-overlay voice-overlay--${snap.phase}${snap.keyboard ? ' voice-overlay--keyboard' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={t('voice.title')}
    >
      <div className="voice-overlay__bg" aria-hidden="true" />

      <div className="voice-overlay__top">
        <button
          type="button"
          className="voice-overlay__icon"
          onClick={onClose}
          aria-label={t('voice.close')}
          data-testid="voice-close"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <span className="voice-overlay__title">{t('voice.title')}</span>
        <button
          type="button"
          className={`voice-overlay__icon${snap.muted ? ' is-on' : ''}`}
          onClick={() => session.toggleMute()}
          aria-pressed={snap.muted}
          aria-label={snap.muted ? t('voice.unmute') : t('voice.mute')}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
            {snap.muted ? <path d="M4 4l16 16" /> : null}
          </svg>
        </button>
      </div>

      <div className="voice-overlay__stage">
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

      <div className="voice-overlay__captions" aria-live="polite">
        <p
          className={`voice-overlay__phase voice-overlay__phase--${snap.phase}`}
        >
          <span className="voice-overlay__dot" aria-hidden="true" />
          {snap.muted ? t('voice.muted') : t(`voice.phase.${snap.phase}`)}
        </p>
        {snap.error && snap.phase !== 'error' ? (
          // A passing miss ("say it again"): a hint, not an alarm.
          <p className="voice-overlay__hint">{t(snap.error)}</p>
        ) : null}
        {snap.error && snap.phase === 'error' ? (
          <div className="voice-overlay__alert" role="alert">
            <p className="voice-overlay__error">
              {t(micErrorText(snap.error, inTelegram))}
            </p>
            {micFailed ? (
              <div className="voice-overlay__actions">
                <button
                  type="button"
                  // Outside Telegram it is the only way forward, so it leads.
                  className={`voice-overlay__action${inTelegram ? '' : ' voice-overlay__action--primary'}`}
                  onClick={restart}
                  data-testid="voice-retry"
                >
                  {t('voice.retry')}
                </button>
                {inTelegram ? (
                  <button
                    type="button"
                    className="voice-overlay__action voice-overlay__action--primary"
                    onClick={openInBrowser}
                    data-testid="voice-open-browser"
                  >
                    {t('voice.openBrowser')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        {snap.keyboard ? (
          <TypeInstead onSend={text => session.type(text)} />
        ) : null}
        {snap.heard ? (
          <p className="voice-overlay__line">
            <span className="voice-overlay__who">{t('voice.you')}</span>
            {snap.heard}
          </p>
        ) : null}
        {snap.saying ? (
          <p className="voice-overlay__line voice-overlay__line--agent">
            <span className="voice-overlay__who">{t('voice.agent')}</span>
            {snap.saying}
          </p>
        ) : null}
        {snap.fallbackVoice ? (
          <p className="voice-overlay__note">{t('voice.deviceVoice')}</p>
        ) : null}
      </div>

      <div className="voice-overlay__controls">
        <div
          className="voice-overlay__modes"
          role="radiogroup"
          aria-label={t('voice.mode')}
        >
          {VOICE_MODES.map(m => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              className={`voice-mode${mode === m ? ' is-active' : ''}`}
              onClick={() => setMode(m)}
            >
              <ModeIcon mode={m} />
              <span>{t(`voice.mode.${m}`)}</span>
            </button>
          ))}
        </div>
        {voices.length > 1 ? (
          <label className="voice-overlay__voice">
            <span>{t('voice.voice')}</span>
            <select
              value={chosen}
              onChange={e => setNames({ ...names, [lang]: e.target.value })}
            >
              {voices.map(v => (
                <option key={v} value={v}>
                  {voiceLabel(v)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </div>
  )
}

/** No microphone: the question is typed, and the answer still comes aloud. */
function TypeInstead({ onSend }: { onSend: (text: string) => void }) {
  const { t } = useLanguage()
  const [text, setText] = useState('')
  return (
    <form
      className="voice-overlay__type"
      onSubmit={e => {
        e.preventDefault()
        if (!text.trim()) return
        onSend(text)
        setText('')
      }}
    >
      <label className="voice-overlay__note" htmlFor="voice-type-input">
        {t('voice.type.label')}
      </label>
      <div className="voice-overlay__type-row">
        <input
          id="voice-type-input"
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={t('voice.type.placeholder')}
          enterKeyHint="send"
          autoComplete="off"
          data-testid="voice-type-input"
        />
        <button
          type="submit"
          className="voice-overlay__action voice-overlay__action--primary"
          disabled={!text.trim()}
          data-testid="voice-type-send"
        >
          {t('voice.type.send')}
        </button>
      </div>
    </form>
  )
}

/** A small drawing of each visual, so the switcher reads at a glance. */
function ModeIcon({ mode }: { mode: VoiceMode }) {
  return (
    <svg className="voice-mode__icon" viewBox="0 0 24 24" aria-hidden="true">
      {mode === 'pulse' ? (
        <>
          <circle cx="12" cy="12" r="3" />
          <circle cx="12" cy="12" r="6.5" opacity="0.6" />
          <circle cx="12" cy="12" r="10" opacity="0.3" />
        </>
      ) : mode === 'spectrum' ? (
        <path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4" />
      ) : mode === 'orbit' ? (
        <>
          <circle cx="12" cy="12" r="3" />
          <ellipse
            cx="12"
            cy="12"
            rx="10"
            ry="4"
            transform="rotate(-20 12 12)"
          />
        </>
      ) : mode === 'hologram' ? (
        <path d="M4 6h16M4 10h16M4 14h16M4 18h16" opacity="0.8" />
      ) : (
        <path d="M12 3l3 5h-6zM5 13l3 4H3zM19 12l2 4h-5zM11 15l2 6h-4z" />
      )}
    </svg>
  )
}
