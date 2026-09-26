import type { MarketplaceAgentListing } from '../../../packages/vibee-atoms/src/agent-marketplace'

/**
 * The specialists this person may call into a client's thread: the same rule
 * as their own threads (agentGate) -- live for everybody, any for a keeper,
 * a trainee that earned the market by its daily checks. The server checks
 * again. Lives outside ClientHelperPicker.tsx so that file exports only the
 * component (fast refresh).
 */
export function helpersFor(
  agents: readonly MarketplaceAgentListing[],
  keeper: boolean | null,
  earned: Record<string, { earned?: boolean }> | null
): MarketplaceAgentListing[] {
  return agents.filter(
    a =>
      a.status === 'live' || keeper === true || earned?.[a.id]?.earned === true
  )
}
