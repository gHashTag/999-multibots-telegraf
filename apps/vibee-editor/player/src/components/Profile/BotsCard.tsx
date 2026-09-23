import { useEffect, useState } from 'react'
import { API_BASE } from '../../config'
import { authHeaders } from '@/lib/apiFetch'
import { useLanguage } from '@/hooks/useLanguage'

/**
 * IS MY BOT ALIVE — ON THE SCREEN, NOT ONLY IN AN ALARM.
 *
 * A client's bot was down for nineteen days in June and she heard about it
 * from her own clients; the cause was an invalid token, visible only in a log
 * she cannot open. The watchman (render/src/bots/silence-watch.ts) now tells
 * an owner the moment that happens. This card is the other half of the same
 * answer: the state on demand, for the person who just wants to look.
 *
 * WHAT IT SAYS AND WHAT IT REFUSES TO SAY. `alive` means Telegram answered
 * getMe -- the token is valid and the bot exists, which is exactly the failure
 * she hit. It is NOT a promise that the bot is answering people, so a queue
 * that nobody is collecting is shown beside the word rather than hidden behind
 * it: "alive, and 412 messages waiting" is a different sentence.
 *
 * OWN PROFILE ONLY, like the CRM card next to it: somebody else's bots are not
 * ours to look at, and the endpoint answers by the caller's own identity
 * anyway -- on a stranger's profile this would show the viewer's bots under
 * another person's name.
 *
 * SILENT WHEN THERE IS NOTHING. Most people own no bot. A card that says "you
 * have no bots" to everybody is furniture; this one does not render.
 */

export interface BotState {
  bot: string
  alive: boolean
  why: string | null
  pendingUpdates: number | null
}

export interface BotsCardProps {
  isOwn: boolean
  /** Tests pass the answer in; the screen fetches it. */
  bots?: BotState[]
}

const QUEUE_IS_LOUD = 50

export function BotsCard({ isOwn, bots: given }: BotsCardProps) {
  const { t } = useLanguage()
  const [bots, setBots] = useState<BotState[] | null>(given ?? null)

  useEffect(() => {
    if (given || !isOwn) return
    let alive = true
    fetch(`${API_BASE}/api/my-bots`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (alive && Array.isArray(d?.bots)) setBots(d.bots as BotState[])
      })
      .catch(() => {
        /*
         * Silence, deliberately. This card answers "is my bot alive"; a
         * network failure here means WE could not ask, and printing "your bot
         * is down" on that basis is the same lie the watchman refuses to tell.
         */
      })
    return () => {
      alive = false
    }
  }, [isOwn, given])

  if (!isOwn || !bots || bots.length === 0) return null

  return (
    <section className="profile-topup" data-testid="profile-bots">
      <h3 className="profile-topup__title">{t('bots.card.title')}</h3>
      <ul className="profile-bots__list">
        {bots.map(b => {
          const loud = b.alive && (b.pendingUpdates ?? 0) > QUEUE_IS_LOUD
          return (
            <li
              key={b.bot}
              className={`profile-bots__item${
                b.alive ? '' : ' profile-bots__item--down'
              }`}
              data-alive={b.alive ? '1' : '0'}
            >
              <span className="profile-bots__name">@{b.bot}</span>
              <span className="profile-bots__state">
                {b.alive
                  ? loud
                    ? t('bots.card.queue', { n: b.pendingUpdates ?? 0 })
                    : t('bots.card.alive')
                  : t('bots.card.down')}
              </span>
              {b.alive ? null : (
                // Telegram's own words, or ours when the gap is ours. Shown
                // whole: a person cannot ask us about a reason they cannot see.
                <span className="profile-bots__why">{b.why}</span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
