import { useState } from 'react'
import { useLanguage } from '@/hooks/useLanguage'
import {
  addAgentSkill,
  useAgentSkills,
  type AddedSkill,
} from '@/hooks/useAgentSkills'
import {
  agentSkillPrefix,
  marketplaceAgentById,
} from '../../../../packages/vibee-atoms/src/agent-marketplace'
import './AgentSkillsPanel.css'

/**
 * WHAT THIS AGENT CARRIES, AND A RULE FOR IT IN ONE LINE.
 *
 * Owner, 2026-09-24: "in every agent the skills are connected". The first
 * version only listed the person's own prefixed skills, so an owner with
 * none saw every agent say "no skills" -- and a hint with a literal
 * "<agent>" in it. Now the panel says three things, all true:
 *   - what the agent knows how to do (the catalogue's own skills);
 *   - which of the person's rules it carries (the same list its prompt gets);
 *   - and a field to add a rule for THIS agent right here, the prefix put in
 *     for them (agentSkillName), from the next message on.
 */
export function AgentSkillsPanel({ agentId }: { agentId: string }) {
  const { t, lang } = useLanguage()
  const l: 'ru' | 'en' = lang === 'ru' ? 'ru' : 'en'
  const [version, setVersion] = useState(0)
  const names = useAgentSkills(agentId, version)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<AddedSkill | null>(null)
  const listing = marketplaceAgentById(agentId)
  if (!listing) return null
  const prefix = agentSkillPrefix(agentId, l) ?? listing.name[l]

  const add = async () => {
    if (!draft.trim() || busy) return
    setBusy(true)
    const r = await addAgentSkill(agentId, l, draft)
    setResult(r)
    setBusy(false)
    if (r.ok) {
      setDraft('')
      setVersion(v => v + 1)
    }
  }

  return (
    <div className="agent-skills-panel" data-testid="agent-skills-panel">
      <p className="agent-skills-line" data-testid="agent-skills-builtin">
        {t('chat.agentSkills.builtin', {
          skills: listing.skills.map(s => s[l]).join(' · '),
        })}
      </p>
      {names ? (
        <p className="agent-skills-line" data-testid="agent-skills">
          {names.own.length || names.general.length
            ? t('chat.agentSkills.on', {
                own: names.own.join(' · ') || '—',
                general: names.general.length,
              })
            : t('chat.agentSkills.none', { prefix })}
        </p>
      ) : null}
      <form
        className="agent-skills-add"
        onSubmit={e => {
          e.preventDefault()
          void add()
        }}
      >
        <input
          className="agent-skills-add__input"
          data-testid="agent-skills-input"
          value={draft}
          maxLength={2000}
          placeholder={t('chat.agentSkills.add.placeholder')}
          onChange={e => setDraft(e.target.value)}
        />
        <button
          type="submit"
          className="agent-skills-add__button"
          data-testid="agent-skills-add"
          disabled={busy || !draft.trim()}
        >
          {t('chat.agentSkills.add.button')}
        </button>
      </form>
      {result ? (
        <p
          className={`agent-skills-line agent-skills-line--${result.ok ? 'ok' : 'error'}`}
          data-testid="agent-skills-result"
          role="status"
        >
          {result.ok
            ? t('chat.agentSkills.add.saved', { name: result.name })
            : t('chat.agentSkills.add.failed', { reason: result.reason })}
        </p>
      ) : null}
    </div>
  )
}
