/**
 * WHICH CLIENTS A SPECIALIST HAS HELPED WITH (owner, 2026-09-26: "the
 * specialist's clients on its dashboard, and 'call it to client N' from
 * there").
 *
 * A turn in a client's conversation with an agent called in (routes.ts,
 * threadFor client + agent) leaves one row: whose, which agent, which
 * client, how many turns, when last. No words -- the conversation itself
 * stays in the client's thread, where it always was. Read back by the
 * caller for the caller only (`agent_clients`), never across sellers.
 */
import type { AgentTool, ToolContext } from './tools'
import { marketplaceAgentById } from '../../../packages/vibee-atoms/src/agent-marketplace'

export interface Queryable {
  query: (
    sql: string,
    params?: unknown[]
  ) => Promise<{ rows: Array<Record<string, unknown>> }>
}

let ready = false
export function resetAgentClientsForTests(): void {
  ready = false
}

async function ensureTable(q: Queryable): Promise<void> {
  if (ready) return
  await q.query(`CREATE TABLE IF NOT EXISTS agent_client_work (
    owner text NOT NULL,
    agent_id text NOT NULL,
    client_id text NOT NULL,
    turns integer NOT NULL DEFAULT 1,
    last_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (owner, agent_id, client_id)
  )`)
  ready = true
}

/** One more turn of `agent` about `client`, for `owner`. Never throws. */
export async function noteAgentClientTurn(
  q: Queryable,
  owner: string,
  agent: string,
  client: string
): Promise<void> {
  if (!marketplaceAgentById(agent) || !/^\d{5,15}$/.test(client)) return
  try {
    await ensureTable(q)
    await q.query(
      `INSERT INTO agent_client_work (owner, agent_id, client_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (owner, agent_id, client_id)
       DO UPDATE SET turns = agent_client_work.turns + 1, last_at = now()`,
      [owner, agent, client]
    )
  } catch {
    /* A lost row costs one line on a dashboard, never the answer. */
  }
}

export interface AgentClientRow {
  client: string
  turns: number
  lastAt: string
}

/** The caller's clients this agent helped with, most recent first. */
export async function agentClients(
  q: Queryable,
  owner: string,
  agent: string,
  limit = 20
): Promise<AgentClientRow[]> {
  await ensureTable(q)
  const { rows } = await q.query(
    `SELECT client_id, turns, last_at::text AS last_at
       FROM agent_client_work
      WHERE owner = $1 AND agent_id = $2
      ORDER BY last_at DESC
      LIMIT $3`,
    [owner, agent, Math.min(Math.max(1, limit), 100)]
  )
  return rows.map(r => ({
    client: String(r.client_id),
    turns: Number(r.turns) || 0,
    lastAt: String(r.last_at ?? ''),
  }))
}

export const AGENT_CLIENT_TOOLS: AgentTool[] = [
  {
    name: 'agent_clients',
    description:
      'С какими СВОИМИ клиентами работал агент каталога (его звали в чат клиента): ' + // cyrillic-ok: tool description
      'id клиента, сколько ходов, когда последний. Только свои.', // cyrillic-ok: tool description
    parameters: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'id агента, например rtl' }, // cyrillic-ok: tool description
      },
      required: ['agent'],
      additionalProperties: false,
    },
    async handler(args: Record<string, unknown>, ctx?: ToolContext) {
      const who = String(ctx?.telegramId ?? '')
      const agent = String(args?.agent ?? '')
      if (!who) throw new Error('who is asking?')
      if (!marketplaceAgentById(agent))
        return { clients: [], error: 'unknown agent' }
      return {
        agent,
        clients: await agentClients(
          ctx!.pool as unknown as Queryable,
          who,
          agent
        ),
      }
    },
  },
]
