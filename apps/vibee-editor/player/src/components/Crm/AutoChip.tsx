import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '@/hooks/useLanguage'
import {
  loadAutopilot,
  setAutopilot,
  type Autopilot,
  type Reached,
} from '@/lib/crm'
import './AutoChip.css'

/**
 * THE AUTO SWITCH, WHEREVER THE OWNER IS WORKING.
 *
 * Owner, 2026-09-24: "is the autopilot in the browser and in the agent?" It
 * was not: the switch lived on the CRM screen only, and the agent is by
 * design not allowed to flip it (autopilot_set is DIRECT_CALL_ONLY on the
 * server -- a model turn that has read a client's message must not be able
 * to start sending). So the agent said "the button is in the CRM", and the
 * owner had to leave the chat or the browser to press it.
 *
 * This is that same switch, compact, for the agent chat and the browser tab.
 * It reads the server, shows the two numbers that matter (until when, how
 * many left today) and flips with the SAME scope the owner last chose -- a
 * chip must never widen "only the people I picked" to "everyone" by being
 * pressed somewhere else. The full panel (scope, the week's figure) stays on
 * the CRM screen, one tap away.
 *
 * NOT A SELLER, OR UNREADABLE: nothing is drawn. The switch is a seller's,
 * and an "off" drawn for a state that could not be read would say nothing is
 * sending when something might be.
 */
export function AutoChip() {
  const { t } = useLanguage()
  const [state, setState] = useState<Reached<Autopilot> | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    void loadAutopilot().then(r => {
      if (alive) setState(r)
    })
    return () => {
      alive = false
    }
  }, [])

  const a = state?.reachable ? state.data : null
  if (!a) return null

  const until = a.until ? new Date(a.until) : null
  const clock =
    until && !Number.isNaN(until.getTime())
      ? `${String(until.getHours()).padStart(2, '0')}:${String(
          until.getMinutes()
        ).padStart(2, '0')}`
      : '—'

  const flip = async () => {
    setBusy(true)
    const next = await setAutopilot(!a.on, undefined, a.scope)
    setState(next.data ? next : await loadAutopilot())
    setBusy(false)
  }

  return (
    <span
      className={`auto-chip${a.on ? ' auto-chip--on' : ''}`}
      title={t('autoChip.title')}
    >
      <Link to="/crm" className="auto-chip__state">
        <i aria-hidden="true" />
        {a.on
          ? t('autoChip.on', { until: clock, left: a.leftToday })
          : t('autoChip.off')}
        {a.scope === 'chosen'
          ? ` · ${t('crm.auto.scope.chosen')} ${a.chosen}`
          : ''}
      </Link>
      <button
        type="button"
        className="auto-chip__flip"
        disabled={busy}
        onClick={() => void flip()}
      >
        {a.on ? t('autoChip.turnOff') : t('autoChip.turnOn')}
      </button>
    </span>
  )
}
