/**
 * The one place in this repo that sends a MUTATION to the Inngest GraphQL
 * API: `invokeFunction`. Everything else (`status/inngestGraphql.ts`) is
 * read-only by contract. This client is constructed only by the admin
 * `/inngest_probe` command, and only after the admin pressed the confirm
 * button; the payload it sends always carries `e2e_test: true` (see
 * `probeSuite.ts`).
 */
import {
  InngestGraphqlClient,
  type GqlClientOptions,
} from '@/inngest_app/status/inngestGraphql'
import type { ProbeClient } from './probeSuite'

/** Exact shapes, kept verbatim so they can be grepped and audited. */
export const GQL_INVOKE_MUTATION = `mutation ProbeInvoke($slug: String!, $data: Map) {
  invokeFunction(functionSlug: $slug, data: $data)
}`

export const GQL_RUN_TRACE_QUERY = `query ProbeRunTrace($runID: String!) {
  run(runID: $runID) { id status endedAt trace { name status childrenSpans { name status } } }
}`

interface TraceSpan {
  name: string
  status: string
  childrenSpans?: TraceSpan[]
}

/**
 * The top-level step spans of a run, with the attempt status folded in.
 *
 * Inngest's trace (verified on production runs, 2026-09-09) reports a step
 * that threw as `status: RUNNING` with a FAILED `Attempt N` child, and adds a
 * synthetic top-level `function error` span. The judge wants one status per
 * step, so a step whose own status or any attempt is FAILED is FAILED here.
 * Nested children below attempts are not steps and are not listed.
 */
export function topLevelSteps(
  root: TraceSpan | null | undefined
): Array<{ name: string; status: string }> {
  return (root?.childrenSpans ?? []).map(s => ({
    name: s.name,
    status:
      s.status === 'FAILED' ||
      (s.childrenSpans ?? []).some(c => c.status === 'FAILED')
        ? 'FAILED'
        : s.status,
  }))
}

export class InngestProbeClient
  extends InngestGraphqlClient
  implements ProbeClient
{
  constructor(opts: GqlClientOptions = {}) {
    // Invokes and trace reads are heavier than the status query.
    super({ timeoutMs: 15_000, ...opts })
  }

  async functionIds(): Promise<Map<string, string>> {
    const apps = await this.apps()
    const out = new Map<string, string>()
    for (const a of apps) for (const f of a.functions) out.set(f.slug, f.id)
    return out
  }

  async invokeFunction(
    slug: string,
    data: Record<string, unknown>
  ): Promise<boolean> {
    const res = await this.query<{ invokeFunction: boolean }>(
      GQL_INVOKE_MUTATION,
      {
        slug,
        data,
      }
    )
    return res.invokeFunction === true
  }

  async runsSince(params: {
    from: Date
    functionIDs: string[]
    first?: number
  }) {
    const nodes = await this.runs(params)
    return nodes.map(n => ({
      id: n.id,
      status: n.status,
      eventName: n.eventName,
      queuedAt: n.queuedAt,
    }))
  }

  async runWithTrace(runId: string) {
    const data = await this.query<{
      run: {
        id: string
        status: string
        endedAt: string | null
        trace: TraceSpan | null
      } | null
    }>(GQL_RUN_TRACE_QUERY, { runID: runId })
    if (!data.run) return null
    return {
      id: data.run.id,
      status: data.run.status,
      endedAt: data.run.endedAt,
      steps: topLevelSteps(data.run.trace),
    }
  }
}
