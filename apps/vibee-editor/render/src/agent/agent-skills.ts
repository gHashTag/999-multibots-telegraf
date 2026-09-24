/**
 * EVERY SPECIALIST STARTS WITH ITS SKILLS ALREADY IN HAND.
 *
 * Owner, 2026-09-24: "connect all my agents, each with its own chat, and in
 * every agent the skills are connected". A skill is one of the person's own
 * rules (user_skills, skills_* tools). Until now an agent saw them only if it
 * thought to call skills_list -- a specialist opened in its thread started
 * without the owner's rules for its line of work.
 *
 * Which skills are an agent's is written in the skill's own NAME, the
 * convention the Leela editorial scope already uses ("Leela: ..."):
 *   "Работа: как отвечать рекрутёрам"  -> the job agent
 *   "Blogger: hashtags"                -> the blogger
 *   "Тон рилсов"  (no agent prefix)    -> every agent
 * The agent's own come first, then the general ones, within a budget: the
 * prompt is context taken from the conversation. Which prefixes are whose
 * lives in the catalogue (vibee-atoms agent-marketplace.ts skillPrefixes),
 * shared with the app.
 */

import {
  agentSkills,
  marketplaceAgentById,
} from '../../../packages/vibee-atoms/src/agent-marketplace'

export const SKILL_CHARS = 800
export const SKILLS_BUDGET = 3_000

export interface SkillRow {
  name: string
  content: string
}

/** An agent's skills: its own first, then the general ones. Pure. */
export function skillsFor(
  rows: readonly SkillRow[],
  agentId: string
): { own: SkillRow[]; general: SkillRow[] } {
  return agentSkills(rows, agentId)
}

/** The section the specialist's prompt carries, or '' for none. Pure. */
export function skillsSection(
  s: { own: SkillRow[]; general: SkillRow[] },
  budget = SKILLS_BUDGET
): string {
  const lines: string[] = []
  let used = 0
  for (const r of [...s.own, ...s.general]) {
    const body = String(r.content ?? '')
      .replace(/\s+/g, ' ')
      .trim()
    const line = `• ${r.name}: ${body.length > SKILL_CHARS ? `${body.slice(0, SKILL_CHARS - 1)}…` : body}`
    if (used + line.length > budget) break
    lines.push(line)
    used += line.length
  }
  if (!lines.length) return ''
  return (
    '\n\nТВОИ НАВЫКИ — правила владельца для этой работы, применяй их ' + // cyrillic-ok: prompt copy
    'без напоминаний (полный текст — skills_list, правка — skills_update):\n' + // cyrillic-ok: prompt copy
    lines.join('\n')
  )
}

export interface Queryable {
  query: (
    sql: string,
    params?: unknown[]
  ) => Promise<{ rows: Array<Record<string, unknown>> }>
}

/**
 * The person's own skills for this agent, as a prompt section. Never throws:
 * no table yet, or a database that is briefly away, is a turn without the
 * section, not a failed turn.
 */
export async function agentSkillsSection(
  pool: Queryable | null | undefined,
  telegramId: string,
  agentId: string | undefined
): Promise<string> {
  if (!pool || !agentId || !marketplaceAgentById(agentId)) return ''
  try {
    const { rows } = await pool.query(
      `SELECT name, content FROM user_skills
        WHERE telegram_id = $1
        ORDER BY updated_at DESC
        LIMIT 60`,
      [telegramId]
    )
    return skillsSection(
      skillsFor(
        rows.map(r => ({ name: String(r.name), content: String(r.content) })),
        agentId
      )
    )
  } catch {
    return ''
  }
}
