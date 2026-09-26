import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '@/hooks/useLanguage'
import {
  loadClientGroup,
  loadGroups,
  setClientGroup,
  type ClientGroupLink,
  type GroupRow,
} from '@/lib/crm'

/**
 * THE CLIENT'S GROUP, ON THE CARD.
 *
 * Owner, 2026-09-26: the agent may talk to a client in their group too --
 * by the same rule as the DM: it drafts, a card appears, it goes out only on
 * the owner's Send. This block is where the owner says WHICH group is the
 * client's (a group the CRM has already read), opens it, and asks the agent
 * to draft a post there. Binding sends nothing.
 */
export function ClientGroup({
  client,
  name,
  onAsk,
  askDisabled,
}: {
  client: string
  name: string
  onAsk?: (text: string) => void
  askDisabled?: boolean
}) {
  const { t } = useLanguage()
  const [group, setGroup] = useState<ClientGroupLink | null | undefined>(
    undefined
  )
  const [choices, setChoices] = useState<GroupRow[] | null>(null)
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    void loadClientGroup(client).then(r => {
      if (alive) setGroup(r.reachable ? (r.data ?? null) : undefined)
    })
    return () => {
      alive = false
    }
  }, [client])

  const openPicker = async () => {
    setPicking(true)
    if (choices) return
    const r = await loadGroups()
    setChoices(
      r.reachable ? (r.data ?? []).filter(g => g.kind === 'group') : []
    )
  }

  const bind = async (chat: string | null) => {
    setBusy(true)
    setFailed(false)
    const r = await setClientGroup(client, chat)
    setBusy(false)
    if (!r.reachable) {
      setFailed(true)
      return
    }
    setGroup(r.data ?? null)
    setPicking(false)
  }

  // Not read yet, or the tool is not there: no block rather than a wrong one.
  if (group === undefined) return null

  const title = group ? group.title || group.chatId : ''

  return (
    <section
      className="chat-aside__group"
      aria-label={t('crm.clientGroup.title')}
    >
      <h3 className="chat-aside__label">{t('crm.clientGroup.title')}</h3>
      {group ? (
        <>
          <p className="chat-aside__group-name">
            <strong>{title}</strong>
            {group.membersCount !== null ? (
              <span>
                {' '}
                · {t('crm.clientGroup.members', { n: group.membersCount })}
              </span>
            ) : null}
          </p>
          <div className="chat-aside__group-actions">
            {onAsk ? (
              <button
                type="button"
                disabled={askDisabled}
                onClick={() =>
                  onAsk(t('crm.clientGroup.askPost', { name, group: title }))
                }
              >
                {t('crm.clientGroup.post')}
              </button>
            ) : null}
            <Link to={`/crm/g/${encodeURIComponent(group.chatId)}/chat`}>
              {t('crm.clientGroup.open')}
            </Link>
            <button
              type="button"
              disabled={busy}
              onClick={() => void openPicker()}
            >
              {t('crm.clientGroup.change')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void bind(null)}
            >
              {t('crm.clientGroup.unbind')}
            </button>
          </div>
          <p className="chat-aside__group-rule">{t('crm.clientGroup.rule')}</p>
        </>
      ) : (
        <div className="chat-aside__group-actions">
          <span className="chat-aside__group-none">
            {t('crm.clientGroup.none')}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void openPicker()}
          >
            {t('crm.clientGroup.bind')}
          </button>
        </div>
      )}
      {picking ? (
        choices === null ? (
          <p className="chat-aside__group-rule">
            {t('crm.clientGroup.loading')}
          </p>
        ) : choices.length === 0 ? (
          <p className="chat-aside__group-rule">
            {t('crm.clientGroup.noGroups')}
          </p>
        ) : (
          <select
            className="chat-aside__group-pick"
            aria-label={t('crm.clientGroup.pick')}
            defaultValue=""
            disabled={busy}
            onChange={e => {
              if (e.target.value) void bind(e.target.value)
            }}
          >
            <option value="" disabled>
              {t('crm.clientGroup.pick')}
            </option>
            {choices.map(g => (
              <option key={g.chatId} value={g.chatId}>
                {(g.title || g.chatId) +
                  (g.membersCount !== null ? ` · ${g.membersCount}` : '')}
              </option>
            ))}
          </select>
        )
      ) : null}
      {failed ? (
        <p className="chat-aside__group-rule" role="alert">
          {t('crm.clientGroup.failed')}
        </p>
      ) : null}
    </section>
  )
}
