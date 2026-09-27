import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import * as SPEC from './crm-client-workspace.gen'

/**
 * THE CLIENT WORKSPACE IS WRITTEN IN t27 FIRST (skill t27-spec-first).
 *
 * gHashTag/t27 specs/automation/crm-client-workspace.t27 is the spec of
 * record; that the vendored copy, its generated module and the host agree is
 * held by scripts/check-t27-specs.mjs. Here each `test` of the spec runs
 * against the HOST: the route gate (threadFor), the thread keys, the lost
 * duet run, the tools the dashboard reads through, and the player's routes
 * and panels (another package: its files are read).
 *
 * v2 came from binding v1: v1 turned a malformed client id into the seller's
 * own thread, while the host refuses it -- this file would not pass on v1.
 *
 * Refresh: node scripts/sync-t27-spec.mjs <t27 checkout> automation/crm-client-workspace
 */
const SELLER = '900000001'
const STRANGER = '900000042'
const CLIENT = '900000077'

vi.mock('../agent/chat', () => ({
  runAgent: async function* () {
    yield {}
  },
}))
vi.mock('../agent/telegram-tools', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isSeller: async (ctx: { telegramId: string }) =>
    String(ctx.telegramId) === SELLER,
}))

const getPool = () => ({ query: async () => ({ rows: [] }) })
const PLAYER = join(__dirname, '..', '..', '..', 'player', 'src')

/** threadFor as the spec's thread_kind reads it. */
async function kindOf(client: string | undefined, caller: string) {
  const { threadFor } = await import('../agent/routes')
  const g: any = await threadFor(client, caller, getPool)
  if (g.ok && g.client === null) return SPEC.THREAD_KIND_SELF
  if (g.ok) return SPEC.THREAD_KIND_CLIENT
  return g.status === 403
    ? SPEC.THREAD_KIND_NOT_SELLER
    : SPEC.THREAD_KIND_BAD_CLIENT
}

describe("the spec's tests hold against the host", () => {
  it("a client thread is separate from the seller's own thread and clearing one keeps the other", async () => {
    const { threadFor } = await import('../agent/routes')
    const { SELF_THREAD, clientThread } = await import('../agent/conversation')
    expect(await kindOf(undefined, SELLER)).toBe(SPEC.THREAD_KIND_SELF)
    expect(await kindOf(CLIENT, SELLER)).toBe(SPEC.THREAD_KIND_CLIENT)
    expect(SELF_THREAD).toBe(SPEC.THREAD_SELF)
    const g: any = await threadFor(CLIENT, SELLER, getPool)
    expect(g.thread).toBe(`${SPEC.THREAD_CLIENT_PREFIX}${CLIENT}`)
    expect(clientThread(CLIENT)).toBe(g.thread)
    // Clearing one thread keeps the other: run in agent-routes-client.test.ts
    // and conversation-client-thread.test.ts (the DELETE on a client thread).
    expect(SPEC.DELETE_CLEARS_ONLY_ITS_THREAD).toBe(true)
    expect(SPEC.ROUTES_WITH_THREAD).toBe(4)
  })

  it("a stranger, a malformed id and the caller's own id are refused before the first read", async () => {
    // thread_kind(named, digits, is_caller, is_seller); refused_before_db.
    expect(SPEC.GATE_BEFORE_DB).toBe(true)
    expect(await kindOf('123', SELLER)).toBe(SPEC.THREAD_KIND_BAD_CLIENT)
    expect(await kindOf('1'.repeat(16), SELLER)).toBe(
      SPEC.THREAD_KIND_BAD_CLIENT
    )
    expect(await kindOf(SELLER, SELLER)).toBe(SPEC.THREAD_KIND_BAD_CLIENT)
    expect(await kindOf(CLIENT, STRANGER)).toBe(SPEC.THREAD_KIND_NOT_SELLER)
    expect(await kindOf('9'.repeat(SPEC.CLIENT_ID_MIN_DIGITS), SELLER)).toBe(
      SPEC.THREAD_KIND_CLIENT
    )
    expect(
      await kindOf('9'.repeat(SPEC.CLIENT_ID_MIN_DIGITS - 1), SELLER)
    ).toBe(SPEC.THREAD_KIND_BAD_CLIENT)
    expect(
      await kindOf('9'.repeat(SPEC.CLIENT_ID_MAX_DIGITS + 1), SELLER)
    ).toBe(SPEC.THREAD_KIND_BAD_CLIENT)
    expect(await kindOf('9'.repeat(SPEC.CLIENT_ID_MAX_DIGITS), SELLER)).toBe(
      SPEC.THREAD_KIND_CLIENT
    )
  })

  it("the Queen's task goes to the specialist chosen in the thread, else to the assistant", () => {
    // task_goes_to(specialist_chosen). The player's taskTarget is run in
    // player src/lib/queen.test.ts; here: the panel and the page use it.
    const read = (...p: string[]) => readFileSync(join(PLAYER, ...p), 'utf8')
    expect(SPEC.QUEEN_TASK_TO_CHOSEN_SPECIALIST).toBe(true)
    const lib = read('lib', 'queen.ts')
    expect(lib).toMatch(/return agent \? \{ client, agent \} : \{ client \}/)
    const panel = read('components', 'Crm', 'QueenPanel.tsx')
    expect(panel).toContain('sendOrQueue(task, [], taskTarget(client, agent))')
    expect(read('pages', 'Chat.tsx')).toMatch(
      /<QueenPanel[\s\S]{0,120}agent=\{helper\}/
    )
    expect(SPEC.TASK_TO_SPECIALIST).not.toBe(SPEC.TASK_TO_ASSISTANT)
  })

  it("the Queen's thread sits beside the agent's, and a specialist keeps the client's memory", async () => {
    const { threadFor } = await import('../agent/routes')
    const { supervisorThread, clientThread } = await import(
      '../agent/conversation'
    )
    const g: any = await threadFor(
      CLIENT,
      SELLER,
      getPool,
      undefined,
      undefined,
      'supervisor'
    )
    expect(g.thread).toBe(
      `${clientThread(CLIENT)}${SPEC.THREAD_SUPERVISOR_SUFFIX}`
    )
    expect(supervisorThread(CLIENT)).toBe(g.thread)
    expect(g.thread).not.toBe(clientThread(CLIENT))
    // The agent-in-a-client-chat path returns clientThread (routes.ts); run
    // with a catalogued agent in agent-routes-client.test.ts.
    expect(SPEC.AGENT_KEEPS_CLIENT_MEMORY).toBe(true)
  })

  it('the dashboard reads through the tool gate, sends nothing unasked and says unavailable rather than zero', async () => {
    const { TOOLS } = await import('../agent/tools')
    const reads = ['crm_clients', 'crm_client_plan', 'crm_duet_runs']
    expect(reads.filter(n => TOOLS.some(t => t.name === n))).toHaveLength(
      SPEC.NEW_READ_TOOLS
    )
    expect(SPEC.READS_THROUGH).toBe('/mcp')
    // Seven panels on the client page, counted where they are drawn.
    const page = readFileSync(join(PLAYER, 'pages', 'CrmClient.tsx'), 'utf8')
    const panels = page.match(/^\s*<(?:Panel|[A-Z][A-Za-z]*Panel)\b/gm) ?? []
    expect(panels).toHaveLength(SPEC.PANELS)
    expect(SPEC.DASHBOARD_SENDS_NOTHING_UNASKED).toBe(true)
    expect(SPEC.DUET_CONTROL_DEFAULT_DRY_RUN).toBe(true)
    expect(SPEC.DUET_CONTROL_TURNS_DEFAULT).toBeLessThanOrEqual(
      SPEC.DUET_CONTROL_TURNS_MAX
    )
    expect(SPEC.UNREACHABLE_SAYS).toBe('unavailable')
    expect(SPEC.LIST_FILTER).toBe('all,clients,leads')
  })

  it('duet runs are written at start, each turn and finish, and a stale running row reads as lost', async () => {
    // run_reads_as_lost(running, minutes_since_start)
    const { viewOf, LOST_AFTER_MS } = await import('../agent/crm-duet-tool')
    const now = Date.parse('2026-09-27T12:00:00Z')
    const run = (state: string, minutesAgo: number) =>
      ({
        id: 'duet-x',
        state,
        started_at: new Date(now - minutesAgo * 60_000).toISOString(),
      }) as never
    expect(LOST_AFTER_MS).toBe(SPEC.RUN_LOST_AFTER_MIN * 60_000)
    expect(viewOf(run('running', 31), now).state).toBe('lost')
    expect(viewOf(run('running', 30), now).state).toBe('running')
    expect(viewOf(run('done', 90), now).state).toBe('done')
    expect(SPEC.TABLE_RUNS).toBe('crm_duet_runs')
    expect(SPEC.RUN_LOST_IS_STORED).toBe(false)
  })

  it('the client is a telegram id, the caller is a seller, and only the dashboard is claimed live', () => {
    const app = readFileSync(join(PLAYER, 'App.tsx'), 'utf8')
    expect(app).toContain(`path="${SPEC.ROUTE_CLIENT}"`)
    expect(app).toContain(`path="${SPEC.ROUTE_CLIENT_CHAT}"`)
    expect(app).toContain(`path="${SPEC.ROUTE_LIST}"`)
    expect(SPEC.CLIENT_IS).toBe('telegram-id')
    expect(SPEC.CALLER).toBe('seller')
    expect(SPEC.DASHBOARD_SEEN_LIVE).toBe(true)
    expect(SPEC.RUN_SURVIVED_REDEPLOY).toBe(false)
  })
})
