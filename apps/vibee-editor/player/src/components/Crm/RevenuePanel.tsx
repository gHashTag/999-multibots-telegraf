import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '@/hooks/useLanguage'
import { Panel } from '@/components/Crm/Panel'
import { coveredByNotice } from '@/components/Crm/refusalRules'
import { loadRevenue, type Reached, type Revenue } from '@/lib/crm'

/**
 * WHAT THE OWNER'S CLIENTS HAVE BROUGHT (CRM audit 2026-09-27, #4).
 *
 * Stars from the live wallet (render crm-revenue-tool.ts): all time, the last
 * 30 days, how many clients paid, the average per paying client, and the top
 * five, each a link to the client's card.
 *
 * Loads its own data like TrafficPanel. A refusal (an older server without
 * the tool, or a viewer who is not a seller) draws nothing; an unreachable
 * server still says so (Panel); an unknown number is a dash, never a zero.
 */
export function RevenuePanel({
  noticeReason = null,
}: {
  /** The one reason the whole screen failed for; see TrafficPanel. */
  noticeReason?: string | null
} = {}) {
  const { t } = useLanguage()
  const [state, setState] = useState<Reached<Revenue> | null>(null)

  useEffect(() => {
    let live = true
    void loadRevenue().then(r => {
      if (live) setState(r)
    })
    return () => {
      live = false
    }
  }, [])

  if (!state || state.refused) return null
  const r = state.data
  const shown = (n: number | null | undefined) =>
    n === null || n === undefined ? '—' : n

  return (
    <Panel
      title={t('crm.revenue.title')}
      state={state}
      quiet={coveredByNotice(state, noticeReason)}
    >
      {r ? (
        <div data-testid="crm-revenue">
          <dl className="crm__stats">
            <div>
              <dt>{t('crm.revenue.total')}</dt>
              <dd data-testid="crm-revenue-total">{shown(r.total)}</dd>
            </div>
            <div>
              <dt>{t('crm.revenue.last30')}</dt>
              <dd data-testid="crm-revenue-last30">{shown(r.last30)}</dd>
            </div>
            <div>
              <dt>{t('crm.revenue.paying')}</dt>
              <dd data-testid="crm-revenue-paying">{shown(r.paying)}</dd>
            </div>
            <div>
              <dt>{t('crm.revenue.ltv')}</dt>
              <dd data-testid="crm-revenue-ltv">{shown(r.ltv)}</dd>
            </div>
          </dl>
          {r.top.length ? (
            <>
              <p className="crm__counts">{t('crm.revenue.top')}</p>
              <ul className="crm__list">
                {r.top.map(c => (
                  <li
                    key={c.telegramId}
                    className="crm__row"
                    data-testid="crm-revenue-top"
                  >
                    <Link to={`/crm/${c.telegramId}`}>
                      {c.name || c.telegramId}
                    </Link>{' '}
                    <span className="crm__muted">
                      {t('crm.revenue.stars', { n: c.stars })}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : r.paying === 0 ? (
            <p className="crm__empty">{t('crm.revenue.none')}</p>
          ) : null}
        </div>
      ) : null}
    </Panel>
  )
}
