/**
 * Minimal read-only client for the Inngest server GraphQL API (`/v0/gql`).
 *
 * Only queries are issued here — no mutations (no invoke, no cancel, no
 * rerun). Used by:
 *   - GET /api/inngest/functions/status (api_server)
 *   - MCP read-only health tools (mcp-server.ts)
 *   - log-monitor fallback when file logging is disabled on the host
 *
 * URL resolution: `INNGEST_GQL_URL`, else `${INNGEST_BASE_URL}/v0/gql`, else
 * `${INNGEST_DEV_URL}/v0/gql`, else `http://127.0.0.1:8288/v0/gql`.
 */

export type FetchLike = (
  input: string,
  init?: {
    method?: string
    headers?: Record<string, string>
    body?: string
    signal?: AbortSignal
  }
) => Promise<{
  ok: boolean
  status: number
  text(): Promise<string>
}>

export interface GqlClientOptions {
  url?: string
  fetchImpl?: FetchLike
  timeoutMs?: number
  /** Optional bearer token (not required by the dev/self-hosted server). */
  authToken?: string
}

export interface InngestAppFunctionTrigger {
  type: string // 'EVENT' | 'CRON'
  value: string
}

export interface InngestAppFunction {
  id: string // internal UUID — used for runs filter
  slug: string // `${appId}-${fnId}`
  name: string
  triggers: InngestAppFunctionTrigger[]
}

export interface InngestApp {
  id: string
  name: string
  url: string | null
  connected: boolean
  sdkVersion: string | null
  functions: InngestAppFunction[]
}

export interface InngestRunNode {
  id: string
  status: string // QUEUED | RUNNING | COMPLETED | FAILED | CANCELLED
  queuedAt: string
  endedAt: string | null
  eventName: string | null
  function: { slug: string } | null
}

export interface InngestRunDetail {
  id: string
  status: string
  output: unknown
}

export class InngestGraphqlError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly httpStatus?: number
  ) {
    super(message)
    this.name = 'InngestGraphqlError'
  }
}

function trimSlash(s: string): string {
  return s.replace(/\/+$/, '')
}

export function resolveInngestGqlUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.INNGEST_GQL_URL && env.INNGEST_GQL_URL.trim() !== '') {
    return env.INNGEST_GQL_URL.trim()
  }
  const base =
    (env.INNGEST_BASE_URL && env.INNGEST_BASE_URL.trim()) ||
    (env.INNGEST_DEV_URL && env.INNGEST_DEV_URL.trim()) ||
    'http://127.0.0.1:8288'
  return `${trimSlash(base)}/v0/gql`
}

/** Exact query shapes (kept verbatim so they can be grepped and audited). */
export const GQL_APPS_QUERY = `query FunctionsStatusApps {
  apps { id name url connected sdkVersion functions { id slug name triggers { type value } } }
}`

export const GQL_RUNS_QUERY = `query FunctionsStatusRuns($first: Int!, $from: Time!, $functionIDs: [UUID!]) {
  runs(first: $first, orderBy: [{ field: QUEUED_AT, direction: DESC }], filter: { from: $from, functionIDs: $functionIDs }) {
    edges { node { id status queuedAt endedAt eventName function { slug } } }
  }
}`

export const GQL_RUN_QUERY = `query FunctionsStatusRun($runID: String!) {
  run(runID: $runID) { id status output }
}`

export class InngestGraphqlClient {
  readonly url: string
  private readonly fetchImpl: FetchLike
  private readonly timeoutMs: number
  private readonly authToken?: string

  constructor(opts: GqlClientOptions = {}) {
    this.url = opts.url ?? resolveInngestGqlUrl()
    this.fetchImpl =
      opts.fetchImpl ?? ((globalThis as any).fetch as FetchLike | undefined)!
    this.timeoutMs = opts.timeoutMs ?? 5000
    this.authToken = opts.authToken
    if (typeof this.fetchImpl !== 'function') {
      throw new Error('InngestGraphqlClient: no fetch implementation available')
    }
  }

  async query<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const controller =
      typeof AbortController !== 'undefined' ? new AbortController() : null
    const timer = controller
      ? setTimeout(() => controller.abort(), this.timeoutMs)
      : null
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (this.authToken) headers.Authorization = `Bearer ${this.authToken}`
      const res = await this.fetchImpl(this.url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, variables }),
        signal: controller?.signal,
      })
      const text = await res.text()
      if (!res.ok) {
        throw new InngestGraphqlError(
          `Inngest GraphQL HTTP ${res.status}: ${text.slice(0, 200)}`,
          this.url,
          res.status
        )
      }
      let json: { data?: T; errors?: Array<{ message: string }> }
      try {
        json = JSON.parse(text)
      } catch {
        throw new InngestGraphqlError(
          `Inngest GraphQL returned non-JSON: ${text.slice(0, 200)}`,
          this.url,
          res.status
        )
      }
      if (json.errors && json.errors.length > 0) {
        throw new InngestGraphqlError(
          `Inngest GraphQL errors: ${json.errors.map(e => e.message).join('; ')}`,
          this.url,
          res.status
        )
      }
      if (!json.data) {
        throw new InngestGraphqlError('Inngest GraphQL returned no data', this.url)
      }
      return json.data
    } catch (err) {
      if (err instanceof InngestGraphqlError) throw err
      const msg = err instanceof Error ? err.message : String(err)
      throw new InngestGraphqlError(`Inngest GraphQL unreachable: ${msg}`, this.url)
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  async apps(): Promise<InngestApp[]> {
    const data = await this.query<{ apps: InngestApp[] }>(GQL_APPS_QUERY, {})
    return Array.isArray(data.apps) ? data.apps : []
  }

  /**
   * Runs queued since `from` for the given internal function UUIDs, newest
   * first. `first` is a hard cap (single page — no pagination on purpose).
   */
  async runs(params: {
    from: Date
    functionIDs?: string[]
    first?: number
  }): Promise<InngestRunNode[]> {
    const variables: Record<string, unknown> = {
      first: params.first ?? 500,
      from: params.from.toISOString(),
    }
    if (params.functionIDs && params.functionIDs.length > 0) {
      variables.functionIDs = params.functionIDs
    }
    const data = await this.query<{
      runs: { edges: Array<{ node: InngestRunNode }> }
    }>(GQL_RUNS_QUERY, variables)
    return (data.runs?.edges ?? []).map(e => e.node)
  }

  async run(runID: string): Promise<InngestRunDetail | null> {
    const data = await this.query<{ run: InngestRunDetail | null }>(
      GQL_RUN_QUERY,
      { runID }
    )
    return data.run ?? null
  }
}
