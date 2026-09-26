/**
 * SEVERAL CONVERSATIONS WITH ONE AGENT (owner, 2026-09-26: "so I can keep
 * several chats going").
 *
 * The server keeps a conversation as its base thread plus `~<id>` (render
 * conversation.ts) and lists them at /api/agent/conversations. This file is
 * the client side of that contract: the id, the list, the calls, and the
 * pure rules the rail draws by -- kept apart from React so they are tested
 * on their own.
 */
import { API_BASE } from '@/config'
import { authHeaders } from '@/lib/apiFetch'

/** The server's CONVERSATION_RE; an id that fails it is never sent. */
export const CONVERSATION_RE = /^[a-z0-9]{4,24}$/

export function isConversationId(raw: unknown): raw is string {
  return typeof raw === 'string' && CONVERSATION_RE.test(raw)
}

/** A fresh id: time first so ids sort roughly by birth, then randomness. */
export function newConversationId(
  now: number = Date.now(),
  random: () => number = Math.random
): string {
  const tail = Array.from({ length: 4 }, () =>
    Math.floor(random() * 36).toString(36)
  ).join('')
  return `${now.toString(36)}${tail}`.slice(-16)
}

export interface Conversation {
  /** null: the base thread, the conversation that was there first. */
  conversation: string | null
  title: string | null
  turns: number
  lastAt: string
  preview: string
}

/** The query naming a specialist, or nothing for the own thread. */
const agentQuery = (agent: string | null, first: boolean) =>
  agent ? `${first ? '?' : '&'}agent=${encodeURIComponent(agent)}` : ''

/** The list, or null when it could not be read -- never an empty guess. */
export async function loadConversations(
  agent: string | null
): Promise<Conversation[] | null> {
  try {
    const r = await fetch(
      `${API_BASE}/api/agent/conversations${agentQuery(agent, true)}`,
      { headers: authHeaders() }
    )
    if (!r.ok) return null
    const body = (await r.json()) as { conversations?: unknown }
    return Array.isArray(body.conversations)
      ? (body.conversations as Conversation[])
      : null
  } catch {
    return null
  }
}

export async function renameConversation(
  agent: string | null,
  conversation: string,
  title: string
): Promise<boolean> {
  try {
    const r = await fetch(`${API_BASE}/api/agent/conversations`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        ...(agent ? { agent } : {}),
        conversation,
        title,
      }),
    })
    return r.ok
  } catch {
    return false
  }
}

/** Delete a conversation on the server: its turns and its name. */
export async function deleteConversation(
  agent: string | null,
  conversation: string | null
): Promise<boolean> {
  const params = new URLSearchParams()
  if (agent) params.set('agent', agent)
  if (conversation) params.set('conversation', conversation)
  const q = params.toString()
  try {
    const r = await fetch(`${API_BASE}/api/agent/history${q ? `?${q}` : ''}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    return r.ok
  } catch {
    return false
  }
}

export type DayGroup = 'today' | 'yesterday' | 'earlier'

/** Which heading a conversation sits under, by its last turn. Pure. */
export function dayGroup(lastAt: string, now: Date = new Date()): DayGroup {
  const t = Date.parse(lastAt)
  if (!Number.isFinite(t)) return 'earlier'
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime()
  if (t >= startOfToday) return 'today'
  if (t >= startOfToday - 86_400_000) return 'yesterday'
  return 'earlier'
}

/**
 * What the rail shows: the server's list, with the open conversation on top
 * if the server has not seen it yet (a new chat before its first message),
 * filtered by the search words. Pure.
 */
export function railRows(
  listed: readonly Conversation[],
  current: string | null,
  query: string
): Conversation[] {
  const rows = [...listed]
  if (current && !rows.some(r => r.conversation === current))
    rows.unshift({
      conversation: current,
      title: null,
      turns: 0,
      lastAt: new Date().toISOString(),
      preview: '',
    })
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return rows
  return rows.filter(r => {
    const hay = `${r.title ?? ''} ${r.preview}`.toLowerCase()
    return words.every(w => hay.includes(w))
  })
}

/** The thread key of one row, as agentStream names its streams. */
export function rowThreadKey(
  agent: string | null,
  conversation: string | null
): string {
  const base = agent ? `agent:${agent}` : 'self'
  return conversation ? `${base}~${conversation}` : base
}
