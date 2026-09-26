import { useCallback, useEffect, useState } from 'react'
import './Crm.css'
import './CrmClient.css'
import { useLanguage } from '@/hooks/useLanguage'
import {
  loadMyStory,
  startMyStory,
  type Reached,
  type StoryReady,
  type StoryStart,
} from '@/lib/crm'

/**
 * MY REELS -- the story-reel template for the person herself (owner,
 * 2026-09-26: "a link into her bot, to a page -- ideally, so she can do the
 * same herself").
 *
 * Her bot opens it with t.me/<bot>?start=app_story. One screen: whether her
 * face and voice are in place, the next topic of her own content plan, the
 * price BEFORE the press (or that it is a gift), a topic field, one button,
 * and the reels she already has. The reel is made on the server
 * (my_story_reel) and comes back to her bot; this screen only asks and shows.
 *
 * What it shows is the server's answer, never a guess: a panel that could
 * not load says so instead of showing an empty list.
 */
const mark = (yes: boolean) => (yes ? '✓' : '—')

export default function StoryPage() {
  const { t } = useLanguage()
  const [state, setState] = useState<Reached<StoryReady>>({
    reachable: true,
    data: null,
  })
  const [loaded, setLoaded] = useState(false)
  const [topic, setTopic] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Reached<StoryStart> | null>(null)

  const reload = useCallback(async () => {
    setState(await loadMyStory())
    setLoaded(true)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const onMake = async () => {
    setBusy(true)
    const r = await startMyStory(topic)
    setResult(r)
    setBusy(false)
    if (r.data?.started) {
      setTopic('')
      void reload()
    }
  }

  const s = state.data

  return (
    <div className="crm crm-client story">
      <header className="crm__top">
        <h2>{t('story.title')}</h2>
      </header>
      <p className="crm__counts">{t('story.lead')}</p>

      {!state.reachable ? (
        <p className="crm__unreachable">
          {t('story.unreachable')}
          {state.error ? `: ${state.error}` : ''}
        </p>
      ) : null}

      {s ? (
        <section className="crm__panel">
          <dl className="crm__stats crm-client__story-marks">
            <div>
              <dt>{t('story.face')}</dt>
              <dd data-mark={s.face ? 'yes' : 'no'}>{mark(Boolean(s.face))}</dd>
            </div>
            <div>
              <dt>{t('story.voice')}</dt>
              <dd data-mark={s.voice ? 'yes' : 'no'}>{mark(s.voice)}</dd>
            </div>
          </dl>
          {s.why ? <p className="crm__why">{s.why}</p> : null}
          {s.ready ? (
            <>
              {s.nextTopic ? (
                <p className="crm__counts">
                  {t('story.next', { topic: s.nextTopic })}
                </p>
              ) : null}
              <div className="crm-client__duet-start">
                <input
                  type="text"
                  value={topic}
                  maxLength={200}
                  placeholder={t('story.topic')}
                  aria-label={t('story.topic')}
                  onChange={e => setTopic(e.target.value)}
                  disabled={busy}
                />
                <button
                  type="button"
                  className="crm-client__duet-go"
                  onClick={() => void onMake()}
                  disabled={busy}
                >
                  {busy ? t('story.making') : t('story.make')}
                </button>
              </div>
              <p className="crm__counts">
                {s.gift
                  ? t('story.gift')
                  : s.priceTokens != null
                    ? t('story.price', { n: s.priceTokens })
                    : null}
              </p>
            </>
          ) : null}
          {result ? (
            <p className="crm__counts" role="status">
              {result.data?.started
                ? t('story.started', { topic: result.data.topic ?? '' })
                : `${t('story.notStarted')}: ${
                    result.data?.why ?? result.error ?? ''
                  }`}
            </p>
          ) : null}
        </section>
      ) : null}

      {s ? (
        <section className="crm__panel">
          <h3 className="crm__panel-title">{t('story.mine')}</h3>
          {s.jobs.length === 0 ? (
            <p className="crm__empty">{t('story.none')}</p>
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
        </section>
      ) : loaded ? null : (
        <p className="crm__counts">…</p>
      )}
    </div>
  )
}
