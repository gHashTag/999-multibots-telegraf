import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '@/hooks/useLanguage'
import {
  loadClientProfile,
  loadLeadContext,
  loadClientHistory,
  loadClientPlan,
  loadAutopilotLeads,
  pickForAutopilot,
  recordTouch,
  type ClientProfile,
  type ClientHistory,
  type ClientPlan,
  type LeadContext,
  type Reached,
} from '@/lib/crm'
import { Avatar } from '@/components/Crm/Avatar'
import {
  daysSince,
  nextMoves,
  profileHighlights,
  temperatureOf,
} from '@/lib/clientStrategy'

/**
 * WHO THIS CONVERSATION IS ABOUT, AND WHAT TO DO NEXT, WITHOUT LEAVING IT.
 *
 * Owner, 2026-09-23: in wide mode the client's card should be there straight
 * away. Owner, 2026-09-24: the card overlapped the row of conversations and
 * showed a name and a balance -- the SOUL, the package and the plan the
 * server already returns were thrown away on the way to the screen, and
 * nothing on it said what to do next.
 *
 * SO THE CARD IS A COCKPIT FOR ONE PERSON, IN FOUR LAYERS:
 *
 *  1. Who: name, handle, stage, temperature (from buying words).
 *  2. Pulse: are they waiting, how long silent, tokens.
 *  3. The next move, derived from facts (lib/clientStrategy.ts), each one a
 *     press that asks the agent in THIS conversation -- the agent proposes,
 *     the owner confirms. Nothing on the card writes to the client.
 *  4. Depth, in tabs: SOUL and memory, the package rules (what never to say
 *     first), the content plan, the history with a note field.
 *
 * WIDE MODE shows it as a column; NARROW MODE opens it as a sheet from the
 * header's "card" button. Both are CSS decisions: a layout that depends on a
 * measured viewport breaks in the embedded Mini App, whose frame is resized
 * under it.
 *
 * IT ASKS FOR NOTHING IT DOES NOT SHOW, and every load says whether it
 * reached anything: a panel that renders zeros for a server that did not
 * answer tells the owner this person has no history, which is a verdict the
 * screen has no right to pass.
 */

type Tab = 'soul' | 'package' | 'plan' | 'history'
const TABS: Tab[] = ['soul', 'package', 'plan', 'history']

const KNOWN_STAGES = new Set([
  'client',
  'refused',
  'later',
  'talking',
  'written',
  'winback',
  'new',
])

const empty = <T,>(): Reached<T> => ({ reachable: true, data: null })

/** `2026-09-13T10:00:00Z` -> `13.09`; anything unparseable is shown as is. */
function day(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${String(d.getDate()).padStart(2, '0')}.${String(
    d.getMonth() + 1
  ).padStart(2, '0')}`
}

export function ClientAside({
  client,
  onAsk,
  askDisabled = false,
  open = false,
  onClose,
}: {
  client: string
  /** Put a question to the agent in this conversation. */
  onAsk?: (text: string) => void
  askDisabled?: boolean
  /** Narrow mode: the card is a sheet, shown only while open. */
  open?: boolean
  onClose?: () => void
}) {
  const { t } = useLanguage()
  const [profile, setProfile] = useState<Reached<ClientProfile>>(empty)
  const [context, setContext] = useState<Reached<LeadContext>>(empty)
  const [history, setHistory] = useState<Reached<ClientHistory>>(empty)
  const [plan, setPlan] = useState<Reached<ClientPlan>>(empty)
  const [tab, setTab] = useState<Tab>('soul')
  const [soulOpen, setSoulOpen] = useState(false)
  const [note, setNote] = useState('')
  const [noteState, setNoteState] = useState<
    'idle' | 'saving' | 'saved' | 'failed'
  >('idle')
  /**
   * MAY AUTO WRITE TO THIS PERSON BY ITSELF?
   *
   * The switch on the dashboard says "chosen"; this is where somebody is
   * chosen, while looking at what they last said. `null` means we have not
   * read the list yet -- the tick is not drawn at all then, because an
   * unticked box that simply has not loaded is a lie about a setting that
   * sends messages.
   */
  const [picked, setPicked] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    void (async () => {
      // In parallel: five independent reads; one slow tool must not hold the
      // rest of the card off the screen.
      const [p, c, h, pl, picks] = await Promise.all([
        loadClientProfile(client),
        loadLeadContext(client),
        loadClientHistory(client),
        loadClientPlan(client),
        loadAutopilotLeads(),
      ])
      if (!alive) return
      setProfile(p)
      setContext(c)
      setHistory(h)
      setPlan(pl)
      setPicked(picks.data ? picks.data.includes(client) : null)
    })()
    return () => {
      alive = false
    }
  }, [client])

  const saveNote = useCallback(async () => {
    const text = note.trim()
    if (!text) return
    setNoteState('saving')
    // Our memory only: a note is written to crm_touches, never to the client.
    const r = await recordTouch(client, 'note', text)
    if (!r.reachable || r.data?.saved === false) {
      setNoteState('failed')
      return
    }
    setNote('')
    setNoteState('saved')
    setHistory(await loadClientHistory(client))
  }, [client, note])

  const ctx = context.data
  const pr = profile.data
  const hi = history.data
  const pl = plan.data
  const name = ctx?.name || pr?.client || client
  const stage = hi?.stage ?? ctx?.stage ?? null
  const stageLabel =
    stage && KNOWN_STAGES.has(stage) ? t(`crm.stage.${stage}`) : stage
  const temp = ctx ? temperatureOf(ctx.intentScore, ctx.signals) : 'unknown'
  const silent = daysSince(ctx?.lastInbound ?? null)
  const moves =
    context.reachable && ctx
      ? nextMoves({
          stage,
          waitingOnUs: ctx.waitingOnUs,
          lastInbound: ctx.lastInbound,
          lastOutbound: ctx.lastOutbound,
          signals: ctx.signals,
          intentScore: ctx.intentScore,
          balanceTokens: ctx.balanceTokens,
          portrait: ctx.portrait,
          assistantOff: ctx.assistantOff,
          hasSoul: pr?.hasSoul ?? true,
          hasProfile: pr?.hasProfile ?? true,
          planTotal: plan.reachable ? (pl?.total ?? 0) : null,
          planDone: plan.reachable ? (pl?.done ?? 0) : null,
        })
      : []
  const highlights = profileHighlights(pr?.profile ?? null)
  const percent =
    pl && pl.total > 0 ? Math.round((pl.done / pl.total) * 100) : 0
  const openItems = (pl?.items ?? [])
    .filter(i => i.status !== 'done')
    .slice(0, 4)

  const ask = (text: string) => {
    if (!onAsk || askDisabled) return
    onAsk(text)
  }

  return (
    <aside
      className={`chat-aside${open ? ' is-open' : ''}`}
      aria-label={t('crm.aside.title')}
    >
      <div className="chat-aside__head">
        <Avatar
          name={name}
          url={ctx?.avatarUrl}
          size={48}
          className="chat-aside__avatar"
        />
        <div className="chat-aside__who">
          <span className="chat-aside__name">{name}</span>
          {ctx?.username ? (
            <a
              className="chat-aside__handle"
              href={`https://t.me/${ctx.username}`}
              target="_blank"
              rel="noreferrer"
            >
              @{ctx.username}
            </a>
          ) : null}
        </div>
        {onClose ? (
          <button
            type="button"
            className="chat-aside__close"
            aria-label={t('crm.aside.close')}
            onClick={onClose}
          >
            ×
          </button>
        ) : null}
      </div>

      {!context.reachable ? (
        <p className="chat-aside__off">{t('crm.client.unreachable')}</p>
      ) : (
        <>
          <div className="chat-aside__chips">
            {stageLabel ? (
              <span className="chat-aside__chip" data-stage={stage ?? ''}>
                {stageLabel}
              </span>
            ) : null}
            {temp !== 'unknown' ? (
              <span className="chat-aside__chip" data-temp={temp}>
                {t(`crm.aside.temp.${temp}`)}
              </span>
            ) : null}
            {pr?.hasProfile ? (
              <span className="chat-aside__chip" data-kind="package">
                {t('crm.aside.package')}
              </span>
            ) : null}
          </div>

          <dl className="chat-aside__pulse">
            <div data-alert={ctx?.waitingOnUs ? 'yes' : 'no'}>
              <dt>{t('crm.aside.waiting')}</dt>
              <dd className={ctx?.waitingOnUs ? 'chat-aside__waiting' : ''}>
                {ctx?.waitingOnUs
                  ? t('crm.aside.waiting.yes')
                  : t('crm.aside.waiting.no')}
              </dd>
            </div>
            <div>
              <dt>{t('crm.aside.silent')}</dt>
              <dd>
                {silent === null
                  ? '—'
                  : silent === 0
                    ? t('crm.aside.ago.today')
                    : t('crm.aside.ago.days', { n: silent })}
              </dd>
            </div>
            <div>
              <dt>{t('crm.aside.balance')}</dt>
              <dd>
                {typeof ctx?.balanceTokens === 'number'
                  ? ctx.balanceTokens
                  : '—'}
              </dd>
            </div>
          </dl>
        </>
      )}

      {ctx?.assistantOff ? (
        <p className="chat-aside__stop">{t('crm.aside.assistantOff')}</p>
      ) : null}

      {moves.length > 0 ? (
        <section className="chat-aside__moves" aria-label={t('crm.aside.next')}>
          <h3 className="chat-aside__label">{t('crm.aside.next')}</h3>
          {moves.map(m => (
            <div key={m.id} className="chat-aside__move" data-tone={m.tone}>
              <span>{t(`crm.move.${m.id}`)}</span>
              {m.tone !== 'stop' && onAsk ? (
                <button
                  type="button"
                  disabled={askDisabled}
                  onClick={() => ask(t(`crm.move.${m.id}.ask`, { name }))}
                >
                  {t('crm.aside.askAgent')}
                </button>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      {ctx?.lastWords ? (
        <figure className="chat-aside__quote">
          <figcaption>{t('crm.aside.lastWords')}</figcaption>
          <blockquote className="chat-aside__words">{ctx.lastWords}</blockquote>
        </figure>
      ) : null}

      {ctx && ctx.signals.length > 0 ? (
        <div className="chat-aside__signals">
          {ctx.signals.map(s => (
            <span key={s} data-signal={s}>
              {t(`crm.signal.${s}`)}
            </span>
          ))}
        </div>
      ) : null}

      <div className="chat-aside__tabs" role="tablist">
        {TABS.map(x => (
          <button
            key={x}
            type="button"
            role="tab"
            aria-selected={tab === x}
            className={tab === x ? 'is-active' : ''}
            onClick={() => setTab(x)}
          >
            {t(`crm.aside.tab.${x}`)}
          </button>
        ))}
      </div>

      <div className="chat-aside__pane" role="tabpanel">
        {tab === 'soul' ? (
          !profile.reachable ? (
            <p className="chat-aside__off">{t('crm.client.unreachable')}</p>
          ) : pr?.privateWithheld ? (
            <p className="chat-aside__off">{t('crm.aside.soul.withheld')}</p>
          ) : (
            <>
              {pr?.soulExcerpt ? (
                <div className="chat-aside__soul">
                  {pr.soulIsDraft ? (
                    <span className="chat-aside__badge">
                      {t('crm.aside.soul.draft')}
                    </span>
                  ) : null}
                  <p>{pr.soul ?? pr.soulExcerpt}</p>
                  <button
                    type="button"
                    className="chat-aside__more"
                    onClick={() => setSoulOpen(true)}
                  >
                    {t('crm.aside.soul.readAll')}
                  </button>
                  {soulOpen ? (
                    <div
                      className="soul-reader"
                      role="dialog"
                      aria-modal="true"
                      aria-label={t('crm.aside.tab.soul')}
                    >
                      <div
                        className="soul-reader__backdrop"
                        onClick={() => setSoulOpen(false)}
                      />
                      <article className="soul-reader__sheet">
                        <header>
                          <b>SOUL · {name}</b>
                          <button
                            type="button"
                            aria-label={t('crm.aside.close')}
                            onClick={() => setSoulOpen(false)}
                          >
                            ×
                          </button>
                        </header>
                        <div className="soul-reader__text">
                          {pr.soul ?? pr.soulExcerpt}
                        </div>
                        {pr.soul && pr.soulChars > pr.soul.length ? (
                          <p className="chat-aside__muted">
                            {t('crm.aside.soul.cut', {
                              shown: pr.soul.length,
                              total: pr.soulChars,
                            })}
                          </p>
                        ) : null}
                      </article>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="chat-aside__off">{t('crm.aside.soul.none')}</p>
              )}
              {pr && pr.skills.length > 0 ? (
                <div className="chat-aside__skills">
                  {pr.skills.map(s => (
                    <span key={s}>{s}</span>
                  ))}
                </div>
              ) : null}
              {ctx?.memory ? (
                <div className="chat-aside__memory">
                  <h4>{t('crm.aside.memory')}</h4>
                  <p>{ctx.memory}</p>
                </div>
              ) : null}
            </>
          )
        ) : null}

        {tab === 'package' ? (
          !profile.reachable ? (
            <p className="chat-aside__off">{t('crm.client.unreachable')}</p>
          ) : (
            <>
              {ctx?.portrait ? (
                <p className="chat-aside__portrait">
                  {t('crm.aside.portrait')}:{' '}
                  {t(
                    ctx.portrait.given
                      ? 'crm.aside.portrait.given'
                      : ctx.portrait.ready
                        ? 'crm.aside.portrait.ready'
                        : ctx.portrait.drawing
                          ? 'crm.aside.portrait.drawing'
                          : 'crm.aside.portrait.none'
                  )}
                </p>
              ) : null}
              {highlights.length > 0 ? (
                <dl className="chat-aside__rules">
                  {highlights.map(h => (
                    <div key={h.key} data-warning={h.warning ? 'yes' : 'no'}>
                      <dt>{h.key.replace(/_/g, ' ')}</dt>
                      <dd>{h.text}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="chat-aside__off">{t('crm.aside.package.none')}</p>
              )}
            </>
          )
        ) : null}

        {tab === 'plan' ? (
          !plan.reachable ? (
            <p className="chat-aside__off">{t('crm.client.unreachable')}</p>
          ) : pl && pl.total > 0 ? (
            <>
              <div
                className="chat-aside__bar"
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span style={{ width: `${percent}%` }} />
              </div>
              <p className="chat-aside__muted">
                {t('crm.client.plan.progress', {
                  done: pl.done,
                  total: pl.total,
                })}
              </p>
              <ul className="chat-aside__list">
                {openItems.map(i => (
                  <li key={i.id}>
                    <span data-status={i.status}>{i.status}</span> {i.title}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="chat-aside__off">{t('crm.aside.plan.none')}</p>
          )
        ) : null}

        {tab === 'history' ? (
          <>
            {!history.reachable ? (
              <p className="chat-aside__off">{t('crm.client.unreachable')}</p>
            ) : hi && hi.touches.length > 0 ? (
              <ul className="chat-aside__list chat-aside__touches">
                {hi.touches.slice(0, 8).map((x, i) => (
                  <li key={`${x.at}-${i}`}>
                    <span className="chat-aside__muted">{day(x.at)}</span>{' '}
                    <b>{x.kind}</b>
                    {x.note ? ` — ${x.note}` : ''}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="chat-aside__off">{t('crm.client.touches.none')}</p>
            )}
            <form
              className="chat-aside__note"
              onSubmit={e => {
                e.preventDefault()
                void saveNote()
              }}
            >
              <input
                type="text"
                value={note}
                maxLength={500}
                placeholder={t('crm.aside.note.placeholder')}
                onChange={e => {
                  setNote(e.target.value)
                  if (noteState !== 'saving') setNoteState('idle')
                }}
              />
              <button
                type="submit"
                disabled={!note.trim() || noteState === 'saving'}
              >
                {t('crm.aside.note.save')}
              </button>
            </form>
            {noteState === 'saved' || noteState === 'failed' ? (
              <p className="chat-aside__muted">
                {t(`crm.aside.note.${noteState}`)}
              </p>
            ) : null}
          </>
        ) : null}
      </div>

      {picked === null ? null : (
        <label className="chat-aside__auto">
          <input
            type="checkbox"
            checked={picked}
            disabled={saving}
            onChange={async e => {
              const next = e.target.checked
              setSaving(true)
              // Optimistic, then corrected by what the server answers: this
              // tick decides whether messages go to a real person, so the
              // screen must end up showing the server's state, not its own.
              setPicked(next)
              const r = await pickForAutopilot(client, next)
              if (!r.reachable) setPicked(!next)
              setSaving(false)
            }}
          />
          <span>{t('crm.aside.auto')}</span>
        </label>
      )}

      <div className="chat-aside__actions">
        <Link className="chat-aside__link" to={`/crm/${client}`}>
          {t('crm.aside.open')}
        </Link>
        <a
          className="chat-aside__link"
          href={`tg://user?id=${client}`}
          rel="noreferrer"
        >
          {t('crm.aside.telegram')}
        </a>
      </div>
    </aside>
  )
}
