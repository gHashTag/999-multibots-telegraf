import { useCallback, useEffect, useRef, useState } from 'react'
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
/*
 * AFTER "CONNECT" THE CARD ASKS AGAIN BY ITSELF (2026-10-03).
 *
 * The owner connected a network and the card still said "not connected": it
 * asked the server once, when the profile opened, and the sign-in happens in
 * another window. Now it asks again when the app comes back into view, and
 * every few seconds for two minutes after a Connect press, until that row
 * changes.
 */
export const WAIT_EVERY_MS = 3000
export const WAIT_FOR_MS = 120_000

const rowOf = (s: MetaStatus | null, network: Network) =>
  JSON.stringify(s?.networks.find(n => n.network === network) ?? null)

/** The owner's network status, or null: not the owner, or no answer. */
async function readMetaStatus(): Promise<MetaStatus | null> {
  try {
    const r = await fetch(`${API_BASE}/api/social/meta/status`, {
      headers: authHeaders(),
    })
    const d = r.ok ? await r.json() : null
    return d?.ok ? (d as MetaStatus) : null
  } catch {
    /* Not the owner, or the server unreachable: the card stays as it is. */
    return null
  }
}

export function MetaConnectCard({
  isOwn,
  status: given,
}: MetaConnectCardProps) {
  const { t } = useLanguage()
  const [status, setStatus] = useState<MetaStatus | null>(given ?? null)
  const [said, setSaid] = useState<string | null>(null)
  /* The network a Connect press is waiting on, and its row at the press. */
  const [waiting, setWaiting] = useState<{
    network: Network
    before: string
  } | null>(null)
  const alive = useRef(true)

  /* The old answer stays on screen until a new one arrives: no blink. */
  const show = useCallback((d: MetaStatus | null) => {
    if (d && alive.current) setStatus(d)
    return d
  }, [])
  const refresh = useCallback(() => readMetaStatus().then(show), [show])

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    if (given || !isOwn) return
    // State is set from the answer, never synchronously in the effect
    // (react-hooks/set-state-in-effect).
    void readMetaStatus().then(show)
    /* Back from the sign-in window: Telegram's browser or another tab. */
    const back = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', back)
    window.addEventListener('focus', back)
    return () => {
      document.removeEventListener('visibilitychange', back)
      window.removeEventListener('focus', back)
    }
  }, [isOwn, given, refresh, show])

  useEffect(() => {
    if (!waiting || given) return
    const until = Date.now() + WAIT_FOR_MS
    const tick = setInterval(() => {
      if (Date.now() >= until) {
        setWaiting(null)
        return
      }
      void refresh().then(s => {
        if (s && rowOf(s, waiting.network) !== waiting.before) setWaiting(null)
      })
    }, WAIT_EVERY_MS)
    return () => clearInterval(tick)
  }, [waiting, given, refresh])

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
      setWaiting({ network, before: rowOf(status, network) })
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
      {waiting &&
      !status.networks.find(n => n.network === waiting.network)?.usable ? (
        <p className="profile-topup__note" data-testid="meta-waiting">
          {t('meta.card.waiting', { name: NAMES[waiting.network] })}
        </p>
      ) : null}
      {said ? <p className="profile-topup__note">{said}</p> : null}
    </section>
  )
}
