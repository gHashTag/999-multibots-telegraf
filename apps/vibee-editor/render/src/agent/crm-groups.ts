/**
 * GROUPS AS A CRM OBJECT (#2948, #2949).
 *
 * Owner, 2026-09-24: "why are there no groups?" -- because the CRM model is
 * one lead = one person id, and the ingest skipped every group on purpose.
 * A group is not a lead. It is a place where leads speak: so it gets its own
 * rows (crm_groups), its messages are kept WITH the sender's id
 * (crm_group_messages), and a member who wrote there is filed as a person the
 * owner can open like any other client ("wrote in group X").
 *
 * Read-only by construction: nothing here writes to Telegram. A post into a
 * group is the ordinary tg_send card the owner presses (#2951);
 * groupCardLabel below only names the group on that card.
 *
 * Everything is keyed by owner_id, the caller: a group is visible only to the
 * owner whose account it came from, exactly like crm_people.
 */
import { intentSignals } from './chat-memory'

type Pool = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>
}

/** How the ingest sees a dialog; the part the group rule reads. */
export interface GroupDialogLike {
  id?: { toString(): string }
  isUser?: boolean
  isGroup?: boolean
  isChannel?: boolean
  title?: string
  entity?: {
    title?: string
    username?: string
    participantsCount?: number
    creator?: boolean
    adminRights?: unknown
    left?: boolean
    deactivated?: boolean
  }
}

export type GroupKind = 'group' | 'channel'

/** A Telegram chat id: basic groups are negative, supergroups -100…. */
export const GROUP_ID = /^-\d{5,20}$/

/**
 * WHICH CHATS COUNT (#2948). A group or supergroup the owner is in: yes. A
 * broadcast channel: only when the owner runs it (creator or admin) -- a
 * channel they merely read is a newspaper, and its authors are not leads.
 * A chat the owner left, or a deactivated one, is not read.
 */
export function groupKindOf(d: GroupDialogLike): GroupKind | null {
  if (!d || d.isUser) return null
  const id = d.id?.toString() ?? ''
  if (!GROUP_ID.test(id)) return null
  if (d.entity?.left || d.entity?.deactivated) return null
  if (d.isGroup) return 'group'
  if (d.isChannel) {
    return d.entity?.creator || d.entity?.adminRights ? 'channel' : null
  }
  return null
}

let ready = false

export async function ensureGroupTables(pool: Pool): Promise<void> {
  if (ready) return
  await pool.query(
    `CREATE TABLE IF NOT EXISTS crm_groups (
       owner_id      text NOT NULL,
       chat_id       text NOT NULL,
       kind          text NOT NULL,
       title         text,
       username      text,
       members_count integer,
       seen_at       timestamptz NOT NULL DEFAULT now(),
       PRIMARY KEY (owner_id, chat_id)
     )`
  )
  await pool.query(
    `CREATE TABLE IF NOT EXISTS crm_group_messages (
       owner_id  text NOT NULL,
       chat_id   text NOT NULL,
       msg_id    bigint NOT NULL,
       sender_id text,
       at        timestamptz NOT NULL,
       "out"     boolean NOT NULL,
       text      text NOT NULL,
       PRIMARY KEY (owner_id, chat_id, msg_id)
     )`
  )
  await pool.query(
    `CREATE INDEX IF NOT EXISTS crm_group_messages_chat_at
       ON crm_group_messages (owner_id, chat_id, at DESC)`
  )
  ready = true
}

export function resetGroupTablesForTests(): void {
  ready = false
}

const cut = (v: unknown, max: number): string | null => {
  const s = String(v ?? '').trim()
  return s ? s.slice(0, max) : null
}

export async function rememberGroup(
  pool: Pool,
  owner: string,
  chatId: string,
  g: {
    kind: GroupKind
    title?: string | null
    username?: string | null
    members?: number | null
  }
): Promise<void> {
  await ensureGroupTables(pool)
  await pool.query(
    `INSERT INTO crm_groups (owner_id, chat_id, kind, title, username, members_count, seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (owner_id, chat_id) DO UPDATE
       SET kind = EXCLUDED.kind,
           title = EXCLUDED.title,
           username = EXCLUDED.username,
           members_count = EXCLUDED.members_count,
           seen_at = now()`,
    [
      owner,
      chatId,
      g.kind,
      cut(g.title, 128),
      cut(g.username, 32),
      Number.isFinite(Number(g.members)) ? Number(g.members) : null,
    ]
  )
}

export interface GroupMessage {
  msgId: number
  senderId: string | null
  at: Date
  out: boolean
  text: string
}

/** Files messages once; returns how many were new. */
export async function fileGroupMessages(
  pool: Pool,
  owner: string,
  chatId: string,
  msgs: GroupMessage[]
): Promise<number> {
  if (!msgs.length) return 0
  await ensureGroupTables(pool)
  const params: unknown[] = []
  const values: string[] = []
  for (const m of msgs) {
    const b = params.length
    values.push(
      `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7})`
    )
    params.push(
      owner,
      chatId,
      m.msgId,
      m.senderId,
      m.at,
      m.out,
      String(m.text).slice(0, 4000)
    )
  }
  const { rows } = await pool.query(
    `INSERT INTO crm_group_messages (owner_id, chat_id, msg_id, sender_id, at, "out", text)
     VALUES ${values.join(', ')}
     ON CONFLICT DO NOTHING
     RETURNING msg_id`,
    params
  )
  return rows?.length ?? 0
}

export interface GroupRow {
  chat_id: string
  kind: GroupKind
  title: string | null
  username: string | null
  members_count: number | null
  seen_at: string | null
  messages: number
  last_at: string | null
}

/** The caller's groups, most recently active first. */
export async function groupsFor(
  pool: Pool,
  owner: string,
  limit = 50
): Promise<GroupRow[]> {
  await ensureGroupTables(pool)
  const { rows } = await pool.query(
    `SELECT g.chat_id, g.kind, g.title, g.username, g.members_count,
            g.seen_at::text AS seen_at,
            count(m.msg_id)::int AS messages,
            max(m.at)::text AS last_at
       FROM crm_groups g
       LEFT JOIN crm_group_messages m
         ON m.owner_id = g.owner_id AND m.chat_id = g.chat_id
      WHERE g.owner_id = $1
      GROUP BY g.owner_id, g.chat_id
      ORDER BY max(m.at) DESC NULLS LAST, g.seen_at DESC
      LIMIT $2`,
    [owner, limit]
  )
  return rows as GroupRow[]
}

export interface ActiveMember {
  id: string
  messages: number
  last_at: string | null
}

/** Who speaks in a group: most messages first, the owner excluded. */
export function activeMembers(
  rows: Array<{ sender_id: string | null; at: string | Date; out: boolean }>,
  limit = 10
): ActiveMember[] {
  const by = new Map<string, ActiveMember>()
  for (const r of rows) {
    if (r.out || !r.sender_id || !/^\d{5,15}$/.test(String(r.sender_id)))
      continue
    const id = String(r.sender_id)
    const at = new Date(r.at).toISOString()
    const m = by.get(id) ?? { id, messages: 0, last_at: null }
    m.messages += 1
    if (!m.last_at || at > m.last_at) m.last_at = at
    by.set(id, m)
  }
  return [...by.values()]
    .sort(
      (a, b) =>
        b.messages - a.messages ||
        String(b.last_at).localeCompare(String(a.last_at))
    )
    .slice(0, limit)
}

export interface GroupContext {
  group: GroupRow | null
  messages: Array<{
    msg_id: number
    sender_id: string | null
    at: string
    out: boolean
    text: string
  }>
  members: ActiveMember[]
  signals: string[]
  intentScore: number
}

/**
 * One group's story for the caller: the newest messages (oldest first),
 * who speaks, and the buying signals in what OTHERS wrote. Returns
 * group: null when the caller has no such group -- the same answer for
 * "not yours" and "does not exist".
 */
export async function groupContext(
  pool: Pool,
  owner: string,
  chatId: string,
  limit = 50
): Promise<GroupContext> {
  await ensureGroupTables(pool)
  const g = await pool.query(
    `SELECT chat_id, kind, title, username, members_count, seen_at::text AS seen_at
       FROM crm_groups WHERE owner_id = $1 AND chat_id = $2`,
    [owner, chatId]
  )
  const group = (g.rows?.[0] as GroupRow | undefined) ?? null
  if (!group) {
    return {
      group: null,
      messages: [],
      members: [],
      signals: [],
      intentScore: 0,
    }
  }
  const { rows } = await pool.query(
    `SELECT msg_id, sender_id, at::text AS at, "out", text
       FROM crm_group_messages
      WHERE owner_id = $1 AND chat_id = $2
      ORDER BY at DESC LIMIT $3`,
    [owner, chatId, limit]
  )
  const messages = (rows as GroupContext['messages']).slice().reverse()
  const theirs = messages.filter(m => !m.out).map(m => m.text)
  const { score, signals } = intentSignals(theirs)
  return {
    group,
    messages,
    members: activeMembers(messages),
    signals,
    intentScore: score,
  }
}

/**
 * WHAT A GROUP POST SAYS ON ITS CARD (#2951).
 *
 * Posting into a group is already a tg_send card the owner presses -- the
 * platform's rule, unchanged. What was missing is the card telling him it is
 * a GROUP: a bare -100… id reads like any recipient, and a post there is seen
 * by every member and cannot be recalled. For a group this owner's ingest
 * has read, the card names it and its size; for any other negative id it
 * still says "group". Null for a person, so their card is untouched.
 */
export async function groupCardLabel(
  pool: Pool | undefined,
  owner: string,
  target: unknown
): Promise<string | null> {
  const chat = String(target ?? '').trim()
  if (!GROUP_ID.test(chat)) return null
  const fallback = `group ${chat}: every member will see it`
  if (!pool || !owner) return fallback
  try {
    await ensureGroupTables(pool)
    const { rows } = await pool.query(
      `SELECT title, members_count FROM crm_groups
        WHERE owner_id = $1 AND chat_id = $2`,
      [owner, chat]
    )
    const g = rows?.[0]
    if (!g) return fallback
    const size = Number.isFinite(Number(g.members_count))
      ? ` · ${Number(g.members_count)} members`
      : ''
    return `group «${String(g.title ?? chat)}»${size}: every member will see it`
  } catch {
    return fallback
  }
}
