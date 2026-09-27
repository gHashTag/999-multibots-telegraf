import { Link, useNavigate } from 'react-router-dom'
import { useLanguage } from '@/hooks/useLanguage'
import { Avatar } from '@/components/Crm/Avatar'
import { askAgentInThread } from '@/lib/crmAsk'
import type { WinbackList, WinbackRow } from '@/lib/crm'

/**
 * WHOM TO WIN BACK (`crm_winback`): people who PAID before and went quiet,
 * longest silence first. They are the costliest to lose -- they have already
 * proved they will pay.
 *
 * The body only; the page wraps it in its `panel(...)`, so an unreachable
 * server says so there, by the same rule as every other panel, instead of
 * this list pretending nobody left.
 *
 * ── "RETURN" SENDS NOTHING TO THE CLIENT ────────────────────────────────────
 *
 * It asks OUR agent, in this client's own thread, to draft a warm return
 * message as a send card, and opens that thread. The client hears nothing
 * until the owner presses Send on the card -- the same door as "Prepare".
 */
export function WinbackPanel({
  list,
  faces,
}: {
  list: WinbackList
  /** Faces the clients list already has, by telegram id. */
  faces?: ReadonlyMap<string, string | null | undefined>
}) {
  const { t } = useLanguage()
  const navigate = useNavigate()

  const giveBack = (r: WinbackRow) =>
    askAgentInThread(
      r.telegramId,
      t('crm.winback.returnAsk', {
        name: r.name || r.telegramId,
        days: r.daysQuiet ?? '?',
      }),
      navigate
    )

  if (list.rows.length === 0)
    return <p className="crm__empty">{t('crm.winback.none')}</p>

  return (
    <>
      <p className="crm__counts">
        {t('crm.winback.counts', {
          days: list.thresholdDays ?? '?',
          found: list.found,
        })}
      </p>
      <ul className="crm__list" data-testid="crm-winback">
        {list.rows.map(r => (
          <li key={r.telegramId} className="crm__row crm__row--winback">
            <div className="crm__who">
              <Avatar
                name={r.name || r.telegramId}
                url={faces?.get(r.telegramId)}
                size={36}
              />
              <Link to={`/crm/${r.telegramId}`} className="crm__open">
                {r.name || r.telegramId}
              </Link>
              <span className="crm__stage">
                {r.link ? (
                  <a href={r.link} target="_blank" rel="noreferrer">
                    t.me
                  </a>
                ) : null}{' '}
                {r.bought ? (
                  <span className="crm__badge crm__badge--paid">
                    {t('crm.winback.bought')}
                  </span>
                ) : null}
              </span>
            </div>
            <p className="crm__why">
              {r.bot ?? '—'} ·{' '}
              {t('crm.winback.quiet', { days: r.daysQuiet ?? '?' })}
            </p>
            <div className="crm__acts">
              <button
                type="button"
                className="crm__return"
                onClick={() => giveBack(r)}
              >
                {t('crm.winback.return')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
