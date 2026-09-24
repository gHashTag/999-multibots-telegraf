import { useEffect, useState } from 'react'
import { useLanguage } from '@/hooks/useLanguage'
import { Panel } from '@/components/Crm/Panel'
import { coveredByNotice } from '@/components/Crm/AllRefused'
import { NETWORK_NAMES } from '@/components/Profile/CloneNetworksCard'
import { loadTraffic, type Reached, type Traffic } from '@/lib/crm'
import './TrafficPanel.css'

/**
 * WHERE PEOPLE COME FROM, ON THE OWNER'S SCREEN (tick 9, epic #2974).
 *
 * Owner, 2026-09-24: "every marketing channel should carry a tag, so we know
 * where the traffic comes from". The links carry their channel (render
 * utm.ts), our pages and bots count the arrivals (traffic.ts); until now the
 * answer lived only in `tri traffic` and the agent's `crm_traffic`. This is
 * the same answer next to the audience, the way a web analytics dashboard
 * shows sources: per channel, visits on our pages and starts of our bots.
 *
 * Only the owner's: the tool refuses anybody else, and on a refusal the panel
 * is not drawn at all -- another owner's CRM is not told about ours. A server
 * that could not be reached still says so (Panel), never a row of zeros.
 */
const DAY_CHOICES = [7, 30] as const

export function sourceName(id: string): string {
  if (NETWORK_NAMES[id]) return NETWORK_NAMES[id]
  if (id === 'telegram') return 'Telegram'
  if (id === 'email') return 'Email'
  return id
}

export function TrafficPanel({
  noticeReason = null,
}: {
  /**
   * The one reason the whole screen failed for, when there is one. This
   * panel loads its own data, so the page cannot judge it from outside --
   * it is told the reason and applies the same rule: say nothing that the
   * notice above has already said (components/Crm/AllRefused.tsx).
   */
  noticeReason?: string | null
} = {}) {
  const { t } = useLanguage()
  const [days, setDays] = useState<(typeof DAY_CHOICES)[number]>(7)
  const [state, setState] = useState<Reached<Traffic> | null>(null)

  useEffect(() => {
    let live = true
    void loadTraffic(days).then(r => {
      if (live) setState(r)
    })
    return () => {
      live = false
    }
  }, [days])

  if (!state || state.refused) return null
  const data = state.data
  const top = Math.max(
    1,
    ...(data?.sources ?? []).map(s => s.arrivals + s.starts)
  )

  return (
    <Panel
      title={t('crm.traffic.title')}
      state={state}
      quiet={coveredByNotice(state, noticeReason)}
    >
      {data ? (
        <div className="crm-traffic" data-testid="crm-traffic">
          <div className="crm-traffic__days" role="group">
            {DAY_CHOICES.map(n => (
              <button
                key={n}
                type="button"
                className="crm-traffic__day"
                aria-pressed={days === n}
                onClick={() => setDays(n)}
              >
                {t('crm.traffic.days', { n })}
              </button>
            ))}
          </div>
          {data.sources.length ? (
            <ul className="crm-traffic__list">
              {data.sources.map(s => (
                <li
                  key={s.source}
                  className="crm-traffic__row"
                  data-testid="crm-traffic-row"
                >
                  <span className="crm-traffic__source">
                    {sourceName(s.source)}
                  </span>
                  <span
                    className="crm-traffic__bar"
                    style={{
                      width: `${Math.round(((s.arrivals + s.starts) / top) * 100)}%`,
                    }}
                  />
                  <span className="crm-traffic__counts">
                    {t('crm.traffic.row', {
                      visits: s.arrivals,
                      starts: s.starts,
                    })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="crm__muted" data-testid="crm-traffic-empty">
              {t('crm.traffic.empty')}
            </p>
          )}
          <p className="crm__muted">
            {t('crm.traffic.total', {
              visits: data.total,
              starts: data.totalStarts,
            })}
          </p>
        </div>
      ) : null}
    </Panel>
  )
}
