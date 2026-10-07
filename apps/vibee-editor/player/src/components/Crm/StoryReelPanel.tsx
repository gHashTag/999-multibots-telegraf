import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useSetAtom } from 'jotai'
// Its own classes: the panel used to live only on the CRM client page, which
// imported these for it. It now mounts in the chat aside too, where neither
// page css is loaded -- so it carries them itself (vibee-stack-hard-won: a
// fix in a file nobody renders is no fix).
import '../../pages/Crm.css'
import '../../pages/CrmClient.css'
import './StoryReelPanel.css'
import { useLanguage } from '@/hooks/useLanguage'
import { crmErrorText } from '@/lib/crmErrorText'
import { Panel } from '@/components/Crm/Panel'
import { coveredByNotice } from '@/components/Crm/refusalRules'
import { StoryFacePicker } from '@/components/Crm/StoryFacePicker'
import { StoryPalette } from '@/components/Crm/StoryPalette'
import { StoryTemplateGallery } from '@/components/Crm/StoryTemplateGallery'
import { clientWidgetsAtom } from '@/atoms/clientWidgets'
import {
  loadStoryIdeas,
  loadStoryReel,
  saveStoryFace,
  startStoryReel,
  type Reached,
  type StoryReady,
  type StoryScenes,
  type StoryStart,
  templateKey,
  type StoryTemplate,
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
/** The range the stepper offers: the server's, else the spec's 1..6 / 3. */
const FALLBACK_SCENES: StoryScenes = {
  default: 3,
  min: 1,
  max: 6,
  priceTokens: {},
}

/**
 * The storyboard: one tile per scene, her face in each, and the end card in
 * its own colours. What the seller sees here is the shape of the reel the
 * press makes -- N frames of her, then the pause with the call to action.
 */
function Storyboard({
  count,
  face,
  ready,
  cta,
}: {
  count: number
  face: string | null
  ready: StoryReady
  cta: string
}) {
  const { t } = useLanguage()
  // A face that will not load shows the empty frame, not a broken icon; a
  // replaced photo gets its own chance.
  const [brokenFace, setBrokenFace] = useState<string | null>(null)
  const card = ready.endCard ?? {}
  return (
    <ol
      className="story-reel__board"
      data-testid="story-reel-board"
      style={{ '--tiles': count + 1 } as CSSProperties}
    >
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="story-reel__frame">
          {face && face !== brokenFace ? (
            <img
              src={face}
              alt=""
              loading="lazy"
              draggable={false}
              onError={() => setBrokenFace(face)}
            />
          ) : (
            <span className="story-reel__frame-empty" aria-hidden>
              ◎
            </span>
          )}
          <span className="story-reel__frame-n">{i + 1}</span>
        </li>
      ))}
      <li
        className="story-reel__frame story-reel__frame--cta"
        style={{
          background: card.bg ?? '#000000',
          color: card.text ?? '#ffffff',
        }}
        aria-label={t('crm.client.story.board.cta')}
      >
        <strong style={{ color: card.title ?? '#ffd700' }}>
          {cta || t('crm.client.story.board.cta')}
        </strong>
        <span
          className="story-reel__frame-btn"
          style={{
            background: card.accent ?? '#00ff88',
            color: card.bg ?? '#000000',
          }}
        >
          ▶
        </span>
        <span className="story-reel__frame-n">CTA</span>
      </li>
    </ol>
  )
}

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
  const { t, lang } = useLanguage()
  const [state, setState] = useState<Reached<StoryReady>>({
    reachable: true,
    data: null,
  })
  const [topic, setTopic] = useState('')
  // null: the server's default count, until the seller touches the stepper.
  const [count, setCount] = useState<number | null>(null)
  const [style, setStyle] = useState('')
  const [cta, setCta] = useState('')
  const [busy, setBusy] = useState(false)
  const [ideas, setIdeas] = useState<string[]>([])
  // The finished reel goes straight to her DM unless the seller says not.
  const [toDm, setToDm] = useState(true)
  const [result, setResult] = useState<Reached<StoryStart> | null>(null)
  // The script picked in the gallery, with the seller's edits of its lines.
  const [template, setTemplate] = useState<StoryTemplate | null>(null)
  const [lines, setLines] = useState<string[]>([])

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
      if (!r.data?.ready) return
      // Ideas from what was agreed and her SOUL; the first one fills the
      // topic, so one tap makes a reel that fits her.
      void loadStoryIdeas(clientId).then(i => {
        const list = i.data ?? []
        if (!live || !list.length) return
        setIdeas(list)
        setTopic(was => was || list[0])
      })
    })
    return () => {
      live = false
    }
  }, [clientId])

  const s = state.data
  const range = s?.scenes ?? FALLBACK_SCENES
  const n = Math.min(range.max, Math.max(range.min, count ?? range.default))
  // The price of the chosen count when the server priced it, else the
  // default reel's -- never a figure computed here.
  const priceOf = (k: number) =>
    s?.scenes?.priceTokens[k] ?? (k === range.default ? s?.priceTokens : null)
  const price = priceOf(n)

  // A tap on a script fills the fields: its frames, its call, its hook as
  // the topic, its lines to edit. A second tap on it lets it go.
  const pick = (tpl: StoryTemplate | null) => {
    setTemplate(tpl)
    setLines(tpl ? [...tpl.lines] : [])
    if (!tpl) return
    setCount(tpl.scenes || tpl.lines.length)
    setCta(tpl.call)
    setTopic(tpl.lines[0] ?? '')
  }

  /*
   * THE AGENT SEES WHAT THIS PANEL IS SET TO (owner, 2026-10-03: it sent an
   * old render while the panel stood open on a new topic). Mirrored into the
   * client's entry of clientWidgetsAtom while the panel is mounted, cleared
   * when it goes; the chat reads it when a line is sent. Empty style and call
   * are the template's, so the template's are what the agent is told.
   */
  const setWidgets = useSetAtom(clientWidgetsAtom)
  const faceNow = s
    ? s.faceCustom && s.face
      ? s.face
      : s.face
        ? 'source photo'
        : null
    : null
  const ctaNow = cta || s?.cta || ''
  const styleNow = style || s?.style || ''
  const shown = Boolean(s) && !state.refused
  useEffect(() => {
    if (!clientId) return
    setWidgets(all => ({
      ...all,
      [clientId]: {
        ...all[clientId],
        content: shown
          ? {
              topic,
              scenes: n,
              style: styleNow,
              cta: ctaNow,
              toDm,
              face: faceNow,
              ideas,
              ...(template
                ? {
                    template: {
                      id: template.id,
                      language: template.language,
                      lines,
                    },
                  }
                : {}),
            }
          : null,
      },
    }))
  }, [
    clientId,
    shown,
    topic,
    n,
    styleNow,
    ctaNow,
    toDm,
    faceNow,
    ideas,
    template,
    lines,
    setWidgets,
  ])
  useEffect(() => {
    if (!clientId) return
    return () =>
      setWidgets(all => ({
        ...all,
        [clientId]: { ...all[clientId], content: null },
      }))
  }, [clientId, setWidgets])

  // From the previous count, not this render's: two quick taps are two steps.
  const step = (d: number) =>
    setCount(c =>
      Math.min(range.max, Math.max(range.min, (c ?? range.default) + d))
    )

  const onStart = async () => {
    setBusy(true)
    const r = await startStoryReel(clientId, topic, {
      ...(n !== range.default ? { sceneCount: n } : {}),
      style,
      cta,
      toDm,
      ...(template
        ? {
            template: {
              id: template.id,
              language: template.language,
              lines,
              ...(template.button ? { button: template.button } : {}),
            },
          }
        : {}),
    })
    setResult(r)
    setBusy(false)
    if (r.data?.started) {
      setTopic('')
      pick(null)
      void reload()
    }
  }

  // A seller-only tool refused for this viewer: the panel is not theirs.
  if (state.refused) return null

  return (
    <Panel
      title={t('crm.client.story.title')}
      state={state}
      quiet={coveredByNotice(state, noticeReason)}
    >
      {s && (
        <div className="story-reel">
          <ul
            className="story-reel__chips"
            aria-label={t('crm.client.story.title')}
          >
            <li data-mark={s.face ? 'yes' : 'no'}>
              {s.face ? '✓' : '—'} {t('crm.client.story.face')}
            </li>
            <li data-mark={s.voice ? 'yes' : 'no'}>
              {s.voice ? '✓' : '—'} {t('crm.client.story.voice')}
            </li>
            {s.vip ? (
              <li data-mark="vip">★ {t('crm.client.story.vip')}</li>
            ) : null}
          </ul>
          {s.why ? <p className="story-reel__why">{s.why}</p> : null}

          <Storyboard
            count={n}
            face={s.face}
            ready={s}
            cta={cta || s.cta || ''}
          />

          <StoryFacePicker
            ready={s}
            name={clientId}
            disabled={busy}
            save={url => saveStoryFace(clientId, url)}
            onSaved={setState}
          />

          <div className="story-reel__count">
            <span className="story-reel__label">
              {t('crm.client.story.frames')}
            </span>
            <div className="story-reel__stepper" role="group">
              <button
                type="button"
                onClick={() => step(-1)}
                disabled={busy || n <= range.min}
                aria-label={t('crm.client.story.frames.less')}
              >
                −
              </button>
              <output aria-live="polite" data-testid="story-reel-count">
                {n}
              </output>
              <button
                type="button"
                onClick={() => step(1)}
                disabled={busy || n >= range.max}
                aria-label={t('crm.client.story.frames.more')}
              >
                +
              </button>
            </div>
            <span className="story-reel__hint">
              {t('crm.client.story.frames.hint', { n })}
            </span>
          </div>

          {s.ready ? (
            <>
              <StoryTemplateGallery
                templates={s.templates}
                card={s.endCard}
                priceOf={priceOf}
                chosen={template ? templateKey(template) : null}
                disabled={busy}
                onPick={pick}
              />
              {template ? (
                <div className="story-reel__lines">
                  {lines.map((line, i) => (
                    <label key={i}>
                      <span className="story-reel__label">
                        {t('crm.client.story.gallery.line', { n: i + 1 })}
                      </span>
                      <textarea
                        value={line}
                        rows={2}
                        disabled={busy}
                        onChange={e =>
                          setLines(all =>
                            all.map((l, j) => (j === i ? e.target.value : l))
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
              ) : null}
              <textarea
                className="story-reel__topic"
                value={topic}
                rows={2}
                maxLength={200}
                placeholder={t('crm.client.story.topic')}
                onChange={e => setTopic(e.target.value)}
                disabled={busy}
                aria-label={t('crm.client.story.topic')}
              />
              <ul
                className="story-reel__quick"
                aria-label={t('crm.client.story.quick')}
              >
                {[
                  ...(s.nextTopic ? [s.nextTopic] : []),
                  ...(ideas.length
                    ? ideas
                    : [1, 2, 3, 4].map(i => t(`crm.client.story.quick.${i}`))),
                ].map(q => (
                  <li key={q}>
                    <button
                      type="button"
                      aria-pressed={topic === q}
                      disabled={busy}
                      onClick={() => setTopic(topic === q ? '' : q)}
                    >
                      {q}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="story-reel__hint">{t('crm.client.story.tips')}</p>
              <label className="story-reel__dm">
                <input
                  type="checkbox"
                  checked={toDm}
                  disabled={busy}
                  onChange={e => setToDm(e.target.checked)}
                />
                <span>{t('crm.client.story.toDm')}</span>
              </label>
              <details className="story-reel__more">
                <summary>{t('crm.client.story.more')}</summary>
                <label>
                  <span className="story-reel__label">
                    {t('crm.client.story.cta')}
                  </span>
                  <input
                    type="text"
                    value={cta}
                    maxLength={120}
                    placeholder={s.cta ?? ''}
                    onChange={e => setCta(e.target.value)}
                    disabled={busy}
                  />
                </label>
                <label>
                  <span className="story-reel__label">
                    {t('crm.client.story.style')}
                  </span>
                  <textarea
                    value={style}
                    rows={2}
                    maxLength={600}
                    placeholder={s.style ?? ''}
                    onChange={e => setStyle(e.target.value)}
                    disabled={busy}
                  />
                </label>
                <StoryPalette
                  clientId={clientId}
                  ready={s}
                  onChanged={() => void reload()}
                />
              </details>
              {/* The seller's own press is paid from the seller's balance:
                  its price stands above the button (spec v16). */}
              {price != null ? (
                <p className="story-reel__price" data-testid="story-reel-price">
                  {t('crm.client.story.price', { n: price })}
                </p>
              ) : null}
              <button
                type="button"
                className="story-reel__go"
                onClick={() => void onStart()}
                disabled={busy}
              >
                {busy
                  ? t('crm.client.story.starting')
                  : `${t('crm.client.story.start')} · ${t('crm.client.story.framesShort', { n })}`}
              </button>
            </>
          ) : (
            <StoryPalette
              clientId={clientId}
              ready={s}
              onChanged={() => void reload()}
            />
          )}

          {result ? (
            <p
              className={
                result.data?.started ? 'story-reel__ok' : 'story-reel__why'
              }
              role="status"
            >
              {result.data?.started
                ? t('crm.client.story.started', {
                    topic: result.data.topic ?? '',
                  })
                : `${t('crm.client.story.notStarted')}: ${
                    result.data?.why ?? crmErrorText(result, lang, t)
                  }`}
            </p>
          ) : null}
          {s.link ? (
            <p className="story-reel__link">
              <span className="story-reel__label">
                {t('crm.client.story.link')}
              </span>
              <code>{s.link}</code>
            </p>
          ) : null}
          {s.jobs.length === 0 ? (
            <p className="story-reel__empty">{t('crm.client.story.none')}</p>
          ) : (
            <ul className="story-reel__jobs">
              {s.jobs.map(j => (
                <li key={j.id} data-status={j.status}>
                  <span className="story-reel__job-topic">
                    {j.topic || '—'}
                  </span>
                  <span className="story-reel__job-state">
                    {t(`crm.client.story.state.${j.status}`)}
                  </span>
                  {j.url ? (
                    <a
                      href={j.url}
                      target="_blank"
                      rel="noreferrer"
                      className="crm-client__watch"
                    >
                      {t('crm.client.story.watch')}
                    </a>
                  ) : j.status === 'failed' && j.error ? (
                    <p className="story-reel__why">{j.error}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Panel>
  )
}
