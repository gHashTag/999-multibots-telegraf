import { useEffect, useState } from 'react'
import { API_BASE } from '@/config'
import { authHeaders } from '@/lib/apiFetch'
import {
  agentSkillName,
  agentSkills,
} from '../../../packages/vibee-atoms/src/agent-marketplace'

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

export function useAgentSkills(
  agentId: string | null,
  /** Bump it to read the list again (after a rule was added). */
  version = 0
): AgentSkillNames | null {
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
  }, [agentId, version])
  return agentId ? names : null
}

export type AddedSkill =
  | { ok: true; name: string }
  | { ok: false; reason: string }

/**
 * A RULE FOR THIS AGENT, WRITTEN IN ITS OWN CHAT. The person types only the
 * rule; the name that files it under the agent ("Работа: ...") is made by
 * the catalogue (agentSkillName), so nobody has to remember a prefix. It is
 * the same skills_create the profile uses: one table, one owner, and the
 * render puts it into this agent's prompt from the next message on.
 */
export async function addAgentSkill(
  agentId: string,
  lang: 'ru' | 'en',
  rule: string,
  send: typeof fetch = fetch
): Promise<AddedSkill> {
  const content = String(rule ?? '').trim()
  const name = agentSkillName(agentId, lang, content)
  if (!name) return { ok: false, reason: 'empty' }
  try {
    const r = await send(`${API_BASE}/mcp`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'skills_create', arguments: { name, content } },
      }),
    })
    if (!r.ok) return { ok: false, reason: `HTTP ${r.status}` }
    const d = await r.json()
    const out = d?.result?.structuredContent ?? {}
    if (out['создано'] === true) return { ok: true, name } // cyrillic-ok: the tool's own key
    return {
      ok: false,
      reason: String(out['причина'] ?? d?.error?.message ?? 'not saved'), // cyrillic-ok: the tool's own key
    }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'network' }
  }
}
