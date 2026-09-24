import { Link } from 'react-router-dom'
import { useLanguage } from '@/hooks/useLanguage'
import { BROWSER_ROUTE } from '@/lib/browserWatch'

/**
 * WHICH NETWORKS THE CLONE HOLDS, ON THE SCREEN (#2963, epic #2961).
 *
 * Owner, 2026-09-24: "connect every social network of mine, so the digital
 * clone can truly be called that". The server reads the person's own
 * browser logins (render browser/logins.ts) and answers one boolean per
 * network; this card is that answer, on the own profile, next to the other
 * pieces of the clone.
 *
 * THREE ANSWERS, NOT TWO. `accounts === undefined` -- not asked yet -- draws
 * nothing. `null` -- the browser is off -- says exactly that and offers to
 * open it: it must never read as "you are connected nowhere". A network whose
 * value is `null` is one whose login we cannot see, and it says "open to
 * check" instead of "not connected".
 *
 * Connecting is not done here. The agent does it in the person's own browser,
 * and the person types every password themselves; this card only says where
 * the clone stands and how to ask.
 */

/** Brand names are names, not interface words: they stay as they are. */
export const NETWORK_NAMES: Record<string, string> = {
  google: 'Google',
  youtube: 'YouTube',
  x: 'X',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  threads: 'Threads',
  facebook: 'Facebook',
  reddit: 'Reddit',
  github: 'GitHub',
  vk: 'VK',
  hh: 'hh.ru',
  upwork: 'Upwork',
  habr: 'Habr',
  medium: 'Medium',
}

export interface CloneNetworksCardProps {
  isOwn: boolean
  accounts: Record<string, boolean | null> | null | undefined
}

export function CloneNetworksCard({ isOwn, accounts }: CloneNetworksCardProps) {
  const { t } = useLanguage()
  if (!isOwn || accounts === undefined) return null
  if (accounts === null) {
    return (
      <section className="profile-topup" data-testid="profile-clone-networks">
        <h3 className="profile-topup__title">{t('clone.networks.title')}</h3>
        <p className="profile-topup__note">{t('clone.networks.off')}</p>
        <Link className="profile-topup__pack" to={BROWSER_ROUTE}>
          {t('clone.networks.open')}
        </Link>
      </section>
    )
  }
  const rows = Object.entries(accounts)
  const connected = rows.filter(([, v]) => v === true).length
  return (
    <section className="profile-topup" data-testid="profile-clone-networks">
      <h3 className="profile-topup__title">
        {t('clone.networks.title')} ·{' '}
        {t('clone.networks.count', { n: connected })}
      </h3>
      <p className="profile-topup__note">{t('clone.networks.note')}</p>
      <ul className="profile-networks">
        {rows.map(([id, v]) => (
          <li
            key={id}
            className="profile-networks__row"
            data-state={v === true ? 'in' : v === false ? 'out' : 'unknown'}
          >
            <span>{v === true ? '✓' : v === false ? '—' : '?'}</span>{' '}
            <strong>{NETWORK_NAMES[id] ?? id}</strong>{' '}
            <span className="profile-topup__note">
              {v === true
                ? t('clone.networks.in')
                : v === false
                  ? t('clone.networks.out')
                  : t('clone.networks.unknown')}
            </span>
          </li>
        ))}
      </ul>
      {connected < rows.length ? (
        <p className="profile-topup__note">{t('clone.networks.ask')}</p>
      ) : null}
    </section>
  )
}
