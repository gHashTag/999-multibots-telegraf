import { Link } from 'react-router-dom'
import { useLanguage } from '@/hooks/useLanguage'
import { useAgentClients } from '@/hooks/useAgentClients'
import { marketplaceAgentById } from '../../../../packages/vibee-atoms/src/agent-marketplace'
import { AgentTemplates } from './AgentTemplates'
/* The sheet/column look is the client card's (.chat-aside, Chat.css); the
 * panel borrows it wholesale so both cards behave as one control. */
import '../../pages/Chat.css'

/**
 * THE AGENT'S OWN PANEL BESIDE ITS CONVERSATION (owner, 2026-09-29: "when
 * the agent changes, the dashboard changes -- each agent has its own
 * dashboard for working with clients").
 *
 * A client's thread has the client's card beside it; an agent's thread had
 * nothing -- the configured templates and the client work were a dashboard
 * away, in another tab, exactly where nobody looks mid-conversation. This
 * panel is the agent's half: its repeat buttons (the same AGENT_TEMPLATES
 * the fresh thread shows -- one source, not a copy), the clients it worked
 * with (the same agent_clients answer the dashboard reads), and the door to
 * the full dashboard.
 *
 * It borrows the client card's sheet/column behaviour wholesale
 * (.chat-aside): a column beside the conversation on a wide screen, a sheet
 * over it on a phone. A template pressed becomes a message in THIS
 * conversation, exactly like a move on the client card.
 */
export function AgentAside({
  agentId,
  onAsk,
  askDisabled = false,
  open,
  onClose,
}: {
  agentId: string
  onAsk: (prompt: string) => void
  askDisabled?: boolean
  open: boolean
  onClose: () => void
}) {
  const { t, lang } = useLanguage()
  const l: 'ru' | 'en' = lang === 'ru' ? 'ru' : 'en'
  const agent = marketplaceAgentById(agentId)
  const clients = useAgentClients(agentId, true)
  if (!agent) return null
  return (
    <aside
      className={`chat-aside${open ? ' is-open' : ''}`}
      aria-label={t('chat.agentAside.label')}
      data-testid="agent-aside"
    >
      <div className="chat-aside__head">
        <span className="chat-aside__avatar" aria-hidden="true">
          {agent.icon}
        </span>
        <div className="chat-aside__who">
          <span className="chat-aside__name">{agent.name[l]}</span>
          <span className="chat-aside__handle">{agent.role[l]}</span>
        </div>
        <button
          type="button"
          className="chat-aside__close"
          aria-label={t('crm.aside.close')}
          onClick={onClose}
        >
          ×
        </button>
      </div>

      <AgentTemplates
        agentId={agent.id}
        onSend={onAsk}
        disabled={askDisabled}
      />

      <section
        className="chat-aside__moves"
        aria-label={t('chat.agentAside.clients')}
      >
        <h3 className="chat-aside__label">{t('chat.agentAside.clients')}</h3>
        {clients === null ? null : clients.length ? (
          <ul className="chat-aside__agent-clients">
            {clients.map(c => (
              <li key={c.client}>
                <Link
                  className="chat-aside__agent-client"
                  to={`/crm/${c.client}/chat?helper=${agent.id}`}
                  data-testid="agent-aside-client"
                >
                  {t('agents.dash.clientRow', {
                    id: c.client,
                    n: c.turns,
                  })}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="chat-aside__off">{t('chat.agentAside.noClients')}</p>
        )}
      </section>

      <Link
        className="chat-aside__door"
        to={`/agents/${agent.id}`}
        data-testid="agent-aside-dash"
      >
        {t('chat.agentAside.dash')} →
      </Link>
    </aside>
  )
}
