import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import './Crm.css'
import { useLanguage } from '@/hooks/useLanguage'
import { Panel } from '@/components/Crm/Panel'
import {
  loadOverview,
  loadWaiting,
  loadHotLeads,
  loadClients,
  recordTouch,
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

type ClientsFilter = 'all' | 'clients' | 'leads'

export default function CrmPage() {
  const { t } = useLanguage()
  const [overview, setOverview] = useState<Reached<Overview>>(empty)
  const [waiting, setWaiting] = useState<Reached<WaitingList>>(empty)
  const [leads, setLeads] = useState<Reached<HotLeads>>(empty)
  const [clients, setClients] = useState<Reached<ClientsList>>(empty)
  const [clientsFilter, setClientsFilter] = useState<ClientsFilter>('all')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    setBusy(true)
    // In parallel: four independent panels, and one slow load must not hold
    // the others off the screen.
    const [o, w, l, c] = await Promise.all([
      loadOverview(),
      loadWaiting(),
      loadHotLeads(),
      loadClients(),
    ])
    setOverview(o)
    setWaiting(w)
    setLeads(l)
    setClients(c)
    setBusy(false)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

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
  const panel = (
    title: string,
    state: { reachable: boolean; error?: string },
    body: React.ReactNode
  ) => (
    <Panel title={title} state={state}>
      {body}
    </Panel>
  )

  const row = (r: WaitingRow) => (
    <li key={r.telegramId} className={`crm__row crm__row--${r.waiting}`}>
      <div className="crm__who">
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
      <div className="crm__acts">
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

  const w = waiting.data
  const l = leads.data
  const o = overview.data
  const c = clients.data

  const allClients = c?.clients ?? []
  const onlyClients = allClients.filter(isClient)
  const onlyLeads = allClients.filter(x => !isClient(x))
  const shownClients =
    clientsFilter === 'clients'
      ? onlyClients
      : clientsFilter === 'leads'
        ? onlyLeads
        : allClients
  const filterChips: Array<[ClientsFilter, number]> = [
    ['all', allClients.length],
    ['clients', onlyClients.length],
    ['leads', onlyLeads.length],
  ]

  return (
    <div className="crm">
      <header className="crm__top">
        <h2>{t('crm.title')}</h2>
        <button type="button" onClick={() => void reload()} disabled={busy}>
          {busy ? t('crm.refreshing') : t('crm.refresh')}
        </button>
      </header>

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
            ) : null}
            <ul className="crm__list">
              {shownClients.map(x => (
                <li key={x.telegramId} className="crm__row crm__row--client">
                  <div className="crm__who">
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
                </li>
              ))}
            </ul>
          </>
        )
      )}

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

      <p className="crm__note">{t('crm.note')}</p>
    </div>
  )
}
