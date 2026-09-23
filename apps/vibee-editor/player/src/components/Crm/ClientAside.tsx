import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '@/hooks/useLanguage'
import {
  loadClientProfile,
  loadLeadContext,
  loadAutopilotLeads,
  pickForAutopilot,
  type ClientProfile,
  type LeadContext,
  type Reached,
} from '@/lib/crm'

/**
 * WHO THIS CONVERSATION IS ABOUT, WITHOUT LEAVING IT.
 *
 * Owner, 2026-09-23: in wide mode the client's card should be there straight
 * away. Until now a thread about a client showed one line -- "conversation
 * about client 900000001" -- and everything known about that person lived one
 * navigation away, which meant the answer was written without it.
 *
 * WIDE MODE ONLY, and that is a CSS decision, not a JavaScript one: the aside
 * is always rendered and the stylesheet hides it below the width where two
 * columns stop fitting. A layout that depends on a measured viewport breaks
 * differently in an embedded Mini App, where the frame is resized under it.
 *
 * WHAT IT SHOWS is what changes an answer: the stage and whether they ever
 * paid, whether they are waiting for us, their last words, and the package if
 * one exists. Not a dashboard -- a card.
 *
 * IT ASKS FOR NOTHING IT DOES NOT SHOW. Two tools, in parallel, each with its
 * own "unavailable": a panel that renders zeros for a server that did not
 * answer tells the owner this person has no history, which is a verdict the
 * screen has no right to pass.
 */
export function ClientAside({ client }: { client: string }) {
  const { t } = useLanguage()
  const [profile, setProfile] = useState<Reached<ClientProfile>>({
    reachable: true,
    data: null,
  })
  const [context, setContext] = useState<Reached<LeadContext>>({
    reachable: true,
    data: null,
  })
  /**
   * MAY AUTO WRITE TO THIS PERSON BY ITSELF?
   *
   * The switch on the dashboard says "chosen"; this is where somebody is
   * chosen. Deliberately on the card and not in a list of ticks somewhere
   * else: the decision is about THIS person, and it is made while looking at
   * what they last said.
   *
   * `null` means we have not read the list yet -- the tick is not drawn at
   * all then, because an unticked box that simply has not loaded is a lie
   * about a setting that sends messages.
   */
  const [picked, setPicked] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    void (async () => {
      const [p, c, picks] = await Promise.all([
        loadClientProfile(client),
        loadLeadContext(client),
        loadAutopilotLeads(),
      ])
      if (!alive) return
      setProfile(p)
      setContext(c)
      setPicked(picks.data ? picks.data.includes(client) : null)
    })()
    return () => {
      alive = false
    }
  }, [client])

  const ctx = context.data
  const name =
    ctx?.name ||
    profile.data?.client ||
    t('crm.client.chat.title', { id: client })

  return (
    <aside className="chat-aside" aria-label={t('crm.aside.title')}>
      <div className="chat-aside__head">
        <span className="chat-aside__name">{name}</span>
        {ctx?.username ? (
          <a
            className="chat-aside__handle"
            href={`https://t.me/${ctx.username}`}
            target="_blank"
            rel="noreferrer"
          >
            @{ctx.username}
          </a>
        ) : null}
      </div>

      {!context.reachable ? (
        <p className="chat-aside__off">{t('crm.client.unreachable')}</p>
      ) : (
        <dl className="chat-aside__facts">
          {ctx?.stage ? (
            <>
              <dt>{t('crm.aside.stage')}</dt>
              <dd>{ctx.stage}</dd>
            </>
          ) : null}
          {typeof ctx?.balanceTokens === 'number' ? (
            <>
              <dt>{t('crm.aside.balance')}</dt>
              <dd>{ctx.balanceTokens}</dd>
            </>
          ) : null}
          {ctx?.waitingOnUs ? (
            <>
              <dt>{t('crm.aside.waiting')}</dt>
              <dd className="chat-aside__waiting">
                {t('crm.aside.waiting.yes')}
              </dd>
            </>
          ) : null}
        </dl>
      )}

      {ctx?.lastWords ? (
        <blockquote className="chat-aside__words">{ctx.lastWords}</blockquote>
      ) : null}

      {profile.reachable && profile.data?.hasProfile ? (
        <p className="chat-aside__package">{t('crm.aside.package')}</p>
      ) : null}

      {picked === null ? null : (
        <label className="chat-aside__auto">
          <input
            type="checkbox"
            checked={picked}
            disabled={saving}
            onChange={async e => {
              const next = e.target.checked
              setSaving(true)
              // Optimistic, then corrected by what the server answers: this
              // tick decides whether messages go to a real person, so the
              // screen must end up showing the server's state, not its own.
              setPicked(next)
              const r = await pickForAutopilot(client, next)
              if (!r.reachable) setPicked(!next)
              setSaving(false)
            }}
          />
          <span>{t('crm.aside.auto')}</span>
        </label>
      )}

      <div className="chat-aside__actions">
        <Link className="chat-aside__link" to={`/crm/${client}`}>
          {t('crm.aside.open')}
        </Link>
        <a
          className="chat-aside__link"
          href={`tg://user?id=${client}`}
          rel="noreferrer"
        >
          {t('crm.aside.telegram')}
        </a>
      </div>
    </aside>
  )
}
