import { useLanguage } from '@/hooks/useLanguage'
import { useIsKeeper } from '@/hooks/useIsKeeper'
import { useAgentAcceptance } from '@/hooks/useAgentAcceptance'
import { MARKETPLACE_AGENTS } from '../../../../packages/vibee-atoms/src/agent-marketplace'
import { helpersFor } from '@/lib/clientHelpers'
import './ClientHelperPicker.css'

/**
 * WHICH SPECIALIST HELPS WITH THIS CLIENT (owner, 2026-09-26: "add the
 * agents to the chat for working with clients").
 *
 * In a client's thread the owner can call one catalogued agent into the
 * conversation: the next message goes with `agent` beside `client`, the
 * render answers in the CLIENT's thread (routes.ts threadFor) with that
 * agent's contract and skills. "Assistant" is no specialist at all.
 *
 * Only agents this person may open are offered -- the same rule as their
 * own threads (agentGate): live for everybody, any for a keeper, a trainee
 * that earned the market by its daily checks. The server checks again.
 */

export function ClientHelperPicker({
  value,
  onChange,
}: {
  value: string | null
  onChange: (id: string | null) => void
}) {
  const { t, lang } = useLanguage()
  const l: 'ru' | 'en' = lang === 'ru' ? 'ru' : 'en'
  const keeper = useIsKeeper(true)
  const verdicts = useAgentAcceptance()
  const helpers = helpersFor(MARKETPLACE_AGENTS, keeper, verdicts)
  if (!helpers.length) return null
  const chip = (id: string | null, label: string, title?: string) => (
    <button
      key={id ?? 'none'}
      type="button"
      className="client-helper__chip"
      aria-pressed={value === id}
      title={title}
      data-testid={`client-helper-${id ?? 'none'}`}
      onClick={() => onChange(id)}
    >
      {label}
    </button>
  )
  return (
    <div
      className="client-helper"
      role="group"
      aria-label={t('crm.client.helper.label')}
      data-testid="client-helper"
    >
      <span className="client-helper__label">
        {t('crm.client.helper.label')}
      </span>
      {chip(null, t('crm.client.helper.none'))}
      {helpers.map(a => chip(a.id, `${a.icon} ${a.name[l]}`, a.promise[l]))}
    </div>
  )
}
