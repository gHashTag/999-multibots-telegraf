import { useCallback, useEffect, useState } from 'react'
import { useLanguage } from '@/hooks/useLanguage'
import { Panel } from '@/components/Crm/Panel'
import { coveredByNotice } from '@/components/Crm/refusalRules'
import {
  loadStoryReel,
  startStoryReel,
  type Reached,
  type StoryReady,
  type StoryStart,
} from '@/lib/crm'

/**
 * THE STORY-REEL TEMPLATE ON THE CLIENT'S CARD (owner, 2026-09-26: "create
 * it in the CRM as a template for clients who gave their voice and an avatar
 * photo, for any story").
 *
 * What the card shows is the server's answer, never a guess: face and voice
 * are ticked only when `crm_story_reel` says so, and a missing one is named
 * in its own words. The button starts a reel on any topic; the reel comes to
 * the seller in the bot to be checked and forwarded -- this screen sends
 * nothing to the client.
 */
const mark = (yes: boolean) => (yes ? '✓' : '—')

export function StoryReelPanel({
  clientId,
  noticeReason = null,
}: {
  clientId: string
  /**
   * The failure the page already states once for every panel
   * (components/Crm/AllRefused.tsx); the same failure here stays quiet.
   */
  noticeReason?: string | null
}) {
  const { t } = useLanguage()
  const [state, setState] = useState<Reached<StoryReady>>({
    reachable: true,
    data: null,
  })
  const [topic, setTopic] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Reached<StoryStart> | null>(null)

  const reload = useCallback(async () => {
    if (clientId) setState(await loadStoryReel(clientId))
  }, [clientId])

  // The first load sets state from the answer, never synchronously in the
  // effect (react-hooks/set-state-in-effect); a client switched mid-load is
  // not written over by the old answer.
  useEffect(() => {
    if (!clientId) return
    let live = true
    void loadStoryReel(clientId).then(r => {
      if (live) setState(r)
    })
    return () => {
      live = false
    }
  }, [clientId])

  const onStart = async () => {
    setBusy(true)
    const r = await startStoryReel(clientId, topic)
    setResult(r)
    setBusy(false)
    if (r.data?.started) {
      setTopic('')
      void reload()
    }
  }

  // A seller-only tool refused for this viewer: the panel is not theirs.
  if (state.refused) return null
  const s = state.data

  return (
    <Panel
      title={t('crm.client.story.title')}
      state={state}
      quiet={coveredByNotice(state, noticeReason)}
    >
      {s && (
        <>
          <dl className="crm__stats crm-client__story-marks">
            <div>
              <dt>{t('crm.client.story.face')}</dt>
              <dd data-mark={s.face ? 'yes' : 'no'}>{mark(Boolean(s.face))}</dd>
            </div>
            <div>
              <dt>{t('crm.client.story.voice')}</dt>
              <dd data-mark={s.voice ? 'yes' : 'no'}>{mark(s.voice)}</dd>
            </div>
            {s.vip ? (
              <div>
                <dt>{t('crm.client.story.vip')}</dt>
                <dd data-mark="yes">★</dd>
              </div>
            ) : null}
          </dl>
          {s.why ? <p className="crm__why">{s.why}</p> : null}
          {s.ready ? (
            <div className="crm-client__duet-start">
              <input
                type="text"
                value={topic}
                maxLength={200}
                placeholder={t('crm.client.story.topic')}
                onChange={e => setTopic(e.target.value)}
                disabled={busy}
                aria-label={t('crm.client.story.topic')}
              />
              <button
                type="button"
                className="crm-client__duet-go"
                onClick={() => void onStart()}
                disabled={busy}
              >
                {busy
                  ? t('crm.client.story.starting')
                  : t('crm.client.story.start')}
              </button>
            </div>
          ) : null}
          {result ? (
            <p className="crm__counts" role="status">
              {result.data?.started
                ? t('crm.client.story.started', {
                    topic: result.data.topic ?? '',
                  })
                : `${t('crm.client.story.notStarted')}: ${
                    result.data?.why ?? result.error ?? ''
                  }`}
            </p>
          ) : null}
          {s.link ? (
            <p className="crm__counts">
              {t('crm.client.story.link')}: <code>{s.link}</code>
            </p>
          ) : null}
          {s.jobs.length === 0 ? (
            <p className="crm__empty">{t('crm.client.story.none')}</p>
          ) : (
            <ul className="crm__list">
              {s.jobs.map(j => (
                <li key={j.id} className="crm__row">
                  <div className="crm__who">
                    <span>{j.topic || '—'}</span>
                    <span className="crm__stage">
                      {t(`crm.client.story.state.${j.status}`)}
                    </span>
                  </div>
                  {j.url ? (
                    <a href={j.url} target="_blank" rel="noreferrer">
                      {t('crm.client.story.watch')}
                    </a>
                  ) : j.status === 'failed' && j.error ? (
                    <p className="crm__why">{j.error}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  )
}
