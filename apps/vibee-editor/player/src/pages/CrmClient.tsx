import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import './Crm.css'
import './CrmClient.css'
import { useLanguage } from '@/hooks/useLanguage'
import { Panel } from '@/components/Crm/Panel'
import {
  loadClientProfile,
  loadClientPlan,
  loadDuetRuns,
  loadClientHistory,
  loadLeadContext,
  loadLeadMedia,
  startDuet,
  type ClientProfile,
  type ClientPlan,
  type DuetRun,
  type DuetStart,
  type ClientHistory,
  type LeadContext,
  type LeadMedia,
  type Reached,
} from '@/lib/crm'

/**
 * ONE CLIENT, ON ONE SCREEN.
 *
 * The owner's complaint, verbatim: every client landed in one place. This is
 * the other place -- everything the system already knows about ONE lead,
 * keyed by their Telegram id, with the way into a conversation that is only
 * about them.
 *
 * ── NOTHING IS INVENTED HERE ───────────────────────────────────────────────
 *
 * Six independent loads, six panels. A panel whose tool did not answer says
 * `crm.client.unreachable` ("unavailable") and never a zero: zeros for a server that did not
 * answer would read as "this client has no plan, no duets, no messages" --
 * a verdict the screen has no right to pass. The rule and its test come from
 * `Crm.tsx`; the component that enforces it is shared.
 *
 * Nothing here sends anything to the client BY ITSELF. It reads, and it
 * links to the chat where the agent proposes and the owner confirms. The one
 * exception is the start-duet control in the Duets panel, and it is built so
 * that nothing leaves the building by accident: dry run is on by default,
 * turning it off demands a second, explicit confirmation, and the server
 * refuses anybody but the owner -- the screen shows that refusal verbatim
 * instead of guessing the role.
 */

const empty = <T,>(): Reached<T> => ({ reachable: true, data: null })

/** Allowed by the tool: 1..8 turns, 4 when nothing is said. */
const DUET_TURNS = [1, 2, 3, 4, 5, 6, 7, 8] as const
const DUET_TURNS_DEFAULT = 4

/** `2026-09-13T10:00:00Z` -> `13.09 10:00`; anything unparseable is shown as is. */
function when(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}.${mm} ${hh}:${mi}`
}

const mark = (yes: boolean) => (yes ? '✓' : '—')

export default function CrmClientPage() {
  const { t } = useLanguage()
  const { clientId = '' } = useParams<{ clientId: string }>()
  const [profile, setProfile] = useState<Reached<ClientProfile>>(empty)
  const [plan, setPlan] = useState<Reached<ClientPlan>>(empty)
  const [duets, setDuets] = useState<Reached<DuetRun[]>>(empty)
  const [history, setHistory] = useState<Reached<ClientHistory>>(empty)
  const [context, setContext] = useState<Reached<LeadContext>>(empty)
  const [media, setMedia] = useState<Reached<LeadMedia[]>>(empty)
  const [busy, setBusy] = useState(false)

  // The start-duet control. `confirming` is the inline step between a click
  // with dry run OFF and the call that sends real messages.
  const [duetTurns, setDuetTurns] = useState(DUET_TURNS_DEFAULT)
  const [duetDry, setDuetDry] = useState(true)
  const [duetConfirming, setDuetConfirming] = useState(false)
  const [duetBusy, setDuetBusy] = useState(false)
  const [duetResult, setDuetResult] = useState<Reached<DuetStart> | null>(null)

  const reload = useCallback(async () => {
    if (!clientId) return
    setBusy(true)
    // In parallel: six independent panels; one slow tool must not hold the
    // other five off the screen.
    const [pr, pl, du, hi, ctx, me] = await Promise.all([
      loadClientProfile(clientId),
      loadClientPlan(clientId),
      loadDuetRuns(clientId),
      loadClientHistory(clientId),
      loadLeadContext(clientId),
      loadLeadMedia(clientId),
    ])
    setProfile(pr)
    setPlan(pl)
    setDuets(du)
    setHistory(hi)
    setContext(ctx)
    setMedia(me)
    setBusy(false)
  }, [clientId])

  useEffect(() => {
    void reload()
  }, [reload])

  /**
   * The only thing on this screen that can reach the client. Runs the tool
   * and then RE-READS the Duets panel rather than inventing a row: the run's
   * state is the server's to tell.
   */
  const runDuet = async (dryRun: boolean) => {
    setDuetConfirming(false)
    setDuetBusy(true)
    const r = await startDuet(clientId, duetTurns, dryRun)
    setDuetResult(r)
    setDuetBusy(false)
    if (r.data?.started) setDuets(await loadDuetRuns(clientId))
  }

  const onStartDuet = () => {
    // A dry run sends nothing, so it needs no second question. Turning dry
    // run off does: real Telegram messages will go to this client.
    if (duetDry) void runDuet(true)
    else setDuetConfirming(true)
  }

  /**
   * The unreachable wording for THIS screen is the short one -- the
   * `crm.client.unreachable` key -- so the shared panel is given a state whose error carries no server
   * text; the key itself is the message.
   */
  const unreachable = (state: Reached<unknown>) =>
    state.reachable
      ? state
      : { reachable: false, error: t('crm.client.unreachable') }

  const p = profile.data
  const pl = plan.data
  const du = duets.data
  const hi = history.data
  const ctx = context.data
  const me = media.data

  const displayName = ctx?.name || p?.client || clientId
  const percent =
    pl && pl.total > 0 ? Math.round((pl.done / pl.total) * 100) : 0

  return (
    <div className="crm crm-client">
      <header className="crm__top">
        <div className="crm-client__head">
          <Link to="/crm" className="crm-client__crumb">
            ← {t('crm.client.back')}
          </Link>
          <h2>
            {t('crm.client.title', { id: displayName })}
            {ctx?.username ? (
              <span className="crm__muted"> @{ctx.username}</span>
            ) : null}
          </h2>
        </div>
        <button type="button" onClick={() => void reload()} disabled={busy}>
          {busy ? t('crm.refreshing') : t('crm.refresh')}
        </button>
      </header>

      {/* THE PRIMARY ACTION: a conversation that is only about this client. */}
      <Link to={`/crm/${clientId}/chat`} className="crm-client__chat">
        {t('crm.client.chatButton')}
      </Link>

      <Panel title={t('crm.client.profile.title')} state={unreachable(profile)}>
        {p && (
          <>
            <dl className="crm__stats crm-client__marks">
              <div>
                <dt>{t('crm.client.profile.profile')}</dt>
                <dd data-mark={p.hasProfile ? 'yes' : 'no'}>
                  {mark(p.hasProfile)}
                </dd>
              </div>
              <div>
                <dt>{t('crm.client.profile.soul')}</dt>
                <dd data-mark={p.hasSoul ? 'yes' : 'no'}>{mark(p.hasSoul)}</dd>
              </div>
              <div>
                <dt>{t('crm.client.profile.skills')}</dt>
                <dd data-mark={p.skills.length > 0 ? 'yes' : 'no'}>
                  {p.skills.length > 0 ? p.skills.length : '—'}
                </dd>
              </div>
            </dl>
            {p.skills.length > 0 ? (
              <ul className="crm-client__chips">
                {p.skills.map(s => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            ) : null}
            {p.updatedAt ? (
              <p className="crm__counts">
                {t('crm.client.profile.updated')} {when(p.updatedAt)}
              </p>
            ) : null}
          </>
        )}
      </Panel>

      <Panel title={t('crm.client.plan.title')} state={unreachable(plan)}>
        {pl &&
          (pl.total === 0 ? (
            <p className="crm__empty">{t('crm.client.empty')}</p>
          ) : (
            <>
              <p className="crm__counts">
                {t('crm.client.plan.progress', {
                  done: pl.done,
                  total: pl.total,
                })}
              </p>
              <div
                className="crm-client__bar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={pl.total}
                aria-valuenow={pl.done}
              >
                <span style={{ width: `${percent}%` }} />
              </div>
              <ul className="crm__list crm-client__goals">
                {pl.goals.map(g => (
                  <li key={g.id} className="crm__row">
                    <div className="crm__who">
                      <span>{g.title}</span>
                      <span className="crm__stage">
                        {g.done}/{g.total}
                      </span>
                    </div>
                    {g.intent ? <p className="crm__why">{g.intent}</p> : null}
                  </li>
                ))}
              </ul>
            </>
          ))}
      </Panel>

      <Panel title={t('crm.client.duets.title')} state={unreachable(duets)}>
        <div className="crm-client__duet-start">
          <label>
            {t('crm.client.duets.turns')}{' '}
            <select
              value={duetTurns}
              onChange={e => setDuetTurns(Number(e.target.value))}
              disabled={duetBusy}
            >
              {DUET_TURNS.map(n => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={duetDry}
              onChange={e => {
                setDuetDry(e.target.checked)
                setDuetConfirming(false)
              }}
              disabled={duetBusy}
            />{' '}
            {t('crm.client.duets.dry')}
          </label>
          <button
            type="button"
            className="crm-client__duet-go"
            onClick={onStartDuet}
            disabled={duetBusy || duetConfirming}
          >
            {duetBusy
              ? t('crm.client.duets.starting')
              : t('crm.client.duets.start')}
          </button>
        </div>
        {duetConfirming ? (
          <div className="crm-client__duet-confirm" role="alert">
            <p>{t('crm.client.duets.confirm')}</p>
            <div className="crm__acts">
              <button
                type="button"
                className="crm-client__duet-yes"
                onClick={() => void runDuet(false)}
              >
                {t('crm.client.duets.confirmYes')}
              </button>
              <button
                type="button"
                className="crm-client__duet-no"
                onClick={() => setDuetConfirming(false)}
              >
                {t('crm.client.duets.confirmNo')}
              </button>
            </div>
          </div>
        ) : null}
        {duetResult ? (
          <p
            className={`crm__counts crm-client__duet-result${
              duetResult.data?.started ? '' : ' crm-client__duet-result--no'
            }`}
          >
            {duetResult.data
              ? duetResult.data.started
                ? t('crm.client.duets.started', {
                    id: duetResult.data.duetId ?? '?',
                    state: duetResult.data.dryRun
                      ? t('crm.client.duets.dry')
                      : t('crm.client.duets.state.running'),
                  })
                : `${t('crm.client.duets.notStarted')}: ${
                    duetResult.data.reason ?? '—'
                  }`
              : `${t('crm.client.duets.error')}: ${duetResult.error ?? '—'}`}
          </p>
        ) : null}
        {du &&
          (du.length === 0 ? (
            <p className="crm__empty">{t('crm.client.duets.none')}</p>
          ) : (
            <ul className="crm__list">
              {du.map(r => (
                <li
                  key={r.id}
                  className={`crm__row crm-client__duet crm-client__duet--${r.state}`}
                >
                  <div className="crm__who">
                    <span>
                      {t(`crm.client.duets.state.${r.state}`)}
                      {r.dryRun ? (
                        <span className="crm__muted">
                          {' '}
                          · {t('crm.client.duets.dry')}
                        </span>
                      ) : null}
                    </span>
                    <span className="crm__stage">{when(r.startedAt)}</span>
                  </div>
                  <p className="crm__why">
                    {t('crm.client.duets.turns')} {r.turns} ·{' '}
                    {t('crm.client.duets.paid')} {r.paidCalls} ·{' '}
                    {t('crm.client.duets.media')} {r.mediaSent} ·{' '}
                    {t('crm.client.duets.violations')} {r.violations.length}{' '}
                    · {t('crm.client.duets.voice')} {r.voiceFlags.length}
                  </p>
                  {r.coverage.length > 0 ? (
                    <ul className="crm-client__chips">
                      {r.coverage.map(c => (
                        <li
                          key={c.tool}
                          className={c.fail > 0 ? 'crm-client__chip--fail' : ''}
                        >
                          {c.tool}: {c.ok}/{c.calls}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          ))}
      </Panel>

      <Panel title={t('crm.client.touches.title')} state={unreachable(history)}>
        {hi && (
          <>
            <p className="crm__counts">
              {t('crm.client.touches.stage')}:{' '}
              <strong>
                {hi.stage ? t(`crm.stage.${hi.stage}`) : '—'}
              </strong>
              {hi.waiting ? ` · ${t(`crm.wait.${hi.waiting}`)}` : ''}
            </p>
            {hi.touches.length === 0 ? (
              <p className="crm__empty">{t('crm.client.touches.none')}</p>
            ) : (
              <ul className="crm-client__timeline">
                {hi.touches.map((x, i) => (
                  <li key={`${x.at ?? ''}-${i}`}>
                    <span className="crm-client__time">{when(x.at)}</span>
                    {/* Kinds are the closed set from crm-touches.ts; each has
                        a key, so an unknown one shows its raw key on purpose. */}
                    <span className="crm-client__kind">
                      {t(`crm.act.${x.kind}`)}
                    </span>
                    {x.note ? (
                      <span className="crm__muted">{x.note}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Panel>

      <Panel title={t('crm.client.media.title')} state={unreachable(media)}>
        {me &&
          (me.length === 0 ? (
            <p className="crm__empty">{t('crm.client.media.none')}</p>
          ) : (
            <ul className="crm-client__timeline">
              {me.map(m => (
                <li key={m.id}>
                  <span className="crm-client__time">{when(m.at)}</span>
                  <span className="crm-client__kind">{m.kind}</span>
                  {m.url ? (
                    <a href={m.url} target="_blank" rel="noreferrer">
                      {m.name || m.kind}
                    </a>
                  ) : (
                    <span>{m.name || m.kind}</span>
                  )}
                  <span className="crm__muted">
                    {m.out
                      ? t('crm.client.media.ours')
                      : t('crm.client.media.theirs')}
                  </span>
                </li>
              ))}
            </ul>
          ))}
      </Panel>

      <Panel title={t('crm.client.messages.title')} state={unreachable(context)}>
        {ctx && (
          <>
            {ctx.waitingOnUs ? (
              <p className="crm__counts crm-client__waiting">
                {t('crm.client.messages.waitingOnUs')}
              </p>
            ) : null}
            {ctx.messages.length === 0 ? (
              <p className="crm__empty">{t('crm.client.messages.none')}</p>
            ) : (
              <ul className="crm-client__dm">
                {ctx.messages.map((m, i) => (
                  <li
                    key={`${m.at ?? ''}-${i}`}
                    className={m.out ? 'crm-client__dm--out' : ''}
                  >
                    <span className="crm-client__time">
                      {m.out
                        ? t('crm.client.messages.us')
                        : t('crm.client.messages.them')}
                      {m.at ? ` · ${when(m.at)}` : ''}
                    </span>
                    <p>{m.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Panel>

      <p className="crm__note">{t('crm.note')}</p>
    </div>
  )
}
