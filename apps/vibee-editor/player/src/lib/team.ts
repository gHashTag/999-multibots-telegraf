/**
 * THE PERSON'S TEAM OF AGENTS, IN THE MINI-APP AS IN THE BOT.
 *
 * Spec of record: bot-agent-team.t27 (gHashTag/t27#7855). Owner, 2026-10-08:
 * "a team of agents, each with its own chat" and "the same logic in the
 * mini-app". The team is the person's tabs in their bot, read from
 * /api/agent/team. A member's chat here IS its tab's conversation
 * (`tab<kind>`, APP_CHAT_IS_TAB), so the Director's tab in the bot and the
 * Director's chat here are one memory with one trade. A member not yet on
 * the team gets a "+" circle; a press hires it -- its tab appears in the bot
 * -- and opens its chat.
 *
 * Kept apart from React so the rules are tested without a DOM.
 */
import { API_BASE } from '@/config'
import { authHeaders } from '@/lib/apiFetch'

export interface TeamMember {
  kind: string
  /** The tab's title in the person's language, emoji first. */
  title: string
  /** The member's chat; null for the Agent, whose chat is the base one. */
  conversation: string | null
  onTeam: boolean
  /** Shown as a chat (spec app_lists). */
  listed: boolean
  /** Shown as a "+" to hire (spec offered). */
  offered: boolean
}

export interface TeamView {
  bot: string
  botHasTabs: boolean
  members: TeamMember[]
}

export async function loadTeam(lang: string): Promise<TeamView | null> {
  try {
    const r = await fetch(
      `${API_BASE}/api/agent/team?lang=${lang === 'ru' ? 'ru' : 'en'}`,
      { headers: authHeaders() }
    )
    if (!r.ok) return null
    const body = (await r.json()) as Partial<TeamView> & { ok?: boolean }
    return Array.isArray(body.members) ? (body as TeamView) : null
  } catch {
    return null
  }
}

/** Hire a member; resolves to its chat's conversation, or undefined on failure. */
export async function hireMember(
  kind: string,
  lang: string
): Promise<string | null | undefined> {
  try {
    const r = await fetch(`${API_BASE}/api/agent/team`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, lang: lang === 'ru' ? 'ru' : 'en' }),
    })
    if (!r.ok) return undefined
    const body = (await r.json()) as { conversation?: string | null }
    return body.conversation ?? null
  } catch {
    return undefined
  }
}

/** The screen of a member's chat. */
export function memberHref(member: Pick<TeamMember, 'conversation'>): string {
  return member.conversation
    ? `/chat?c=${encodeURIComponent(member.conversation)}`
    : '/chat'
}

/** The emoji that opens a title, and the words after it. */
export function splitTitle(title: string): { mark: string; name: string } {
  const space = title.indexOf(' ')
  if (space <= 0) return { mark: '•', name: title }
  return { mark: title.slice(0, space), name: title.slice(space + 1) }
}

export interface TeamChip {
  member: TeamMember
  /** A chat to open (listed) or a member to hire (offered). */
  hire: boolean
  current: boolean
}

/**
 * The row: the listed members as chats, in team order, then the offered ones
 * as "+". `current` is the conversation open now (null for the Agent's).
 */
export function teamChips(
  view: TeamView | null,
  current: string | null
): TeamChip[] {
  if (!view) return []
  const chats = view.members
    .filter(m => m.listed)
    .map(m => ({ member: m, hire: false, current: m.conversation === current }))
  const hires = view.members
    .filter(m => !m.listed && m.offered)
    .map(m => ({ member: m, hire: true, current: false }))
  return [...chats, ...hires]
}
