/**
 * Shared SAFE BETA capability policy.
 *
 * This is deliberately data-only and does not read environment variables.
 * A deployment flag, a paid quota, or a caller-provided confirmation must not
 * widen the reviewed capability set.
 */

export type AgentToolEffect =
  | 'read'
  | 'draft'
  | 'paid'
  | 'publish'
  | 'access'
  | 'approval'

export type AgentToolScope = 'owner'

export interface AgentToolPolicyDescriptor {
  name: string
  effect?: AgentToolEffect | string
  scope?: AgentToolScope | string
  paid?: boolean
  approvalGroup?: string | null
  /** Callers may send this, but SAFE BETA never treats it as authorization. */
  confirmed?: boolean
}

export type AgentToolDenialCode =
  | 'unknown_tool'
  | 'tool_not_allowed'
  | 'paid_not_allowed'
  | 'approval_not_allowed'
  | 'scope_not_allowed'
  | 'effect_not_allowed'

export type AgentToolAccessDecision =
  | { allowed: true; code: 'allowed' }
  | { allowed: false; code: AgentToolDenialCode; reason: string }

const EXPOSED_TOOLS = Object.freeze([
  'whoami',
  'feed_stats',
  'content_plan_prepare',
] as const)

const ALLOWED_EFFECTS = Object.freeze(['read', 'draft'] as const)
const ALLOWED_SCOPES = Object.freeze(['owner'] as const)
const NO_APPROVAL_GROUPS = Object.freeze([] as const)

export type SafeBetaAgentToolName = (typeof EXPOSED_TOOLS)[number]

export const SAFE_BETA_AGENT_POLICY = Object.freeze({
  enabled: true as const,
  exposedTools: EXPOSED_TOOLS,
  executableTools: EXPOSED_TOOLS,
  allowedEffects: ALLOWED_EFFECTS,
  allowedScopes: ALLOWED_SCOPES,
  approvalGroups: NO_APPROVAL_GROUPS,
  paidQuota: 0 as const,
})

const executableTools = new Set<string>(SAFE_BETA_AGENT_POLICY.executableTools)
const allowedEffects = new Set<string>(SAFE_BETA_AGENT_POLICY.allowedEffects)
const allowedScopes = new Set<string>(SAFE_BETA_AGENT_POLICY.allowedScopes)

/** Fail-closed decision used by every server entry point before a handler. */
export function decideAgentToolAccess(
  tool: AgentToolPolicyDescriptor | null | undefined
): AgentToolAccessDecision {
  if (!tool || typeof tool.name !== 'string' || !tool.name) {
    return {
      allowed: false,
      code: 'unknown_tool',
      reason: 'Unknown tools are unavailable in SAFE BETA.',
    }
  }

  if (!executableTools.has(tool.name)) {
    return {
      allowed: false,
      code: 'tool_not_allowed',
      reason: 'This tool is unavailable in SAFE BETA.',
    }
  }

  if (tool.paid === true || tool.effect === 'paid') {
    return {
      allowed: false,
      code: 'paid_not_allowed',
      reason: 'Paid operations are unavailable in SAFE BETA.',
    }
  }

  if (typeof tool.approvalGroup === 'string' && tool.approvalGroup.length > 0) {
    return {
      allowed: false,
      code: 'approval_not_allowed',
      reason: 'Approval-gated operations are unavailable in SAFE BETA.',
    }
  }

  if (!tool.scope || !allowedScopes.has(tool.scope)) {
    return {
      allowed: false,
      code: 'scope_not_allowed',
      reason: 'Only owner-scoped tools are available in SAFE BETA.',
    }
  }

  if (!tool.effect || !allowedEffects.has(tool.effect)) {
    return {
      allowed: false,
      code: 'effect_not_allowed',
      reason: 'This effect is unavailable in SAFE BETA.',
    }
  }

  return { allowed: true, code: 'allowed' }
}

export function isSafeBetaAgentTool(
  tool: AgentToolPolicyDescriptor | null | undefined
): boolean {
  return decideAgentToolAccess(tool).allowed
}
