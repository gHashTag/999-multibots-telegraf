import {
  decideAgentToolAccess,
  type AgentToolAccessDecision,
  type AgentToolEffect,
  type AgentToolScope,
} from '../../../packages/vibee-atoms/src/agent-policy'

export interface ActivityPool {
  query: (
    sql: string,
    params?: unknown[]
  ) => Promise<{ rows: Record<string, any>[] }>
}

export interface ActivityContext {
  telegramId: string
  pool: ActivityPool
}

export interface SafeExecutableTool<
  Context extends ActivityContext = ActivityContext,
> {
  name: string
  effect?: AgentToolEffect | string
  scope?: AgentToolScope | string
  paid?: boolean
  approvalGroup?: string | null
  description: string
  parameters: Record<string, unknown>
  handler: (args: Record<string, any>, ctx: Context) => Promise<unknown>
}

export type SafeToolExecution =
  | { ok: true; value: unknown }
  | {
      ok: false
      code: Exclude<AgentToolAccessDecision, { allowed: true }>['code']
      error: string
    }

const REDACTED = '[REDACTED]'

function isSecretField(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase()
  return (
    normalized === 'key' ||
    normalized.endsWith('apikey') ||
    normalized.endsWith('agentkey') ||
    normalized.includes('authorization') ||
    normalized.includes('password') ||
    normalized.includes('secret') ||
    normalized.includes('token') ||
    normalized.includes('cookie') ||
    normalized.includes('initdata')
  )
}

function looksLikeCredential(value: string): boolean {
  const telegramBotToken =
    /(?:^|[^0-9])\d{6,12}:[A-Za-z0-9_-]{30,}(?=$|[^A-Za-z0-9_-])/
  const prefixedApiKey =
    /(?:^|[^A-Za-z0-9_-])(?:sk|xai)-[A-Za-z0-9_-]{16,}(?=$|[^A-Za-z0-9_-])/i
  const zaiKey =
    /(?:^|[^a-f0-9])[a-f0-9]{32}\.[A-Za-z0-9_-]{20,}(?=$|[^A-Za-z0-9_-])/i
  const jwt =
    /(?:^|[^A-Za-z0-9_-])[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?=$|[^A-Za-z0-9_-])/
  const initData = /(?:^|[?&])auth_date=\d+(?:&[^\s#]*)?&hash=[a-f0-9]{32,}/i
  const initDataReverse =
    /(?:^|[?&])hash=[a-f0-9]{32,}(?:&[^\s#]*)?&auth_date=\d+/i

  return (
    /^Bearer\s+/i.test(value) ||
    telegramBotToken.test(value) ||
    prefixedApiKey.test(value) ||
    zaiKey.test(value) ||
    jwt.test(value) ||
    initData.test(value) ||
    initDataReverse.test(value)
  )
}

/** Redacts both newly written activity and historical rows before returning. */
export function redactActivityDetails(value: unknown): unknown {
  const seen = new WeakSet<object>()

  const visit = (current: unknown): unknown => {
    if (typeof current === 'string' && looksLikeCredential(current)) {
      return REDACTED
    }
    if (current === null || typeof current !== 'object') return current
    if (seen.has(current)) return '[CIRCULAR]'
    seen.add(current)

    if (Array.isArray(current)) return current.map(visit)

    const output: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(current)) {
      output[key] = isSecretField(key) ? REDACTED : visit(child)
    }
    return output
  }

  return visit(value)
}

async function ensureActivityTable(pool: ActivityPool): Promise<void> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS agent_activity (
       id          bigserial PRIMARY KEY,
       telegram_id text NOT NULL,
       tool_name   text NOT NULL,
       effect      text NOT NULL,
       outcome     text NOT NULL,
       details     jsonb NOT NULL DEFAULT '{}'::jsonb,
       created_at  timestamptz NOT NULL DEFAULT now()
     )`
  )
}

async function recordOwnerActivity(
  ctx: ActivityContext,
  toolName: string,
  effect: string,
  outcome: 'ok' | 'denied' | 'error',
  details: unknown
): Promise<void> {
  try {
    await ensureActivityTable(ctx.pool)
    await ctx.pool.query(
      `INSERT INTO agent_activity
         (telegram_id, tool_name, effect, outcome, details)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        ctx.telegramId,
        toolName,
        effect,
        outcome,
        JSON.stringify(redactActivityDetails(details) ?? {}),
      ]
    )
  } catch {
    // Audit logging must not turn a safe read/draft into a service outage.
  }
}

/** Internal read-only UI source. It is intentionally not an MCP/LLM tool. */
export async function listOwnerActivity(
  ctx: ActivityContext,
  requestedLimit = 20
): Promise<Record<string, unknown>[]> {
  const limit = Math.min(Math.max(Math.trunc(requestedLimit) || 20, 1), 100)
  await ensureActivityTable(ctx.pool)
  const result = await ctx.pool.query(
    `SELECT id, tool_name, effect, outcome, details, created_at::text
     FROM agent_activity
     WHERE telegram_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [ctx.telegramId, limit]
  )

  return result.rows.map(row => {
    let details = row.details
    if (typeof details === 'string') {
      try {
        details = JSON.parse(details)
      } catch {
        details = {}
      }
    }
    return {
      id: row.id,
      tool_name: row.tool_name,
      effect: row.effect,
      outcome: row.outcome,
      details: redactActivityDetails(details),
      created_at: row.created_at,
    }
  })
}

/** The only supported execution path: policy decision always precedes handler. */
export async function executeSafeAgentTool<Context extends ActivityContext>(
  name: string,
  args: Record<string, any>,
  ctx: Context,
  findTool: (name: string) => SafeExecutableTool<Context> | null | undefined
): Promise<SafeToolExecution> {
  const tool = findTool(name)
  const decision = decideAgentToolAccess(tool)
  if (!decision.allowed) {
    await recordOwnerActivity(ctx, 'denied', 'denied', 'denied', {
      code: decision.code,
      arguments: args,
    })
    return { ok: false, code: decision.code, error: decision.reason }
  }

  try {
    const value = await tool!.handler(args, ctx)
    await recordOwnerActivity(ctx, tool!.name, String(tool!.effect), 'ok', {
      arguments: args,
    })
    return { ok: true, value }
  } catch {
    await recordOwnerActivity(ctx, tool!.name, String(tool!.effect), 'error', {
      arguments: args,
      error: 'handler_failed',
    })
    throw new Error('SAFE_BETA_TOOL_FAILED')
  }
}
