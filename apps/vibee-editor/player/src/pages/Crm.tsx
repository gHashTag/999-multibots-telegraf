import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import './Crm.css'
import { useLanguage } from '@/hooks/useLanguage'
import { Panel } from '@/components/Crm/Panel'
import { AllRefused } from '@/components/Crm/AllRefused'
import { coveredByNotice, oneReasonForAll } from '@/components/Crm/refusalRules'
import { AutoPanel } from '@/components/Crm/AutoPanel'
import { TrafficPanel } from '@/components/Crm/TrafficPanel'
import { RevenuePanel } from '@/components/Crm/RevenuePanel'
import { Avatar } from '@/components/Crm/Avatar'
import { FunnelStrip } from '@/components/Crm/FunnelStrip'
import { WinbackPanel } from '@/components/Crm/WinbackPanel'
import { askAgentInThread } from '@/lib/crmAsk'
import { CrmMap } from '@/components/Crm/CrmMap'
import { SectionStrip, useSectionTab } from '@/components/common/SectionStrip'
import {
  LEADS_SECTIONS,
  LeadsSections,
  type LeadsSectionId,
} from '@/components/Leads/LeadsSections'
import { fetchSessions, leadsBackendOk } from '@/atoms/leads'
import {
  loadOverview,
  loadWaiting,
  loadHotLeads,
  loadFunnel,
  loadWinback,
  type Funnel,
  type WinbackList,
  matches,
  ensureAvatars,
  loadClientsPage,
  appendClients,
  loadGroups,
  type GroupRow,
  recordTouch,
  dropClient,
  restoreClient,
  loadAutopilotLeads,
  pickForAutopilot,
  type Overview,
  type WaitingList,
  type HotLeads,
  type WaitingRow,
  type ClientRow,
  type ClientsList,
  type Reached,
} from '@/lib/crm'

/**
 * THE CRM, ON A SCREEN.
 *
 * Until now it existed only through the agent: you asked in words and read a
 * paragraph back. Fine for "how are we doing", useless for the thing this is
 * actually for -- looking at who is waiting and doing something about it.
 *
 * ── WHAT IS AT THE TOP IS THE WHOLE DESIGN ─────────────────────────────────
 *
 * Waiting comes first, and inside it, people who answered US. Every other CRM
 * opens on a dashboard of totals, and totals do not tell anybody what to do
 * this morning. Somebody who replied and got silence is the one item that
 * costs money every day it is ignored, so it is the first thing on the page.
 *
 * ── NOTHING HERE SENDS ANYTHING ────────────────────────────────────────────
 *
 * The buttons record what already happened. They change our memory, never
 * somebody else's chat. Sending is confirmed one message at a time in the bot,
 * and this screen deliberately offers no shortcut around that.
 */

const empty = <T,>(): Reached<T> => ({ reachable: true, data: null })

/**
 * WHO COUNTS AS A CLIENT in the list filter.
 *
 * Somebody who paid is a client whatever their touches say; somebody whose
 * touches say `client` or `winback` is one even when payments could not be
 * read. Everybody else is a lead. One predicate, used for the chips and the
 * counts, so the two can never disagree.
 */
const isClient = (x: ClientRow) =>
  x.paid || x.stage === 'client' || x.stage === 'winback'

type ClientsFilter = 'all' | 'clients' | 'leads' | 'groups'

/** One page of the clients list; "More" asks for the next (#2947). */
const CLIENTS_PAGE = 100

/** A week, in milliseconds: the window "touched recently" means. */
const UNDER_WAY_MS = 7 * 24 * 60 * 60 * 1000

/**
 * WHO IS ALREADY UNDER WAY -- the owner's "VIP", 2026-09-23: he wants to see
 * at once whom work is being done with, so they are not started again from
 * the top of the list.
 *
 * Three signals, any of them enough, and every one of them means somebody has
 * already invested in this person: they PAID, or they have a client package
 * written for them, or they were seen this week. Deliberately not a flag
 * anybody has to set by hand -- a flag like that is accurate for a week and
 * then lies.
 */
export const isUnderWay = (x: ClientRow, now = Date.now()) => {
  if (x.paid || x.hasProfile) return true
  const seen = x.lastSeen ? new Date(x.lastSeen).getTime() : NaN
  return Number.isFinite(seen) && now - seen < UNDER_WAY_MS
}

/** Name, @handle or id -- whatever the person typed, matched case-blind. */
// Lives in lib/crm.ts so the all-clients picker in the chat searches the
// same way without importing this page; re-exported for its tests.
export { matches }

export default function CrmPage() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  /*
   * LEADS ARE CLIENT WORK, SO THEY ARE SECTIONS HERE.
   *
   * They used to be a screen of their own at /search whose five tabs sat at
   * the BOTTOM, underneath the app's own tab bar (owner's screenshot,
   * 2026-09-23). Now this screen owns them -- but only while the server
   * actually has them. One request answers that (the same one the account
   * selector makes anyway), and until it does, the row is not drawn at all:
   * a section that can only say "no server" is not a section.
   */
  const [leadsLive, setLeadsLive] = useState(false)
  useEffect(() => {
    let alive = true
    void fetchSessions().then(() => {
      if (alive) setLeadsLive(leadsBackendOk === true)
    })
    return () => {
      alive = false
    }
  }, [])

  /*
   * Every id is accepted by the reader, so a link to ?tab=leads survives the
   * moment before the probe answers; if the server turns out not to have
   * them, the screen falls back to its own work rather than to an empty room.
   */
  const [asked, pick] = useSectionTab(['work', 'map', ...LEADS_SECTIONS])
  const tab = leadsLive || asked === 'work' || asked === 'map' ? asked : 'work'
  const [overview, setOverview] = useState<Reached<Overview>>(empty)
  const [waiting, setWaiting] = useState<Reached<WaitingList>>(empty)
  const [leads, setLeads] = useState<Reached<HotLeads>>(empty)
  const [funnel, setFunnel] = useState<Reached<Funnel>>(empty)
  const [winback, setWinback] = useState<Reached<WinbackList>>(empty)
  const [clients, setClients] = useState<Reached<ClientsList>>(empty)
  const [clientsFilter, setClientsFilter] = useState<ClientsFilter>('all')
  /* The owner's groups (#2950): null until read, [] when there are none. */
  const [groups, setGroups] = useState<GroupRow[] | null>(null)
  const [query, setQuery] = useState('')
  /** Ids the screen has removed in this session, with the way back on the row. */
  const [dropped, setDropped] = useState<Record<string, boolean>>({})
  /**
   * WHOM AUTO MAY WRITE TO -- REACHABLE FROM A PHONE.
   *
   * The tick shipped yesterday on the client's card beside the chat, and that
   * card is `display: none` below 1100px. So on the screen the owner actually
   * works from, the "chosen" scope could never be filled: a setting that
   * cannot be reached where the person is, is a setting that does not exist.
   *
   * `null` means the list has not been read yet, and no tick is drawn then --
   * an unticked box that has merely not loaded is a lie about a setting that
   * sends messages.
   */
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    setBusy(true)
    // In parallel: four independent panels, and one slow load must not hold
    // the others off the screen.
    void loadGroups().then(g => setGroups(g.data ?? null))
    // The funnel and the win-back list are read beside the four, not with
    // them: a slow summary over the whole base must not hold the waiting
    // list off the screen.
    void loadFunnel().then(setFunnel)
    void loadWinback().then(setWinback)
    const [o, w, l, c, picks] = await Promise.all([
      loadOverview(),
      loadWaiting(),
      loadHotLeads(),
      loadClientsPage({ limit: CLIENTS_PAGE }),
      loadAutopilotLeads(),
    ])
    setOverview(o)
    setWaiting(w)
    setLeads(l)
    setClients(c)
    setPicked(picks.data ? new Set(picks.data) : null)
    setBusy(false)
    // Faces the list has no picture for, fetched by the owner's session in
    // the background; the list is re-read only if some actually arrived.
    if (c.data?.clients.some(x => !x.avatarUrl)) {
      void ensureAvatars().then(async n => {
        if (n > 0) setClients(await loadClientsPage({ limit: CLIENTS_PAGE }))
      })
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  /*
   * EVERY CLIENT, NOT THE FIRST PAGE (#2947). "More" appends the next page;
   * a search of two letters or more also asks the server, so a person who
   * is not on the loaded pages is still found. Both only ADD rows -- the
   * search box keeps filtering what is on the screen as before.
   */
  const [loadingMore, setLoadingMore] = useState(false)
  const addClients = useCallback(
    (more: ClientsList, nextOffset: number | null | undefined) =>
      setClients(prev =>
        prev.data
          ? {
              ...prev,
              data: {
                ...prev.data,
                clients: appendClients(prev.data.clients, more.clients),
                nextOffset:
                  nextOffset === undefined ? prev.data.nextOffset : nextOffset,
              },
            }
          : prev
      ),
    []
  )
  const loadMoreClients = async () => {
    const from = clients.data?.nextOffset
    if (from == null || loadingMore) return
    setLoadingMore(true)
    const page = await loadClientsPage({ limit: CLIENTS_PAGE, offset: from })
    if (page.data) addClients(page.data, page.data.nextOffset)
    setLoadingMore(false)
  }
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) return
    let live = true
    const timer = setTimeout(() => {
      void loadClientsPage({ limit: CLIENTS_PAGE, query: q }).then(found => {
        // A search result is not a page of the list: nextOffset stays.
        if (live && found.data) addClients(found.data, undefined)
      })
    }, 300)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [query, addClients])

  /*
   * Remove from the CRM. The confirmation is the browser's own: this screen
   * has no dialog of its own, and inventing one for a single destructive
   * action would be a component nobody else uses. The row is marked here
   * rather than reloaded, so the way back stays in front of the person who
   * pressed it.
   */
  /**
   * EVERYBODY WHO IS WAITING FOR US, PICKED IN ONE TAP.
   *
   * `chosen` is the safe way to run AUTO, and filling it one tick at a time
   * is exactly the work nobody does at midnight. The group this offers is not
   * an arbitrary bulk action: people whose last message was THEIRS and who
   * have had no answer are where an automatic reply is least likely to be
   * wrong and most likely to be late.
   *
   * It is a SNAPSHOT, not a rule -- whoever is waiting right now is added,
   * and nobody is removed. A rule that silently kept adding people would be a
   * standing permission the owner never gave.
   */
  const pickEveryoneWaiting = async () => {
    const ours = (waiting.data?.waiting ?? [])
      .filter(r => r.waiting === 'ours')
      .map(r => r.telegramId)
      .filter(id => /^\d{5,15}$/.test(id) && !picked?.has(id))
      // A cap, so a list that grew unexpectedly cannot turn one tap into
      // fifty writes: what is left over is still one tick away.
      .slice(0, 20)
    if (!ours.length) return
    setPicked(prev => new Set([...(prev ?? []), ...ours]))
    const results = await Promise.all(
      ours.map(id => pickForAutopilot(id, true))
    )
    // Whatever the server refused goes back off: the screen must end up
    // showing what is actually stored.
    const refused = ours.filter((_, i) => !results[i].reachable)
    if (refused.length)
      setPicked(prev => {
        const back = new Set(prev ?? [])
        for (const id of refused) back.delete(id)
        return back
      })
  }

  const drop = async (x: ClientRow) => {
    const name = x.name || x.username || x.telegramId
    if (!window.confirm(t('crm.row.dropAsk', { name }))) return
    const r = await dropClient(x.telegramId)
    if (r.data?.dropped) setDropped(d => ({ ...d, [x.telegramId]: true }))
  }

  const undrop = async (telegramId: string) => {
    const r = await restoreClient(telegramId)
    if (r.data?.restored !== false)
      setDropped(d => ({ ...d, [telegramId]: false }))
  }

  /*
   * PREPARE: the agent drafts the answer in this client's own thread, and the
   * owner lands there to press Send or not. Nothing reaches the client from
   * this button -- it only asks the agent (CRM audit 2026-09-27, #6: the
   * list said who waits and gave only buttons that log a touch).
   */
  const prepare = (r: WaitingRow) =>
    askAgentInThread(
      r.telegramId,
      t('crm.wait.prepareAsk', {
        name: r.name || r.telegramId,
        why: r.nextWhy || r.because,
      }),
      navigate
    )

  const touch = async (telegramId: string, kind: string) => {
    await recordTouch(telegramId, kind)
    /*
     * Re-read rather than patch the row in place. The stage and the waiting
     * kind are DERIVED on the server; guessing the new one here would put a
     * second copy of that rule in the browser, and two copies of a rule are how
     * one gets fixed and the other forgotten.
     */
    await reload()
  }

  // The unreachable-panel rule lives in `components/Crm/Panel.tsx`, shared
  // with the per-client dashboard.
  /*
   * ONE FACT, NOT FIVE COPIES OF IT.
   *
   * When every panel failed the SAME way -- what an expired session looks
   * like -- the screen said the same sentence five times (455px at 375px
   * wide) and none of them said what to do. The notice says it once, with
   * the step; the panels it covers stay quiet. A single broken panel among
   * working ones still speaks in its own place.
   */
  const noticeReason = oneReasonForAll([overview, waiting, leads, clients])
  const panel = (
    title: string,
    state: { reachable: boolean; error?: string },
    body: React.ReactNode
  ) => (
    <Panel
      title={title}
      state={state}
      quiet={coveredByNotice(state, noticeReason)}
    >
      {body}
    </Panel>
  )

  const faces = new Map(
    (clients.data?.clients ?? []).map(x => [x.telegramId, x.avatarUrl])
  )

  const row = (r: WaitingRow) => (
    <li key={r.telegramId} className={`crm__row crm__row--${r.waiting}`}>
      <div className="crm__who">
        <Avatar
          name={r.name || r.telegramId}
          url={faces.get(r.telegramId)}
          size={36}
        />
        {/* The name opens the client's own page; the t.me link stays as a
            small secondary control so the primary tap lands inside the app. */}
        <Link to={`/crm/${r.telegramId}`} className="crm__open">
          {r.name || r.telegramId}
        </Link>
        <span className="crm__stage">
          {r.link ? (
            <a href={r.link} target="_blank" rel="noreferrer">
              t.me
            </a>
          ) : null}{' '}
          {t(`crm.stage.${r.stage}`)}
        </span>
      </div>
      <p className="crm__why">
        {t(`crm.wait.${r.waiting}`)} · {r.days} · {r.because}
      </p>
      {r.nextWhy ? <p className="crm__next">{r.nextWhy}</p> : null}
      <div className="crm__acts">
        <button
          type="button"
          className="crm__prepare"
          onClick={() => prepare(r)}
        >
          {t('crm.wait.prepare')}
        </button>
        {/*
          The three that describe what actually happened. No "warm" or "in
          progress": a month later nobody can count those.
        */}
        {(['written', 'replied', 'refused'] as const).map(kind => (
          <button
            key={kind}
            type="button"
            onClick={() => void touch(r.telegramId, kind)}
          >
            {t(`crm.act.${kind}`)}
          </button>
        ))}
      </div>
    </li>
  )

  /**
   * ONE PERSON IN THE CLIENTS LIST -- the same row under both headings, so
   * "under way" and "the rest" cannot drift into two different rows.
   *
   * The remove button is the only destructive control on this screen, so it
   * asks first and, once done, the row keeps the way back rather than
   * vanishing: a list that silently loses a line teaches nobody what happened.
   */
  const clientRow = (x: ClientRow) => (
    <li key={x.telegramId} className="crm__row crm__row--client">
      <div className="crm__who">
        <Avatar name={x.name || x.telegramId} url={x.avatarUrl} size={36} />
        <Link to={`/crm/${x.telegramId}`} className="crm__open">
          {x.name || x.telegramId}
          {x.username ? (
            <span className="crm__muted"> @{x.username}</span>
          ) : null}
        </Link>
        <span className="crm__stage">
          {x.paid ? (
            <span className="crm__badge crm__badge--paid">
              {t('crm.clients.paid')}
            </span>
          ) : null}
          {t(`crm.stage.${x.stage}`)}
        </span>
      </div>
      <p className="crm__why">
        {x.client ?? '—'}
        {' · '}
        {t('crm.clients.profile')} {x.hasProfile ? '✓' : '—'}
        {' · '}
        {t('crm.clients.soul')} {x.hasSoul ? '✓' : '—'}
        {' · '}
        {t('crm.clients.duets', { n: x.duets })}
      </p>
      <div className="crm__acts">
        {picked === null ? null : (
          <label className="crm__auto">
            <input
              type="checkbox"
              checked={picked.has(x.telegramId)}
              onChange={async e => {
                const on = e.target.checked
                // Optimistic, then corrected by the server: this tick decides
                // whether messages go to a real person, so the screen must end
                // up showing what the server says, not what it hoped.
                setPicked(prev => {
                  const next = new Set(prev ?? [])
                  if (on) next.add(x.telegramId)
                  else next.delete(x.telegramId)
                  return next
                })
                const r = await pickForAutopilot(x.telegramId, on)
                if (!r.reachable)
                  setPicked(prev => {
                    const back = new Set(prev ?? [])
                    if (on) back.delete(x.telegramId)
                    else back.add(x.telegramId)
                    return back
                  })
              }}
            />
            <span>{t('crm.row.auto')}</span>
          </label>
        )}
        {dropped[x.telegramId] ? (
          <>
            <span className="crm__muted">{t('crm.row.dropped')}</span>
            <button type="button" onClick={() => void undrop(x.telegramId)}>
              {t('crm.row.restore')}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="crm__danger"
            onClick={() => void drop(x)}
          >
            {t('crm.row.drop')}
          </button>
        )}
      </div>
    </li>
  )

  const w = waiting.data
  const l = leads.data
  const o = overview.data
  const c = clients.data

  /*
   * The search narrows EVERYTHING below it -- the chips, their counts and both
   * lists. A count that ignores the search would send somebody hunting for a
   * row that is not on the screen.
   */
  const allClients = (c?.clients ?? []).filter(x => matches(x, query))
  const q = query.trim().toLowerCase()
  const shownGroups = (groups ?? []).filter(
    g =>
      !q ||
      [g.title, g.username, g.chatId].some(v =>
        String(v ?? '')
          .toLowerCase()
          .includes(q)
      )
  )
  const onlyClients = allClients.filter(isClient)
  const onlyLeads = allClients.filter(x => !isClient(x))
  const inFilter =
    clientsFilter === 'clients'
      ? onlyClients
      : clientsFilter === 'leads'
        ? onlyLeads
        : allClients
  // Under way first, and only once: the same person must not appear twice.
  const underWay = inFilter.filter(x => isUnderWay(x))
  const shownClients = inFilter.filter(x => !isUnderWay(x))
  const filterChips: Array<[ClientsFilter, number]> = [
    ['all', allClients.length],
    ['clients', onlyClients.length],
    ['leads', onlyLeads.length],
    ...(groups
      ? [['groups', shownGroups.length] as [ClientsFilter, number]]
      : []),
  ]

  const sections = [
    { id: 'work', label: t('crm.section.work') },
    // Owner, 2026-09-25: everybody as round avatars by sphere, the owner in
    // the centre, links between people as a graph (components/Crm/CrmMap).
    { id: 'map', label: t('crm.section.map') },
    ...(leadsLive
      ? LEADS_SECTIONS.map(id => ({ id, label: t(`crm.section.${id}`) }))
      : []),
  ]

  return (
    <div className="crm">
      <header className="crm__top">
        <h2>{t('crm.title')}</h2>
        <button type="button" onClick={() => void reload()} disabled={busy}>
          {busy ? t('crm.refreshing') : t('crm.refresh')}
        </button>
      </header>

      {noticeReason ? <AllRefused reason={noticeReason} /> : null}

      {/* One row, and only when there is more than one thing in it. */}
      {sections.length > 1 ? (
        <SectionStrip
          sections={sections}
          active={tab}
          onPick={pick}
          label={t('crm.sections')}
        />
      ) : null}

      {tab === 'map' ? <CrmMap /> : null}

      {tab === 'work' || tab === 'map' ? null : (
        <LeadsSections section={tab as LeadsSectionId} />
      )}

      {tab !== 'work' ? null : (
        <>
          {/* How many stand at each stage; nothing at all when unknown. */}
          <FunnelStrip state={funnel} />

          {/* The one control that changes what happens without the owner. */}
          <AutoPanel />

          {panel(
            t('crm.waiting.title'),
            waiting,
            w && w.total === 0 ? (
              <p className="crm__empty">{t('crm.waiting.none')}</p>
            ) : (
              <>
                {w && (
                  <p className="crm__counts">
                    {t('crm.waiting.counts', {
                      ours: w.ours,
                      due: w.due,
                      theirs: w.theirs,
                    })}
                  </p>
                )}
                {w && picked !== null && w.ours > 0 ? (
                  <button
                    type="button"
                    className="crm__pick-all"
                    onClick={() => void pickEveryoneWaiting()}
                  >
                    {t('crm.waiting.pickAll', { n: w.ours })}
                  </button>
                ) : null}
                <ul className="crm__list">{(w?.waiting ?? []).map(row)}</ul>
              </>
            )
          )}

          {panel(
            t('crm.leads.title'),
            leads,
            l && (
              <>
                <p className="crm__counts">
                  {t('crm.leads.counts', { found: l.found })}
                  {l.setAsideTouched > 0
                    ? ` · ${t('crm.leads.setAside', { n: l.setAsideTouched })}`
                    : ''}
                </p>
                <ul className="crm__list">
                  {l.leads.map(p => (
                    <li key={p.telegramId} className="crm__row">
                      <div className="crm__who">
                        <Link to={`/crm/${p.telegramId}`} className="crm__open">
                          {p.name || p.telegramId}
                        </Link>
                        {p.link ? (
                          <span className="crm__stage">
                            <a href={p.link} target="_blank" rel="noreferrer">
                              t.me
                            </a>
                          </span>
                        ) : null}
                      </div>
                      <p className="crm__why">
                        {p.bot ?? '—'} ·{' '}
                        {t('crm.leads.quiet', { days: p.quietDays ?? '?' })}
                      </p>
                      <div className="crm__acts">
                        <button
                          type="button"
                          onClick={() => void touch(p.telegramId, 'written')}
                        >
                          {t('crm.act.written')}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )
          )}

          {/*
            Former buyers gone quiet. A tool that refuses this viewer hides
            the panel; a server that could not be reached says so.
          */}
          {winback.refused
            ? null
            : panel(
                t('crm.winback.title'),
                winback,
                winback.data ? (
                  <WinbackPanel list={winback.data} faces={faces} />
                ) : null
              )}

          {panel(
            t('crm.clients.title'),
            clients,
            c && allClients.length === 0 ? (
              <p className="crm__empty">{t('crm.clients.none')}</p>
            ) : (
              <>
                {c && !c.paidKnown ? (
                  // Payments could not be read: every `paid` below is false for
                  // lack of data, and the reader must not take it for a fact.
                  <p className="crm__counts crm__paid-unknown">
                    {t('crm.clients.paidUnknown')}
                  </p>
                ) : null}
                {c ? (
                  <>
                    <label className="crm__search">
                      <span className="crm__muted">
                        {t('crm.filter.search')}
                      </span>
                      <input
                        type="search"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        aria-label={t('crm.filter.search')}
                      />
                    </label>
                    <div className="crm__filter" role="group">
                      {filterChips.map(([kind, n]) => (
                        <button
                          key={kind}
                          type="button"
                          className={`crm__chip${
                            clientsFilter === kind ? ' crm__chip--on' : ''
                          }`}
                          aria-pressed={clientsFilter === kind}
                          onClick={() => setClientsFilter(kind)}
                        >
                          {t(`crm.clients.filter.${kind}`)} {n}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
                {/*
                  UNDER WAY, FIRST AND SEPARATELY. These are the people
                  somebody has already invested in; starting them again from
                  the top of the list is how a client hears the same opening
                  twice.
                */}
                {clientsFilter === 'groups' ? (
                  /*
                    GROUPS ARE NOT CLIENTS (#2950): a group is where clients
                    speak. Each opens read-only, with who speaks there.
                  */
                  shownGroups.length === 0 ? (
                    <p className="crm__empty">{t('crm.groups.none')}</p>
                  ) : (
                    <ul className="crm__list">
                      {shownGroups.map(g => (
                        <li key={g.chatId} className="crm__row">
                          <Link to={`/crm/g/${g.chatId}/chat`}>
                            {g.title ||
                              (g.username ? `@${g.username}` : g.chatId)}
                          </Link>{' '}
                          <span className="crm__muted">
                            {t('crm.groups.row', {
                              members: g.membersCount ?? '—',
                              messages: g.messages,
                            })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )
                ) : null}
                {clientsFilter === 'groups' ? null : (
                  <>
                    <h4 className="crm__subtitle">
                      {t('crm.vip.title')} {underWay.length}
                    </h4>
                    <p className="crm__counts">{t('crm.vip.note')}</p>
                    {underWay.length === 0 ? (
                      <p className="crm__empty">{t('crm.vip.empty')}</p>
                    ) : (
                      <ul className="crm__list">{underWay.map(clientRow)}</ul>
                    )}
                    <ul className="crm__list">{shownClients.map(clientRow)}</ul>
                  </>
                )}
                {clientsFilter !== 'groups' && c && c.nextOffset !== null ? (
                  <button
                    type="button"
                    className="crm__more"
                    onClick={() => void loadMoreClients()}
                    disabled={loadingMore}
                  >
                    {loadingMore
                      ? t('crm.clients.loadingMore')
                      : t('crm.clients.more')}
                  </button>
                ) : null}
              </>
            )
          )}

          {/* What the owner's clients have brought, from the live wallet. */}
          <RevenuePanel noticeReason={noticeReason} />

          {panel(
            t('crm.audience.title'),
            overview,
            o && (
              <dl className="crm__stats">
                <div>
                  <dt>{t('crm.audience.total')}</dt>
                  <dd>{o.people ?? '—'}</dd>
                </div>
                <div>
                  <dt>{t('crm.audience.paying')}</dt>
                  <dd>
                    {o.paying ?? '—'}{' '}
                    <span className="crm__muted">{o.payingShare ?? ''}</span>
                  </dd>
                </div>
                <div>
                  <dt>{t('crm.audience.came7')}</dt>
                  <dd>{o.came7 ?? '—'}</dd>
                </div>
                <div>
                  <dt>{t('crm.audience.came30')}</dt>
                  <dd>{o.came30 ?? '—'}</dd>
                </div>
              </dl>
            )
          )}

          {/* Where people come from (#2974): the owner's only. */}
          <TrafficPanel noticeReason={noticeReason} />

          <p className="crm__note">{t('crm.note')}</p>
        </>
      )}
    </div>
  )
}
