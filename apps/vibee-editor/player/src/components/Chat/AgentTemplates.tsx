import { useLanguage } from '@/hooks/useLanguage'
import { AGENT_TEMPLATES } from '@/pages/agentSuggestions'
import './AgentTemplates.css'

/**
 * THE AGENT'S CONFIGURED WORK, BACK IN ONE PRESS (owner, 2026-09-29).
 *
 * The owner sets a template up once (his noir story reel, the portrait
 * style) -- and then had to describe it from memory every time he wanted it
 * again. These buttons send the template's prompt into the agent's thread:
 * the agent reads the template back and proposes the run as a card, so the
 * press itself spends and sends nothing (the invariant of agentSuggestions).
 *
 * Drawn in two places -- the fresh agent thread (so the buttons are there
 * the moment the agent is chosen) and the agent panel beside the
 * conversation (so they stay there mid-work) -- both from AGENT_TEMPLATES.
 */
export function AgentTemplates({
  agentId,
  onSend,
  disabled = false,
}: {
  agentId: string
  onSend: (prompt: string) => void
  disabled?: boolean
}) {
  const { t } = useLanguage()
  const templates = AGENT_TEMPLATES[agentId]
  if (!templates?.length) return null
  return (
    <div className="agent-templates" data-testid="agent-templates">
      {templates.map(tp => (
        <button
          key={tp.labelKey}
          type="button"
          className="agent-templates__btn"
          data-testid={`agent-template-${tp.labelKey.split('.').pop()}`}
          disabled={disabled}
          onClick={() => onSend(tp.prompt)}
        >
          {t(tp.labelKey)}
        </button>
      ))}
    </div>
  )
}
