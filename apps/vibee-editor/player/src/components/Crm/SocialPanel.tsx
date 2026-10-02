import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '@/hooks/useLanguage'
import { Panel } from '@/components/Crm/Panel'
import { coveredByNotice } from '@/components/Crm/refusalRules'
import {
  loadSocial,
  type Reached,
  type Social,
  type SocialNetwork,
} from '@/lib/crm'

/** Brand names, the same in every language. */
const LABEL: Record<SocialNetwork, string> = {
  threads: 'Threads',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  x: 'X',
}

/**
 * THE OWNER'S NETWORKS: which ones his agent can post to (render
 * social-tools.ts, tool `social_status`), and a way to connect the rest.
 *
 * Loads its own data like RevenuePanel. The tool answers the owner only, so
 * for anyone else it is a refusal and the panel draws nothing. The connect
 * door is the Meta/LinkedIn/X card on the profile page (MetaConnectCard).
 */
export function SocialPanel({
  noticeReason = null,
}: {
  /** The one reason the whole screen failed for; see TrafficPanel. */
  noticeReason?: string | null
} = {}) {
  const { t } = useLanguage()
  const [state, setState] = useState<Reached<Social> | null>(null)

  useEffect(() => {
    let live = true
    void loadSocial().then(r => {
      if (live) setState(r)
    })
    return () => {
      live = false
    }
  }, [])

  if (!state || state.refused) return null
  const s = state.data
  const missing = s ? s.rows.some(r => r.state !== 'connected') : false

  return (
    <Panel
      title={t('crm.social.title')}
      state={state}
      quiet={coveredByNotice(state, noticeReason)}
    >
      {s ? (
        <div data-testid="crm-social">
          <ul className="crm__list">
            {s.rows.map(r => (
              <li
                key={r.network}
                className="crm__row"
                data-testid={`crm-social-${r.network}`}
                data-state={r.state}
              >
                <strong>{LABEL[r.network]}</strong>{' '}
                {r.account ? <span>{r.account}</span> : null}
                {r.instagram ? (
                  <span className="crm__muted"> · IG {r.instagram}</span>
                ) : null}{' '}
                <span className="crm__muted">
                  {t(`crm.social.${r.state}`)}
                  {r.state === 'connected' && r.daysLeft !== null
                    ? ` · ${t('crm.social.days', { n: r.daysLeft })}`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
          <p className="crm__muted">{t('crm.social.hint')}</p>
          {missing ? (
            <Link to="/profile" data-testid="crm-social-connect">
              {t('crm.social.connect')}
            </Link>
          ) : null}
        </div>
      ) : null}
    </Panel>
  )
}
