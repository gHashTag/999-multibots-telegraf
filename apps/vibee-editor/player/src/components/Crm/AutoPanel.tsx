import { useCallback, useEffect, useState } from 'react'
import { useLanguage } from '@/hooks/useLanguage'
import {
  loadAutopilot,
  setAutopilot,
  loadOutcomes,
  type Autopilot,
  type AutopilotScope,
  type Outcomes,
  type Reached,
} from '@/lib/crm'

/**
 * THE AUTO SWITCH, WHERE THE WORK IS PLANNED.
 *
 * Owner, 2026-09-23: "right now it is the mode where the agent asks about
 * everything -- make an AUTO mode". This is that mode's one control: while it
 * is on, a prepared card goes to the client by itself and the owner gets a
 * receipt with a stop button instead of a question.
 *
 * THE TWO NUMBERS ARE THE POINT. A switch that says only "on" invites exactly
 * two questions -- until when, and how many more -- so it answers both before
 * they are asked: the window has an end, and the day has a budget. Both come
 * from the server, which is also where they are enforced; nothing here
 * decides whether a particular card may go.
 *
 * AN UNREADABLE SWITCH SAYS SO. Showing "off" for a state that could not be
 * read would teach the owner that nothing is sending when something might be.
 */
export function AutoPanel() {
  const { t } = useLanguage()
  const [state, setState] = useState<Reached<Autopilot>>({
    reachable: true,
    data: null,
  })
  const [busy, setBusy] = useState(false)
  const [score, setScore] = useState<Reached<Outcomes>>({
    reachable: true,
    data: null,
  })

  const read = useCallback(async () => {
    const [a, o] = await Promise.all([loadAutopilot(), loadOutcomes(7)])
    setState(a)
    setScore(o)
  }, [])

  useEffect(() => {
    void read()
  }, [read])

  /**
   * WHOM IT MAY WRITE TO, chosen before it is switched on.
   *
   * Every product in this space scopes its automation to an audience rather
   * than to everybody, and the reason is the flinch this removes: the owner is
   * not afraid of automation, he is afraid of it writing to the WRONG person.
   * `chosen` with nobody picked sends nothing at all -- which the line under
   * the switch says out loud, so an empty list is never mistaken for silence.
   */
  const [scope, setScope] = useState<AutopilotScope>('all')

  const flip = async (on: boolean) => {
    setBusy(true)
    const next = await setAutopilot(on, undefined, scope)
    // The answer carries the new state, so nothing is guessed here: the window
    // and the budget are the server's to compute.
    setState(next.data ? next : await loadAutopilot().then(r => r))
    setBusy(false)
  }

  const a = state.data
  const until = a?.until ? new Date(a.until) : null
  const clock = until
    ? `${String(until.getHours()).padStart(2, '0')}:${String(
        until.getMinutes()
      ).padStart(2, '0')}`
    : '—'

  return (
    <section className="crm-auto" aria-label={t('crm.auto.title')}>
      <div className="crm-auto__head">
        <h3 className="crm-auto__title">{t('crm.auto.title')}</h3>
        <span
          className={`crm-auto__lamp${a?.on ? ' crm-auto__lamp--on' : ''}`}
          aria-hidden="true"
        />
      </div>

      <p className="crm-auto__state">
        {!state.reachable
          ? t('crm.auto.unreachable')
          : a?.on
            ? t('crm.auto.on', {
                until: clock,
                left: a.leftToday,
                cap: a.cap,
              }) +
              (a.scope === 'chosen'
                ? ' · ' +
                  (a.chosen === 0
                    ? t('crm.auto.chosen.none')
                    : t('crm.auto.chosen.some', { n: a.chosen }))
                : '')
            : t('crm.auto.off')}
      </p>

      <div
        className="crm-auto__scope"
        role="group"
        aria-label={t('crm.auto.scope')}
      >
        {(['all', 'chosen'] as const).map(k => (
          <button
            key={k}
            type="button"
            className={`crm__chip${(a?.on ? a.scope : scope) === k ? ' crm__chip--on' : ''}`}
            aria-pressed={(a?.on ? a.scope : scope) === k}
            disabled={busy || Boolean(a?.on)}
            onClick={() => setScope(k)}
          >
            {t(`crm.auto.scope.${k}`)}
            {k === 'chosen' && a ? ` ${a.chosen}` : ''}
          </button>
        ))}
      </div>

      <div className="crm-auto__acts">
        <button
          type="button"
          className="crm-auto__btn"
          disabled={busy || !state.reachable}
          onClick={() => void flip(!(a?.on ?? false))}
        >
          {a?.on ? t('crm.auto.turnOff') : t('crm.auto.turnOn')}
        </button>
      </div>

      {/*
        THE ONE MEASURED FIGURE. Not "resolution rate" -- we do not know
        whether the client was satisfied, and a percentage invented from sends
        would survive exactly until somebody checked it. This says what it
        counts: of what left your account, how much needed your finger.
      */}
      {score.data ? (
        <p className="crm-auto__score">
          {/*
            The change, when there is something to change from. A week with no
            rows at all is "no comparison", not "zero" -- drawing +13 against an
            empty file would invent a trend.
          */}
          {score.data.note
            ? t('crm.score.empty', { days: score.data.days })
            : t('crm.score.line', {
                days: score.data.days,
                auto: score.data.autoSent,
                pressed: score.data.pressedSent,
                share:
                  score.data.withoutYouPercent === null
                    ? '—'
                    : `${score.data.withoutYouPercent}%`,
              })}
          {score.data.before && !score.data.note
            ? ' · ' +
              t('crm.score.before', {
                left: score.data.before.left,
                share:
                  score.data.before.withoutYouPercent === null
                    ? '—'
                    : `${score.data.before.withoutYouPercent}%`,
              })
            : ''}
        </p>
      ) : null}

      <p className="crm-auto__hint">{t('crm.auto.hint')}</p>
    </section>
  )
}
