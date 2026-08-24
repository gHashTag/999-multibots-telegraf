import type { McpToolDescription } from './agentMcp'

export const SAFE_BETA_TOOL_NAMES = [
  'whoami',
  'feed_stats',
  'content_plan_prepare',
] as const

export type SafeBetaToolName = (typeof SAFE_BETA_TOOL_NAMES)[number]

const expectedEffect: Record<SafeBetaToolName, 'read' | 'draft'> = {
  whoami: 'read',
  feed_stats: 'read',
  content_plan_prepare: 'draft',
}

const safeToolNames = new Set<string>(SAFE_BETA_TOOL_NAMES)

export interface SafeAgentActivityEvent {
  id: string
  toolName: SafeBetaToolName
  status: 'running' | 'completed' | 'failed'
  durationMs?: number
  occurredAt: string
}

export interface PreparedOwnerDraft {
  prepared: true
  id: string | number
  topic?: string
  plan: Record<string, unknown>
  status: 'draft'
  owner: string | number
  created_at: string
}

const secretFragments = [
  /\b(?:authorization|(?:x[-_])?agent[-_]?key|(?:x[-_])?telegram[-_]?init[-_]?data|tg[-_]?web[-_]?app[-_]?data|init[-_]?data|(?:[a-z0-9]+[-_])?api[-_]?key|(?:telegram|bot)[-_]?token|access[-_]?token)\b\s*["']?\s*[:=]\s*["']?(?:bearer\s+)?[^\s"',;}]+/gi,
  /\b(?:query_id|user|receiver|chat_instance|chat_type|start_param|auth_date|can_send_after|hash|signature)=[^\s"'<>]*/gi,
  /\b\d{6,12}:[a-z0-9_-]*/gi,
  /\bxai-[a-z0-9_-]*/gi,
  /\b[a-f0-9]{32}\.[a-z0-9_-]*/gi,
  /\beyJ[A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]*){0,2}/g,
  /\bbearer(?:\s+[a-z0-9._~+/=-]*)?/gi,
  /\b[a-z][a-z0-9-]{1,30}_mcp_[a-z0-9_-]*/gi,
  /\bsk-[a-z0-9_-]*/gi,
]

/**
 * Stream content is untrusted server output. Redact credential-shaped values
 * before the text can enter chat state, Activity, logs or the DOM.
 */
export function redactAgentStreamText(value: unknown): string {
  let safe = typeof value === 'string' ? value : String(value ?? '')
  for (const pattern of secretFragments)
    safe = safe.replace(pattern, '[скрыто]')
  return safe
}

export function verifiedOwnerId(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const normalized = String(value).trim()
  return normalized ? normalized : null
}

/**
 * A draft receipt is accepted only when it is complete and owner-bound to the
 * identity returned by whoami in the same signed Telegram session.
 */
export function parsePreparedOwnerDraft(
  value: unknown,
  expectedOwnerId: string
): PreparedOwnerDraft | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  const owner = verifiedOwnerId(candidate.owner)
  const id = candidate.id
  const validId =
    (typeof id === 'number' && Number.isFinite(id) && id >= 0) ||
    (typeof id === 'string' && /^[a-z0-9_-]{1,80}$/i.test(id))
  const validPlan =
    candidate.plan !== null &&
    typeof candidate.plan === 'object' &&
    !Array.isArray(candidate.plan)
  const createdAt = candidate.created_at
  const validCreatedAt =
    typeof createdAt === 'string' &&
    createdAt.length > 0 &&
    Number.isFinite(Date.parse(createdAt))

  if (
    candidate.prepared !== true ||
    candidate.status !== 'draft' ||
    !validId ||
    !validPlan ||
    !validCreatedAt ||
    owner !== expectedOwnerId ||
    candidate.published === true ||
    candidate.paid === true ||
    candidate['опубликовано'] === true ||
    candidate['платная_генерация'] === true
  ) {
    return null
  }

  return candidate as unknown as PreparedOwnerDraft
}

/**
 * Registry metadata is necessary but not sufficient: the beta UI has an
 * intentionally tiny compile-time allowlist and rejects destructive hints or
 * an unexpected effect even when the server accidentally advertises one.
 */
export function selectSafeBetaTools(
  tools: McpToolDescription[]
): McpToolDescription[] {
  const seen = new Set<string>()
  return tools.filter(tool => {
    if (!safeToolNames.has(tool.name) || seen.has(tool.name)) return false
    const name = tool.name as SafeBetaToolName
    if (
      tool._meta?.scope !== 'owner' ||
      tool._meta?.effect !== expectedEffect[name] ||
      tool._meta.requiresOwnerApproval !== false ||
      tool.annotations?.readOnlyHint !== (expectedEffect[name] === 'read') ||
      tool.annotations?.destructiveHint !== false
    ) {
      return false
    }
    seen.add(tool.name)
    return true
  })
}

/** Extra, duplicate, or incompletely annotated tools are a registry regression. */
export function isExactSafeBetaRegistry(tools: McpToolDescription[]): boolean {
  return (
    tools.length === SAFE_BETA_TOOL_NAMES.length &&
    selectSafeBetaTools(tools).length === SAFE_BETA_TOOL_NAMES.length
  )
}

export function createSafeActivityEvent(
  toolName: string,
  durationMs?: number,
  occurredAt = new Date().toISOString()
): SafeAgentActivityEvent | null {
  if (!safeToolNames.has(toolName)) return null
  const safeDuration =
    typeof durationMs === 'number' &&
    Number.isFinite(durationMs) &&
    durationMs >= 0
      ? durationMs
      : undefined
  return {
    id: `${toolName}:${occurredAt}`,
    toolName: toolName as SafeBetaToolName,
    status: safeDuration === undefined ? 'running' : 'completed',
    ...(safeDuration === undefined ? {} : { durationMs: safeDuration }),
    occurredAt,
  }
}
