import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '@/hooks/useLanguage'
import { useIsKeeper } from '@/hooks/useIsKeeper'
import { useAgentAcceptance } from '@/hooks/useAgentAcceptance'
import { ensureAvatars, loadClients, type ClientRow } from '@/lib/crm'
import {
  MARKETPLACE_AGENTS,
  type MarketplaceAgentListing,
} from '../../../../packages/vibee-atoms/src/agent-marketplace'
import { ClientPicker } from './ClientPicker'
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

/**
 * THE CIRCLE WHEN THERE IS NO PICTURE.
 *
 * Owner, 2026-09-23: people as circles with their avatar and the name under
 * it. Most rows have no stored avatar, and a row of grey holes is uglier than
 * what it replaced -- so a circle without a picture carries the person's
 * initials. Digits are dropped: "90" from an id says nothing, and an id-only
 * row gets a neutral mark instead.
 */
export function initialsOf(label: string): string {
  const words = label
    .replace(/^@/, '')
    .split(/[\s._-]+/)
    .map(w => w.trim())
    .filter(w => w && /\p{L}/u.test(w[0]))
  if (!words.length) return '•'
  const letters = words.slice(0, 2).map(w => w[0].toUpperCase())
  return letters.join('')
}

/**
 * EVERY AGENT GETS A SEAT -- AND SAYS WHICH ONES CAN TALK.
 *
 * Owner, 2026-09-23: the connected agents should be visible in the chat, each
 * with a conversation of its own -- the blogger offering leads on its topic,
 * the Habr one, Google, and so on.
 *
 * They are the catalogue's own listings, and the catalogue already knows
 * which of them are `live`. A live agent's circle opens ITS thread; one still
 * in training opens its card, where what it can do today is written. Sending
 * somebody into a thread with an agent that has no harness behind it would be
 * the screen promising something the product does not do yet -- and hiding
 * those agents would answer the owner's question with silence.
 */
export function railAgents(): MarketplaceAgentListing[] {
  return [...MARKETPLACE_AGENTS]
}

/**
 * Where a circle leads: the agent's OWN thread when this person may talk to
 * it -- a live agent, any agent for a keeper (owner preview, #2957), a
 * trainee that earned the market (seven passing days) -- and the market
 * card otherwise.
 *
 * Owner, 2026-09-24: "I switch between agents in the chat and get an
 * advert". A keeper pressing Работа, Google, TikTok or Habr was sent to the
 * market page -- the one screen he did not ask for -- though the chat page
 * and the server both open those threads for him.
 */
export function agentHref(
  agent: MarketplaceAgentListing,
  may: { keeper?: boolean | null; earned?: boolean } = {}
): string {
  const open =
    agent.status === 'live' || may.keeper === true || may.earned === true
  return open ? `/agents/${agent.id}/work` : '/agents'
}

export function ChatThreads({ current }: { current: string | null }) {
  const { t, lang: uiLang } = useLanguage()
  /* Whose threads this person may open (agentHref). */
  const keeper = useIsKeeper(true)
  const verdicts = useAgentAcceptance()
  const [clients, setClients] = useState<ClientRow[] | null>(null)
  const [picking, setPicking] = useState(false)
  const closePicker = useCallback(() => setPicking(false), [])

  useEffect(() => {
    let live = true
    void loadClients(50).then(reached => {
      if (live && reached.reachable && reached.data) {
        setClients(reached.data.clients)
        // Circles without a face: the owner's session fetches them in the
        // background, and the row is re-read only if some arrived.
        if (reached.data.clients.some(x => !x.avatarUrl))
          void ensureAvatars().then(async n => {
            if (!live || n === 0) return
            const again = await loadClients(50)
            if (live && again.data) setClients(again.data.clients)
          })
      }
    })
    return () => {
      live = false
    }
  }, [])

  const shown = clients ? threadClients(clients, current) : []
  if (shown.length === 0) return null

  const lang = uiLang === 'ru' ? 'ru' : 'en'

  return (
    <nav className="chat-threads" aria-label={t('chat.threads.label')}>
      <Link
        to="/chat"
        className={`chat-threads__dot is-agent${current === null ? ' is-current' : ''}`}
        aria-current={current === null ? 'page' : undefined}
      >
        <span className="chat-threads__circle" aria-hidden="true">
          ★
        </span>
        <span className="chat-threads__caption">{t('chat.threads.agent')}</span>
      </Link>

      {/*
        EVERY CLIENT, ONE TAP AWAY (#2947). The row shows the twelve most
        recent; this opens everybody else in place -- searched on the server,
        paged -- so the conversation is not left for the /crm screen.
      */}
      <button
        type="button"
        className="chat-threads__dot is-all"
        onClick={() => setPicking(true)}
      >
        <span className="chat-threads__circle" aria-hidden="true">
          ⌕
        </span>
        <span className="chat-threads__caption">{t('picker.open')}</span>
      </button>
      {picking ? <ClientPicker onClose={closePicker} /> : null}

      {/*
        THE SPECIALISTS, BESIDE THE PEOPLE. Each one keeps its own thread
        (/agents/:id/work) -- the row is the way in, not a second chat.
      */}
      {railAgents().map(agent => (
        <Link
          key={agent.id}
          to={agentHref(agent, {
            keeper,
            earned: verdicts?.[agent.id]?.earned === true,
          })}
          className={`chat-threads__dot is-specialist${
            agent.status === 'live' ? '' : ' is-training'
          }`}
          title={agent.promise[lang]}
          data-status={agent.status}
        >
          <span className="chat-threads__circle" aria-hidden="true">
            {agent.icon}
          </span>
          <span className="chat-threads__caption">{agent.name[lang]}</span>
        </Link>
      ))}

      {shown.map(row => {
        const isCurrent = row.telegramId === current
        const label = threadLabel(row)
        return (
          <Link
            key={row.telegramId}
            to={`/crm/${row.telegramId}/chat`}
            className={`chat-threads__dot${isCurrent ? ' is-current' : ''}${row.paid ? ' is-paid' : ''}`}
            aria-current={isCurrent ? 'page' : undefined}
            title={t('crm.client.chat.title', { id: label })}
          >
            <span className="chat-threads__circle" aria-hidden="true">
              {row.avatarUrl ? (
                <img src={row.avatarUrl} alt="" loading="lazy" />
              ) : (
                initialsOf(label)
              )}
            </span>
            <span className="chat-threads__caption">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
