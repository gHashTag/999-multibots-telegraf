import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '@/hooks/useLanguage'
import { loadClients, type ClientRow } from '@/lib/crm'
import './ChatThreads.css'

/**
 * MORE THAN ONE CONVERSATION, ONE PRESS APART.
 *
 * The owner, 2026-09-22: "many chats - one per Telegram client, and the chat
 * with the agent; now it is all one chat". The threads already existed - the
 * agent's own at /chat, one ABOUT each client at /crm/:clientId/chat (their
 * own storage and their own server thread, Chat.tsx) - but a client thread was
 * reachable only from that client's CRM card, so the screen read as one chat.
 *
 * This row puts them side by side: the agent first, then the clients who were
 * active most recently. The list is the CRM's own (`crm_clients`), which only
 * a seller has; for anyone else, or when it cannot be read, there is nothing
 * to switch between and the row is not drawn.
 */

/** How many client threads the row offers; the rest stay a CRM card away. */
export const CHAT_THREAD_LIMIT = 12

const recency = (row: ClientRow) =>
  row.lastSeen ? Date.parse(row.lastSeen) || 0 : 0

/** The clients to show: most recently seen first, the open one always kept. */
export function threadClients(
  clients: ClientRow[],
  current: string | null,
  limit = CHAT_THREAD_LIMIT
): ClientRow[] {
  const sorted = [...clients]
    .filter(row => /^\d{5,15}$/.test(row.telegramId))
    .sort((a, b) => recency(b) - recency(a))
  const shown = sorted.slice(0, limit)
  if (current && !shown.some(row => row.telegramId === current)) {
    const open = sorted.find(row => row.telegramId === current)
    if (open) shown.unshift(open)
  }
  return shown
}

export function threadLabel(row: ClientRow): string {
  return (
    row.name?.trim() || (row.username ? `@${row.username}` : row.telegramId)
  )
}

export function ChatThreads({ current }: { current: string | null }) {
  const { t } = useLanguage()
  const [clients, setClients] = useState<ClientRow[] | null>(null)

  useEffect(() => {
    let live = true
    void loadClients(50).then(reached => {
      if (live && reached.reachable && reached.data) {
        setClients(reached.data.clients)
      }
    })
    return () => {
      live = false
    }
  }, [])

  const shown = clients ? threadClients(clients, current) : []
  if (shown.length === 0) return null

  return (
    <nav className="chat-threads" aria-label={t('chat.threads.label')}>
      <Link
        to="/chat"
        className={`chat-threads__chip is-agent${current === null ? ' is-current' : ''}`}
        aria-current={current === null ? 'page' : undefined}
      >
        {t('chat.threads.agent')}
      </Link>
      {shown.map(row => {
        const isCurrent = row.telegramId === current
        return (
          <Link
            key={row.telegramId}
            to={`/crm/${row.telegramId}/chat`}
            className={`chat-threads__chip${isCurrent ? ' is-current' : ''}${row.paid ? ' is-paid' : ''}`}
            aria-current={isCurrent ? 'page' : undefined}
            title={t('crm.client.chat.title', { id: threadLabel(row) })}
          >
            {threadLabel(row)}
          </Link>
        )
      })}
    </nav>
  )
}
