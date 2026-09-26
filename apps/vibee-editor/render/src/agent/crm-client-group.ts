/**
 * A CLIENT'S GROUP: WHERE THE AGENT MAY TALK TO THIS CLIENT BESIDE THE DM.
 *
 * Owner, 2026-09-26: "the Farisha group -- allowed". A client can have a
 * Telegram group with the owner (a project chat, a club), and the agent may
 * write there under the SAME rule as the DM: it drafts, a send card appears,
 * the message goes out only when the owner presses Send (tg_send to the
 * group's negative id is already a card, #2951; groupCardLabel tells the
 * owner that every member will see it).
 *
 * What was missing is the link. Nothing said "this group belongs to that
 * client", so in the client's thread the agent could not know where the
 * client's group is, and the owner had no place to say it. One row per client
 * here: the owner binds a group the CRM has already read (crm_groups), the
 * client brief names it, the card shows it.
 *
 * Binding sends nothing and reads nothing new; it is the owner's memory.
 */
import type { AgentTool, ToolContext } from './tools'
import { requireSeller } from './telegram-tools'
import { ensureGroupTables, GROUP_ID } from './crm-groups'

type Pool = { query: (sql: string, p?: unknown[]) => Promise<{ rows: any[] }> }

const CLIENT_ID = /^\d{5,15}$/

let ready = false
export async function ensureClientGroupTable(pool: Pool): Promise<void> {
  if (ready) return
  await pool.query(
    `CREATE TABLE IF NOT EXISTS crm_client_groups (
       owner_id text NOT NULL,
       lead_id  text NOT NULL,
       chat_id  text NOT NULL,
       bound_at timestamptz NOT NULL DEFAULT now(),
       PRIMARY KEY (owner_id, lead_id)
     )`
  )
  ready = true
}

export function resetClientGroupTableForTests(): void {
  ready = false
}

export interface ClientGroup {
  chat_id: string
  title: string | null
  username: string | null
  members_count: number | null
}

/** The client's bound group with its title, or null. Never throws. */
export async function clientGroupFor(
  pool: Pool,
  owner: string,
  lead: string
): Promise<ClientGroup | null> {
  try {
    await ensureClientGroupTable(pool)
    const r = await pool.query(
      `SELECT b.chat_id, g.title, g.username, g.members_count
         FROM crm_client_groups b
         LEFT JOIN crm_groups g ON g.owner_id = b.owner_id AND g.chat_id = b.chat_id
        WHERE b.owner_id = $1 AND b.lead_id = $2`,
      [owner, lead]
    )
    const x = r.rows[0]
    if (!x) return null
    return {
      chat_id: String(x.chat_id),
      title: x.title ? String(x.title) : null,
      username: x.username ? String(x.username) : null,
      members_count:
        x.members_count === null || x.members_count === undefined
          ? null
          : Number(x.members_count),
    }
  } catch {
    return null
  }
}

/**
 * Bind a group the CRM has read for THIS owner. A group id nobody read is
 * refused: binding it would let a typo, or a chat the owner is not in, stand
 * as "the client's group" on the card.
 */
export async function bindClientGroup(
  pool: Pool,
  owner: string,
  lead: string,
  chat: string
): Promise<ClientGroup> {
  if (!CLIENT_ID.test(lead))
    throw new Error('client: a Telegram id of a person')
  if (!GROUP_ID.test(chat))
    throw new Error('chat: a group id is negative (-100… for a supergroup)')
  await ensureGroupTables(pool as never)
  const known = await pool.query(
    `SELECT 1 FROM crm_groups WHERE owner_id = $1 AND chat_id = $2`,
    [owner, chat]
  )
  if (!known.rows.length)
    throw new Error(
      'chat: this group is not in your CRM yet — read groups first (crm_ingest_chats {groups: true}), then pick it from crm_groups'
    )
  await ensureClientGroupTable(pool)
  await pool.query(
    `INSERT INTO crm_client_groups (owner_id, lead_id, chat_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (owner_id, lead_id)
     DO UPDATE SET chat_id = EXCLUDED.chat_id, bound_at = now()`,
    [owner, lead, chat]
  )
  return (
    (await clientGroupFor(pool, owner, lead)) ?? {
      chat_id: chat,
      title: null,
      username: null,
      members_count: null,
    }
  )
}

export async function unbindClientGroup(
  pool: Pool,
  owner: string,
  lead: string
): Promise<void> {
  await ensureClientGroupTable(pool)
  await pool.query(
    `DELETE FROM crm_client_groups WHERE owner_id = $1 AND lead_id = $2`,
    [owner, lead]
  )
}

/** One line for the client brief: where the group is and the rule for it. */
export function clientGroupLine(g: ClientGroup | null): string {
  if (!g) return ''
  const name = g.title ? `«${g.title}»` : g.chat_id
  const members =
    g.members_count !== null ? `, участников: ${g.members_count}` : '' // cyrillic-ok: prompt copy
  return (
    `ГРУППА КЛИЕНТА: ${name} (chat ${g.chat_id}${members}). ` + // cyrillic-ok: prompt copy
    `Писать туда можно тем же правилом, что в личку: tg_send {chat: "${g.chat_id}"} — ` + // cyrillic-ok: prompt copy
    'это карточка, уходит только по нажатию владельца «Отправить»; сообщение увидят ВСЕ участники. ' + // cyrillic-ok: prompt copy
    'Что говорили в группе — crm_group_context.' // cyrillic-ok: prompt copy
  )
}

export const CRM_CLIENT_GROUP_TOOLS: AgentTool[] = [
  {
    name: 'crm_client_group',
    description:
      "A client's group: read it (only client), bind one the CRM has read (chat from crm_groups), or unbind (unbind: true). Binding sends nothing; posts into the group are tg_send cards the owner presses.",
    parameters: {
      type: 'object',
      properties: {
        client: { type: 'string', description: 'telegram id of the client' },
        chat: { type: 'string', description: 'group chat_id to bind' },
        unbind: { type: 'boolean' },
      },
      required: ['client'],
      additionalProperties: false,
    },
    async handler(a: Record<string, any>, ctx?: ToolContext) {
      await requireSeller(ctx)
      const owner = String(ctx!.telegramId)
      const lead = String(a?.client ?? '').trim()
      if (!CLIENT_ID.test(lead))
        throw new Error('client: a Telegram id of a person')
      const pool = ctx!.pool as never
      if (a?.unbind === true) {
        await unbindClientGroup(pool, owner, lead)
        return { client: lead, group: null, unbound: true }
      }
      const chat = String(a?.chat ?? '').trim()
      if (!chat)
        return { client: lead, group: await clientGroupFor(pool, owner, lead) }
      return {
        client: lead,
        group: await bindClientGroup(pool, owner, lead, chat),
        bound: true,
      }
    },
  },
]
