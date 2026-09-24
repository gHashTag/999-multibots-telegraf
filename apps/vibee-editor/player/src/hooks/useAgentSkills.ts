import { useEffect, useState } from 'react'
import { API_BASE } from '@/config'
import { authHeaders } from '@/lib/apiFetch'
import { agentSkills } from '../../../packages/vibee-atoms/src/agent-marketplace'

/**
 * WHICH OF THE PERSON'S SKILLS THIS AGENT CARRIES (owner, 2026-09-24: "in
 * every agent the skills are connected"). The render puts them into the
 * specialist's prompt (agent-skills.ts); this reads the same list the same
 * way (vibee-atoms agentSkills) so the chat can SAY what is connected.
 *
 * null while loading or when the list could not be read: the line is then
 * not drawn, rather than claiming "none".
 */
export interface AgentSkillNames {
  own: string[]
  general: string[]
}

export function useAgentSkills(agentId: string | null): AgentSkillNames | null {
  const [names, setNames] = useState<AgentSkillNames | null>(null)
  useEffect(() => {
    if (!agentId) return
    let live = true
    void fetch(`${API_BASE}/mcp`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'skills_list', arguments: {} },
      }),
    })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const rows = d?.result?.structuredContent?.['скиллы'] // cyrillic-ok: the tool's own key
        if (!live || !Array.isArray(rows)) return
        const s = agentSkills(
          rows.filter(
            (r: unknown) => typeof (r as { name?: unknown })?.name === 'string'
          ) as Array<{ name: string }>,
          agentId
        )
        setNames({
          own: s.own.map(r => r.name),
          general: s.general.map(r => r.name),
        })
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [agentId])
  return agentId ? names : null
}
