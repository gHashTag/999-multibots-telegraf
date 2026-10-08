import { useCallback, useEffect, useState } from 'react'
import '@/pages/Crm.css'
import '@/pages/CrmClient.css'
import '@/components/Crm/StoryReelPanel.css'
import { useLanguage } from '@/hooks/useLanguage'
import { crmErrorText } from '@/lib/crmErrorText'
import { StoryFacePicker } from '@/components/Crm/StoryFacePicker'
import { ReelPreview } from '@/components/Story/ReelPreview'
import { previewShown } from '@/lib/planReel'
import {
  loadMyStory,
  saveMyStoryFace,
  startMyStory,
  type Reached,
  type StoryReady,
  type StoryStart,
} from '@/lib/crm'

/**
 * MY REELS, THE WIDGET -- the story-reel template for the person herself (owner,
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
 *
 * One widget, two homes (owner, 2026-10-02: "users in the cabinet with the
 * agent must see this widget too"): the /story page, and the chat with the
 * agent, where `onlyReady` hides it for anyone without a template.
 */
const mark = (yes: boolean) => (yes ? '✓' : '—')

export function MyStoryWidget({
  onlyReady = false,
  foldedIn,
}: {
  /**
   * Drawn inside the chat: a titled fold, open unless this is true. Absent on
   * the page, which has its own header.
   */
  foldedIn?: boolean
  /** Draw nothing until the server says her template is ready. */
  onlyReady?: boolean
}) {
  const { t, lang } = useLanguage()
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

  // The first load sets state from the answer, never synchronously in the
  // effect (react-hooks/set-state-in-effect); a page left mid-load is not
  // written to.
  useEffect(() => {
    let live = true
    void loadMyStory().then(r => {
      if (!live) return
      setState(r)
      setLoaded(true)
    })
    return () => {
      live = false
    }
  }, [])

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
  const why = crmErrorText(state, lang, t)

  if (onlyReady && !s?.ready) return null

  const body = (
    <>
      {!state.reachable ? (
        <p className="crm__unreachable">
          {t('story.unreachable')}
          {why ? `: ${why}` : ''}
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
          {s.face || s.avatar ? (
            <StoryFacePicker
              ready={s}
              name="me"
              self
              disabled={busy}
              save={saveMyStoryFace}
              onSaved={setState}
            />
          ) : null}
          {s.ready ? (
            <>
              {s.nextTopic ? (
                <p className="crm__counts">
                  {t('story.next', { topic: s.nextTopic })}
                </p>
              ) : null}
              {/* The price (or that it is a gift) ABOVE the button: read
                  before the press, not after it (spec v16). */}
              <p className="crm__counts" data-testid="story-price">
                {s.gift
                  ? t('story.gift')
                  : s.priceTokens != null
                    ? t('story.price', { n: s.priceTokens })
                    : null}
              </p>
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
            </>
          ) : null}
          {result ? (
            <p className="crm__counts" role="status">
              {result.data?.started
                ? t('story.started', { topic: result.data.topic ?? '' })
                : `${t('story.notStarted')}: ${
                    result.data?.why ?? crmErrorText(result, lang, t)
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
                  {/* A reel that came out is a picture of itself, its
                      press opens it (plan-reel.t27). */}
                  {previewShown(j.url) ? (
                    <ReelPreview
                      url={j.url as string}
                      poster={j.poster}
                      label={t('story.watch', { topic: j.topic || '—' })}
                    />
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
    </>
  )
  if (foldedIn === undefined) return body
  return (
    <details
      className="crm crm-client story chat-story"
      open={!foldedIn}
      data-testid="chat-story"
    >
      <summary>🎬 {t('story.title')}</summary>
      {body}
    </details>
  )
}
