import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSetAtom } from 'jotai'
import { clientWidgetsAtom } from '@/atoms/clientWidgets'
import { AgentTemplates } from '@/components/Chat/AgentTemplates'
import { AGENT_TEMPLATES } from '@/pages/agentSuggestions'
import {
  openAfterSwitch,
  widgetsFor,
  FIRST_CLIENT_WIDGET,
  type WidgetId,
} from '@/lib/clientWidgets'
import { useBackTo } from '@/lib/backTo'
import { useLanguage } from '@/hooks/useLanguage'
import {
  loadClientProfile,
  loadLeadContext,
  loadClientHistory,
  loadClientPlan,
  loadAutopilotLeads,
  pickForAutopilot,
  recordTouch,
  loadMoveStats,
  loadClientTimeline,
  type ClientTimeline as Timeline,
  recordMoveUse,
  type ClientProfile,
  type ClientHistory,
  type ClientPlan,
  type LeadContext,
  type Reached,
} from '@/lib/crm'
import { Avatar } from '@/components/Crm/Avatar'
import { ClientGroup } from '@/components/Crm/ClientGroup'
import { StoryReelPanel } from '@/components/Crm/StoryReelPanel'
import {
  ClientDrafts,
  ClientFeed,
  ClientSummary,
} from '@/components/Crm/ClientTimeline'
import {
  daysSince,
  MIN_MOVE_USES,
  nextMoves,
  type MoveExperience,
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
 *  4. Depth: SOUL and memory, the package rules (what never to say first),
 *     the content plan, the history with a note field.
 *
 * Under the head, ONE MENU of widgets, one open at a time (owner,
 * 2026-10-03; spec crm-client-workspace v5, lib/clientWidgets.ts): the
 * client's own -- moves, group, SOUL, rules, plan, history -- under any
 * specialist, and the chosen specialist's after them -- the Blogger's
 * content (the two gifts), another's templates. Choosing a specialist opens
 * its widget; leaving it falls back to a client widget. The drafts stay
 * pinned above the menu; the Queen is on the right and is not a widget.
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

/** The menu's words: the four old tabs keep their own. */
const WIDGET_LABEL: Record<WidgetId, string> = {
  moves: 'crm.aside.widget.moves',
  group: 'crm.aside.widget.group',
  soul: 'crm.aside.tab.soul',
  package: 'crm.aside.tab.package',
  plan: 'crm.aside.tab.plan',
  history: 'crm.aside.tab.history',
  content: 'crm.aside.widget.content',
  templates: 'crm.aside.widget.templates',
}

/** Specialists that bring a templates widget: those with templates at all. */
const TEMPLATE_AGENTS = Object.keys(AGENT_TEMPLATES)

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
  onName,
  agent = null,
}: {
  client: string
  /**
   * The specialist chosen for this conversation (ClientHelperPicker); null
   * -- the plain Assistant. It decides which widgets the menu holds.
   */
  agent?: string | null
  /** Put a question to the agent in this conversation. */
  onAsk?: (text: string) => void
  askDisabled?: boolean
  /** Narrow mode: the card is a sheet, shown only while open. */
  open?: boolean
  onClose?: () => void
  /** The client's name once it is read, for the conversation's top row. */
  onName?: (name: string) => void
}) {
  const { t } = useLanguage()
  // Opening the card from the chat is the chat's own way back (tick 7: the
  // top row's link was fixed in tick 6, this one still pushed -- the loop).
  const backToCard = useBackTo(`/crm/${client}`)
  const [profile, setProfile] = useState<Reached<ClientProfile>>(empty)
  const [context, setContext] = useState<Reached<LeadContext>>(empty)
  const [history, setHistory] = useState<Reached<ClientHistory>>(empty)
  const [plan, setPlan] = useState<Reached<ClientPlan>>(empty)
  /*
   * The open widget follows the specialist: adjusted while rendering when
   * the specialist changes (React's "state from a prop" pattern), so no
   * frame ever shows the old specialist's widget under the new one.
   */
  const [widget, setWidget] = useState<WidgetId>(() =>
    openAfterSwitch(FIRST_CLIENT_WIDGET, agent, TEMPLATE_AGENTS)
  )
  const [widgetFor, setWidgetFor] = useState(agent)
  if (widgetFor !== agent) {
    setWidgetFor(agent)
    setWidget(openAfterSwitch(widget, agent, TEMPLATE_AGENTS))
  }
  // The chat tells the agent which widget is open (lib/clientWidgets.ts).
  const setWidgets = useSetAtom(clientWidgetsAtom)
  useEffect(() => {
    setWidgets(all => ({ ...all, [client]: { ...all[client], open: widget } }))
  }, [client, widget, setWidgets])
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
  /** What followed each move for this owner's clients; null = rule order. */
  const [experience, setExperience] = useState<MoveExperience | null>(null)
  /** The feed and the summary numbers (crm_client_timeline). */
  const [timeline, setTimeline] = useState<Reached<Timeline>>(empty)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    // Seven independent reads, each drawn as it answers. They were read in
    // parallel but drawn together, after the slowest: the name in the
    // chat's top row came a second late on every visit (CRM loop, tick 7).
    const land =
      <T,>(set: (v: T) => void) =>
      (v: T) => {
        if (alive) set(v)
      }
    void loadClientProfile(client).then(land(setProfile))
    void loadLeadContext(client).then(land(setContext))
    void loadClientHistory(client).then(land(setHistory))
    void loadClientPlan(client).then(land(setPlan))
    void loadAutopilotLeads().then(
      land(picks => setPicked(picks.data ? picks.data.includes(client) : null))
    )
    void loadMoveStats().then(land(setExperience))
    void loadClientTimeline(client).then(land(setTimeline))
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
    setTimeline(await loadClientTimeline(client))
  }, [client, note])

  // The menu: the client's widgets, then the chosen specialist's.
  const menu = widgetsFor(agent, TEMPLATE_AGENTS)
  const menuIds = new Set(menu.map(w => w.id))
  const ctx = context.data
  const pr = profile.data
  const hi = history.data
  const pl = plan.data
  const known = ctx?.name || pr?.client || null
  const name = known || client
  // The chat's top row names the client from the same read: an id alone
  // names nobody, and a second profile read would be the same answer.
  useEffect(() => {
    if (known) onName?.(known)
  }, [known, onName])
  const stage = hi?.stage ?? ctx?.stage ?? null
  const stageLabel =
    stage && KNOWN_STAGES.has(stage) ? t(`crm.stage.${stage}`) : stage
  const temp = ctx ? temperatureOf(ctx.intentScore, ctx.signals) : 'unknown'
  const silent = daysSince(ctx?.lastInbound ?? null)
  const moves =
    context.reachable && ctx
      ? nextMoves(
          {
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
          },
          undefined,
          experience
        )
      : []
  const highlights = profileHighlights(pr?.profile ?? null)
  /**
   * THE PORTRAIT GIFT, as one row with a state and at most one button. The
   * same `crm.move.*.ask` texts the strategy moves use, so the agent is
   * asked identically from either place; a drawing or given portrait is a
   * fact the server owns, and the row shows it without a button to press.
   */
  const portrait = ctx?.portrait
  const portraitState = portrait?.given
    ? t('crm.aside.portrait.given')
    : portrait?.ready
      ? t('crm.aside.portrait.ready')
      : portrait?.drawing
        ? t('crm.aside.portrait.drawing')
        : t('crm.aside.portrait.none')
  const portraitMove: 'portraitGive' | 'portraitSend' | null = portrait?.given
    ? null
    : portrait?.drawing
      ? null
      : portrait?.ready
        ? 'portraitSend'
        : 'portraitGive'
  // The content widget (the Blogger's) owns the portrait gift; a move list
  // that repeats it there says the same thing twice, and one that offers it
  // under another specialist is content leaking out of the Blogger's hands.
  const shownMoves = moves.filter(
    m => m.id !== 'portraitGive' && m.id !== 'portraitSend'
  )
  const percent =
    pl && pl.total > 0 ? Math.round((pl.done / pl.total) * 100) : 0
  const openItems = (pl?.items ?? [])
    .filter(i => i.status !== 'done')
    .slice(0, 4)

  /**
   * A move pressed is remembered as a note `move:<id>` (our memory, never
   * sent) -- that is how the system learns which moves work for this owner.
   * The press itself never waits on the write.
   */
  const askMove = (id: string) => {
    if (!onAsk || askDisabled) return
    void recordMoveUse(client, id)
    onAsk(t(`crm.move.${id}.ask`, { name }))
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
          <ClientSummary timeline={timeline.data ?? null} />
        </>
      )}

      {/* Cards for this client waiting for the owner's press. PINNED ABOVE
          THE MENU, not one of its entries (spec v5, DRAFTS_PINNED_ABOVE_MENU):
          a card waiting to be sent is the one thing here that must never be
          a press away. It draws nothing when there is none. */}
      <ClientDrafts client={client} />

      {/* ONE MENU, ON THE LEFT, ONE WIDGET OPEN (owner, 2026-10-03). The
          client's widgets first, then the chosen specialist's; the old row
          of four tabs is now part of it, so there is no second row. */}
      <div
        className="chat-aside__menu"
        role="tablist"
        aria-label={t('crm.aside.menu')}
      >
        {menu.map(w => (
          <button
            key={`${w.id}-${w.owner ?? ''}`}
            type="button"
            role="tab"
            aria-selected={widget === w.id}
            className={widget === w.id ? 'is-active' : ''}
            data-widget={w.id}
            data-owner={w.owner ?? 'client'}
            onClick={() => setWidget(w.id)}
          >
            {t(WIDGET_LABEL[w.id])}
          </button>
        ))}
      </div>

      <div className="chat-aside__pane" role="tabpanel" data-widget={widget}>
        {widget === 'moves' ? (
          !context.reachable ? (
            <p className="chat-aside__off">{t('crm.client.unreachable')}</p>
          ) : (
            <>
              {ctx?.assistantOff ? (
                <p className="chat-aside__stop">
                  {t('crm.aside.assistantOff')}
                </p>
              ) : null}
              {shownMoves.length > 0 ? (
                <section
                  className="chat-aside__moves"
                  aria-label={t('crm.aside.next')}
                >
                  <h3 className="chat-aside__label">{t('crm.aside.next')}</h3>
                  {shownMoves.map(m => (
                    <div
                      key={m.id}
                      className="chat-aside__move"
                      data-tone={m.tone}
                    >
                      <span>{t(`crm.move.${m.id}`)}</span>
                      {(experience?.[m.id]?.used ?? 0) >= MIN_MOVE_USES ? (
                        <small
                          className="chat-aside__move-xp"
                          title={t('crm.move.experienceHint', {
                            bought: experience![m.id].bought,
                            refused: experience![m.id].refused,
                          })}
                        >
                          {t('crm.move.experience', {
                            replied: experience![m.id].replied,
                            used: experience![m.id].used,
                          })}
                        </small>
                      ) : null}
                      {m.tone !== 'stop' && onAsk ? (
                        <button
                          type="button"
                          disabled={askDisabled}
                          onClick={() => askMove(m.id)}
                        >
                          {t('crm.aside.askAgent')}
                        </button>
                      ) : null}
                    </div>
                  ))}
                </section>
              ) : (
                <p className="chat-aside__off">{t('crm.aside.moves.none')}</p>
              )}
              {ctx?.lastWords ? (
                <figure className="chat-aside__quote">
                  <figcaption>{t('crm.aside.lastWords')}</figcaption>
                  <blockquote className="chat-aside__words">
                    {ctx.lastWords}
                  </blockquote>
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
            </>
          )
        ) : null}

        {/* The client's group (owner, 2026-09-26): bound here, posted to by
            the agent only through a card the owner presses. */}
        {widget === 'group' ? (
          <ClientGroup
            client={client}
            name={name}
            onAsk={onAsk}
            askDisabled={askDisabled}
          />
        ) : null}

        {widget === 'soul' ? (
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

        {widget === 'package' ? (
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

        {widget === 'plan' ? (
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

        {widget === 'history' ? (
          <>
            {timeline.reachable && timeline.data ? (
              <ClientFeed timeline={timeline.data} />
            ) : !history.reachable ? (
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

        {/* THE CONTENT WIDGET IS THE BLOGGER'S (owner, 2026-10-03: "the
            content dashboard must appear only when the Blogger agent is
            chosen"). From 2026-09-29 it stood ALWAYS on the card ("why are
            there no gift buttons?"); now it comes and goes with the Blogger,
            like every specialist's widget. Both gifts are presses that put a
            task to the agent in THIS conversation -- the agent proposes a
            card, the owner sends it; nothing here writes to the client.
            Kept mounted while another widget is open, so a topic typed into
            the reel panel survives a look at the SOUL -- and the agent is
            still told what the panel is set to. Keyed by client: one
            client's topic never shows on the next one's card. */}
        {menuIds.has('content') ? (
          <section
            className="chat-aside__gifts"
            aria-label={t('crm.aside.gifts')}
            data-testid="chat-aside-gifts"
            hidden={widget !== 'content'}
          >
            <h3 className="chat-aside__label">{t('crm.aside.gifts')}</h3>
            {/* No. 1: the portrait. One gift per person; a portrait being
                drawn or already given is a state, not a button. */}
            {context.reachable ? (
              <div className="chat-aside__gift" data-testid="gift-portrait">
                <span>{t('crm.aside.portrait')}</span>
                <small>{portraitState}</small>
                {portraitMove && onAsk ? (
                  <button
                    type="button"
                    disabled={askDisabled}
                    onClick={() => askMove(portraitMove)}
                  >
                    {portraitMove === 'portraitSend'
                      ? t('crm.aside.gift.portrait.send')
                      : t('crm.aside.gift.portrait.give')}
                  </button>
                ) : null}
              </div>
            ) : null}
            {/* No. 2: the story reel. The panel asks the server itself,
                refuses quietly for a viewer it is not for, and starts a job
                whose finished reel comes back here as a press-to-send card. */}
            <StoryReelPanel key={client} clientId={client} />
          </section>
        ) : null}

        {/* Every other specialist brings its own repeat buttons; a press is
            a question in THIS conversation, the same door as a move. */}
        {widget === 'templates' && agent ? (
          <AgentTemplates
            agentId={agent}
            onSend={text => onAsk?.(text)}
            disabled={askDisabled || !onAsk}
          />
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
        <Link
          className="chat-aside__link"
          to={`/crm/${client}`}
          onClick={backToCard}
        >
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
