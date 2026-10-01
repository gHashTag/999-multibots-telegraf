import * as SPEC from '../spec/kanban-card-chat.gen'

/**
 * Drift of the card-status door, kept in ONE issue (spec kanban-card-chat.t27
 * v5, DRIFT_ONE_ISSUE).
 *
 * `tri card-drift` runs every night: the server's GraphQL query against live
 * GitHub, the same card read the client's way. Drift opens one issue under
 * the EPIC; the next drifting night comments on it instead of opening a
 * second; the first night of agreement closes it. A night with nothing
 * measured is not agreement and touches nothing.
 */
export function driftAction(drifted: boolean, issueOpen: boolean): number {
  if (drifted) return issueOpen ? SPEC.DRIFT_COMMENT : SPEC.DRIFT_OPEN
  return issueOpen ? SPEC.DRIFT_CLOSE : SPEC.DRIFT_NONE
}

export const DRIFT_VERBS: Record<number, string> = {
  [SPEC.DRIFT_NONE]: 'none',
  [SPEC.DRIFT_OPEN]: 'open',
  [SPEC.DRIFT_COMMENT]: 'comment',
  [SPEC.DRIFT_CLOSE]: 'close',
}
