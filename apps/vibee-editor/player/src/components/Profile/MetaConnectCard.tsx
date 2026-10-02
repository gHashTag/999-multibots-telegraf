import { useEffect, useState } from 'react'
import { API_BASE } from '../../config'
import { authHeaders } from '@/lib/apiFetch'
import { getWebApp } from '@/lib/telegram'
import { useLanguage } from '@/hooks/useLanguage'

/**
 * THREADS, INSTAGRAM, A FACEBOOK PAGE (meta-connect.t27), LINKEDIN AND X
 * (social-api.t27) BY THEIR OWN API.
 *
 * The blog desk could not reach these three: the owner's browser is not
 * signed in there. Connected once through Meta's own login, the desk posts by
 * the Graph API and gets the post's id back as a receipt.
 *
 * Connecting is the owner's own act, so the door is here, under his hand:
 * the server answers the status only to the owner (anybody else gets 403 and
 * this card draws nothing), and refuses the start to the agent's key.
 * The token never reaches this screen -- only the account name and days left.
 */

type Network = 'threads' | 'facebook' | 'linkedin' | 'x'

export interface MetaStatus {
  apps: Partial<Record<Network, boolean>>
  networks: Array<{
    network: Network
    account: string
    instagram: string | null
    daysLeft: number | null
    usable: boolean
  }>
}

export interface MetaConnectCardProps {
  isOwn: boolean
  /** Tests pass the answer in; the screen fetches it. */
  status?: MetaStatus
}

const LOGINS: readonly Network[] = ['threads', 'facebook', 'linkedin', 'x']
const NAMES: Record<Network, string> = {
  threads: 'Threads',
  facebook: 'Facebook + Instagram',
  linkedin: 'LinkedIn',
  x: 'X',
}
/* social-api.t27 LI_WARN_DAYS_LEFT: LinkedIn has no refresh, so warn early. */
const LI_WARN_DAYS_LEFT = 7

export function MetaConnectCard({
  isOwn,
  status: given,
}: MetaConnectCardProps) {
  const { t } = useLanguage()
  const [status, setStatus] = useState<MetaStatus | null>(given ?? null)
  const [said, setSaid] = useState<string | null>(null)

  useEffect(() => {
    if (given || !isOwn) return
    let alive = true
    fetch(`${API_BASE}/api/social/meta/status`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (alive && d?.ok) setStatus(d as MetaStatus)
      })
      .catch(() => {
        /* Not the owner, or the server unreachable: the card stays away. */
      })
    return () => {
      alive = false
    }
  }, [isOwn, given])

  if (!isOwn || !status) return null

  const connect = async (network: Network) => {
    setSaid(null)
    try {
      const r = await fetch(
        `${API_BASE}/api/social/meta/start?network=${network}`,
        { headers: authHeaders() }
      )
      const d = await r.json()
      if (!d?.ok || !d.url) {
        setSaid(String(d?.error || r.status))
        return
      }
      const wa = getWebApp()
      if (wa && typeof wa.openLink === 'function') wa.openLink(d.url)
      else window.open(d.url, '_blank', 'noopener')
    } catch (e) {
      setSaid(String(e))
    }
  }

  return (
    <section className="profile-topup" data-testid="profile-meta-connect">
      <h3 className="profile-topup__title">{t('meta.card.title')}</h3>
      <p className="profile-topup__note">{t('meta.card.note')}</p>
      <ul className="profile-networks">
        {LOGINS.map(network => {
          const held = status.networks.find(n => n.network === network)
          const name = NAMES[network]
          const days =
            network === 'x'
              ? ` · ${t('meta.card.renews')}`
              : held?.daysLeft != null
                ? network === 'linkedin' && held.daysLeft <= LI_WARN_DAYS_LEFT
                  ? ` · ${t('meta.card.soon', { n: held.daysLeft })}`
                  : ` · ${t('meta.card.days', { n: held.daysLeft })}`
                : ''
          return (
            <li
              key={network}
              className="profile-networks__row"
              data-state={held?.usable ? 'in' : 'out'}
            >
              <span>{held?.usable ? '✓' : '—'}</span> <strong>{name}</strong>{' '}
              <span className="profile-topup__note">
                {held?.usable
                  ? [held.account, held.instagram && `@${held.instagram}`]
                      .filter(Boolean)
                      .join(' · ') + days
                  : status.apps[network]
                    ? t('meta.card.out')
                    : t('meta.card.noApp')}
              </span>{' '}
              {status.apps[network] ? (
                <button
                  type="button"
                  className="profile-topup__pack"
                  onClick={() => void connect(network)}
                >
                  {held?.usable ? t('meta.card.again') : t('meta.card.connect')}
                </button>
              ) : null}
            </li>
          )
        })}
      </ul>
      {said ? <p className="profile-topup__note">{said}</p> : null}
    </section>
  )
}
