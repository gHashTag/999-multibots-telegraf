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
import type { VoiceSession } from '@/lib/voice/session'
import {
  fetchVoiceStatus,
  voiceLabel,
  type VoiceStatus,
} from '@/lib/voice/voiceApi'
import {
  VOICE_MODES,
  voiceModeAtom,
  voiceNameAtom,
} from '@/lib/voice/chatVoice'
import { VoiceOrb } from './VoiceOrb'
import './Voice.css'

interface Props {
  session: VoiceSession
  onClose: () => void
}

export function VoiceOverlay({ session, onClose }: Props) {
  const { t, lang } = useLanguage()
  const snap = useSyncExternalStore(session.subscribe, () => session.snapshot)
  const [mode, setMode] = useAtom(voiceModeAtom)
  const [names, setNames] = useAtom(voiceNameAtom)
  const [status, setStatus] = useState<VoiceStatus | null>(null)
  const reducedMotion = useReducedMotion()

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

  const onOrb = () => {
    if (snap.phase === 'error' || snap.phase === 'off') void session.start()
    else session.interrupt()
  }

  return (
    <div
      className="voice-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('voice.title')}
    >
      <div className="voice-overlay__top">
        <button
          type="button"
          className="voice-overlay__icon"
          onClick={onClose}
          aria-label={t('voice.close')}
          data-testid="voice-close"
        >
          ✕
        </button>
        <span className="voice-overlay__title">{t('voice.title')}</span>
        <button
          type="button"
          className={`voice-overlay__icon${snap.muted ? ' is-on' : ''}`}
          onClick={() => session.toggleMute()}
          aria-pressed={snap.muted}
          aria-label={snap.muted ? t('voice.unmute') : t('voice.mute')}
        >
          {snap.muted ? '🔇' : '🎙'}
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
          {snap.muted ? t('voice.muted') : t(`voice.phase.${snap.phase}`)}
        </p>
        {snap.error ? (
          <p className="voice-overlay__error">{t(snap.error)}</p>
        ) : null}
        {snap.heard ? (
          <p className="voice-overlay__line">
            <b>{t('voice.you')}:</b> {snap.heard}
          </p>
        ) : null}
        {snap.saying ? (
          <p className="voice-overlay__line voice-overlay__line--agent">
            <b>{t('voice.agent')}:</b> {snap.saying}
          </p>
        ) : null}
        {snap.fallbackVoice ? (
          <p className="voice-overlay__note">{t('voice.deviceVoice')}</p>
        ) : null}
      </div>

      <div className="voice-overlay__controls">
        <div
          className="voice-overlay__chips"
          role="radiogroup"
          aria-label={t('voice.mode')}
        >
          {VOICE_MODES.map(m => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              className={`voice-chip${mode === m ? ' is-active' : ''}`}
              onClick={() => setMode(m)}
            >
              {t(`voice.mode.${m}`)}
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
