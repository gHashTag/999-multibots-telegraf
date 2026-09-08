import { useCallback, useEffect, useState } from 'react'
import './Crm.css'
import { useLanguage } from '@/hooks/useLanguage'
import {
  loadOverview,
  loadWaiting,
  loadHotLeads,
  recordTouch,
  type Overview,
  type WaitingList,
  type HotLeads,
  type WaitingRow,
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

export default function CrmPage() {
  const { t } = useLanguage()
  const [overview, setOverview] = useState<Reached<Overview>>(empty)
  const [waiting, setWaiting] = useState<Reached<WaitingList>>(empty)
  const [leads, setLeads] = useState<Reached<HotLeads>>(empty)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    setBusy(true)
    // In parallel: three independent panels, and one slow load must not hold
    // the other two off the screen.
    const [o, w, l] = await Promise.all([
      loadOverview(),
      loadWaiting(),
      loadHotLeads(),
    ])
    setOverview(o)
    setWaiting(w)
    setLeads(l)
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

  /**
   * A panel that could not load says so.
   *
   * Rendering zeros for an unreachable server tells the owner their business is
   * dead -- a worse lie than an empty screen, and indistinguishable from a
   * quiet week.
   */
  const panel = (
    title: string,
    state: { reachable: boolean; error?: string },
    body: React.ReactNode
  ) => (
    <section className="crm__panel">
      <h3 className="crm__panel-title">{title}</h3>
      {state.reachable ? (
        body
      ) : (
        <p className="crm__unreachable">
          {t('crm.unreachable')}
          {state.error ? `: ${state.error}` : ''}
        </p>
      )}
    </section>
  )

  const row = (r: WaitingRow) => (
    <li key={r.telegramId} className={`crm__row crm__row--${r.waiting}`}>
      <div className="crm__who">
        {r.link ? (
          <a href={r.link} target="_blank" rel="noreferrer">
            {r.name || r.telegramId}
          </a>
        ) : (
          <span>{r.name || r.telegramId}</span>
        )}
        <span className="crm__stage">{t(`crm.stage.${r.stage}`)}</span>
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
                    {p.link ? (
                      <a href={p.link} target="_blank" rel="noreferrer">
                        {p.name || p.telegramId}
                      </a>
                    ) : (
                      <span>{p.name || p.telegramId}</span>
                    )}
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
