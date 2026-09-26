import { beforeEach, describe, expect, it } from 'vitest'
import {
  AGENT_CLIENT_TOOLS,
  noteAgentClientTurn,
  resetAgentClientsForTests,
} from './src/agent/agent-clients'

/**
 * A SPECIALIST'S CLIENTS (owner, 2026-09-26). Each case is a way this could
 * leak or lie: words kept where only a count belongs, one seller seeing
 * another's clients, a junk id stored, a broken table failing the turn.
 */
type Row = { owner: string; agent: string; client: string; turns: number }
const table: Row[] = []
const pool = {
  async query(sql: string, params: unknown[] = []) {
    if (sql.startsWith('INSERT INTO agent_client_work')) {
      const [owner, agent, client] = params.map(String)
      const hit = table.find(
        r => r.owner === owner && r.agent === agent && r.client === client
      )
      if (hit) hit.turns += 1
      else table.push({ owner, agent, client, turns: 1 })
    }
    if (sql.includes('FROM agent_client_work')) {
      const [owner, agent] = params.map(String)
      return {
        rows: table
          .filter(r => r.owner === owner && r.agent === agent)
          .map(r => ({ client_id: r.client, turns: r.turns, last_at: 'now' })),
      }
    }
    return { rows: [] }
  },
}
const tool = AGENT_CLIENT_TOOLS[0]

beforeEach(() => {
  table.length = 0
  resetAgentClientsForTests()
})

describe("a specialist's clients", () => {
  it('counts turns per client, keeps no words, and each seller sees only their own', async () => {
    await noteAgentClientTurn(pool, '900000011', 'rtl', '900000031')
    await noteAgentClientTurn(pool, '900000011', 'rtl', '900000031')
    await noteAgentClientTurn(pool, '900000012', 'rtl', '900000032')
    const mine = (await tool.handler({ agent: 'rtl' }, {
      telegramId: '900000011',
      pool,
    } as never)) as { clients: Array<{ client: string; turns: number }> }
    expect(mine.clients).toEqual([
      { client: '900000031', turns: 2, lastAt: 'now' },
    ])
    expect(JSON.stringify(table)).not.toMatch(/content|text/)
  })

  it('an unknown agent or a junk client id is not stored', async () => {
    await noteAgentClientTurn(pool, '900000011', 'nobody', '900000031')
    await noteAgentClientTurn(pool, '900000011', 'rtl', 'drop table')
    expect(table).toEqual([])
  })

  it('a broken table never fails the turn', async () => {
    const broken = {
      async query() {
        throw new Error('down')
      },
    }
    await expect(
      noteAgentClientTurn(broken, '900000011', 'rtl', '900000031')
    ).resolves.toBeUndefined()
  })

  it('the chat route writes the row only for client + agent turns', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(`${__dirname}/src/agent/routes.ts`, 'utf8')
    expect(src).toMatch(/if \(gate\.client && gate\.agent\)\s*void/)
  })
})
