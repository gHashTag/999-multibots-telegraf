/**
 * Read-only status of the Inngest functions of this app, built from
 *   1. the vendored manifest (SSOT: src/inngest_app/functions.manifest.json)
 *   2. the Inngest server GraphQL API (`apps`, `runs`)
 *
 * Consumers: GET /api/inngest/functions/status, MCP read-only tools, and the
 * log-monitor fallback when file logging is disabled on the host.
 *
 * Nothing here mutates anything: no invoke, no cancel, no event send.
 */
import {
  InngestGraphqlClient,
  InngestGraphqlError,
  type GqlClientOptions,
  type InngestApp,
  type InngestRunNode,
} from './inngestGraphql'
import {
  getManifestFunctions,
  manifestAppId,
  probeExpectOf,
  type ManifestFunction,
  type ProbeExpect,
} from '../manifest'

export { probeExpectOf }
export type { ProbeExpect }

export type RunStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'

export interface RunCounters {
  completed: number
  failed: number
  running: number
  cancelled: number
  /**
   * Runs started by `invokeFunction` (dashboard, MCP, the /inngest_probe
   * suite): their event name starts with `inngest/function.invoked`. They are
   * counted here and in `total`, never in completed/failed/running — a probe
   * that stops at its guard is not a production failure.
   */
  invoked: number
  total: number
}

export const INVOKED_EVENT_PREFIX = 'inngest/function.invoked'

/**
 * Status-level judgement of a probe run against the manifest expectation.
 * `null` = no expectation (skip) or the run has not ended.
 */
export function probeAsExpected(
  expect: ProbeExpect,
  status: string
): boolean | null {
  if (expect === 'skip') return null
  if (status !== 'COMPLETED' && status !== 'FAILED' && status !== 'CANCELLED')
    return null
  if (expect === 'FAILED-at-guard') return status === 'FAILED'
  return status === 'COMPLETED'
}

export function isInvokedRun(run: { eventName?: string | null }): boolean {
  return (run.eventName ?? '').startsWith(INVOKED_EVENT_PREFIX)
}

export interface FunctionStatus {
  id: string
  slug: string | null
  name: string
  domain: string
  triggers: Array<{ type: 'event' | 'cron'; value: string }>
  control: string
  /** false when the manifest knows the function but the connected app does not serve it yet. */
  deployed: boolean
  runs24h: RunCounters
  runs7d: RunCounters
  /**
   * Newest run that was NOT invoked by hand (event or cron traffic). This is
   * the health dot. `null` when the function had no organic run in the
   * window; consumers show that as "no runs", never as red.
   * (specs/automation/inngest-functions-status.t27, VERSION 2)
   */
  lastRun: {
    id: string
    status: string
    queuedAt: string
    endedAt: string | null
  } | null
  /**
   * Newest invoked run (probe suite, dashboard "Invoke", MCP) with the
   * manifest expectation beside it. `asExpected` is judged from the run
   * STATUS only ("FAILED-at-guard" -> FAILED, "COMPLETED" -> COMPLETED);
   * whether it failed AT THE GUARD is the probe suite's verdict, not ours.
   * `asExpected` is null when the manifest expects `skip` or the run is
   * not terminal yet.
   */
  lastProbe: {
    id: string
    status: string
    queuedAt: string
    endedAt: string | null
    expect: ProbeExpect
    asExpected: boolean | null
  } | null
  /** `probe_expect` from the manifest; what /inngest_probe expects of a safe probe. */
  probeExpect: ProbeExpect
  lastError: {
    runId: string
    endedAt: string | null
    eventName: string | null
  } | null
}

export interface FunctionsStatusPayload {
  generatedAt: string
  source: { gqlUrl: string; cached: boolean }
  app: {
    name: string
    sdk: string | null
    url: string | null
    connected: boolean
  }
  functions: FunctionStatus[]
  /** Functions served by the app but unknown to the manifest (drift signal). */
  unknownInApp: string[]
}

export interface FunctionsStatusError {
  generatedAt: string
  error: string
  gqlUrl: string
}

const DAY_MS = 24 * 60 * 60 * 1000

export function emptyCounters(): RunCounters {
  return {
    completed: 0,
    failed: 0,
    running: 0,
    cancelled: 0,
    invoked: 0,
    total: 0,
  }
}

function bump(c: RunCounters, status: string, invoked = false): void {
  c.total += 1
  if (invoked) {
    c.invoked += 1
    return
  }
  switch (status) {
    case 'COMPLETED':
      c.completed += 1
      break
    case 'FAILED':
      c.failed += 1
      break
    case 'QUEUED':
    case 'RUNNING':
      c.running += 1
      break
    case 'CANCELLED':
      c.cancelled += 1
      break
    default:
      break
  }
}

/** `${appId}-${fnId}` is how Inngest slugs a function served by an app. */
export function slugMatchesFunction(
  slug: string,
  appName: string,
  fnId: string
): boolean {
  return (
    slug === `${appName}-${fnId}` || slug === fnId || slug.endsWith(`-${fnId}`)
  )
}

export interface RunsSummary {
  perFunction: Map<
    string,
    {
      runs24h: RunCounters
      runs7d: RunCounters
      lastRun: FunctionStatus['lastRun']
      lastInvoked: FunctionStatus['lastRun']
      lastError: FunctionStatus['lastError']
    }
  >
  totals24h: RunCounters
  totals7d: RunCounters
}

/**
 * Pure aggregation: runs are keyed by their function slug. `now` is injectable
 * for tests.
 */
export function summarizeRuns(
  runs: InngestRunNode[],
  now: Date = new Date()
): RunsSummary {
  const dayAgo = now.getTime() - DAY_MS
  const perFunction: RunsSummary['perFunction'] = new Map()
  const totals24h = emptyCounters()
  const totals7d = emptyCounters()

  for (const run of runs) {
    const slug = run.function?.slug ?? '(unknown)'
    let entry = perFunction.get(slug)
    if (!entry) {
      entry = {
        runs24h: emptyCounters(),
        runs7d: emptyCounters(),
        lastRun: null,
        lastInvoked: null,
        lastError: null,
      }
      perFunction.set(slug, entry)
    }
    const queuedAt = Date.parse(run.queuedAt)
    const invoked = isInvokedRun(run)
    bump(entry.runs7d, run.status, invoked)
    bump(totals7d, run.status, invoked)
    if (Number.isFinite(queuedAt) && queuedAt >= dayAgo) {
      bump(entry.runs24h, run.status, invoked)
      bump(totals24h, run.status, invoked)
    }
    // runs come newest-first; keep the first seen of each kind. An invoked
    // run (probe, dashboard Invoke) is never the function's lastRun: seventeen
    // guarded functions FAIL on every safe probe by design, and after each
    // /inngest_probe the FUNCTIONS tab showed twenty red "last run FAILED"
    // dots for functions that had done nothing wrong (read 2026-09-12).
    const ref = {
      id: run.id,
      status: run.status,
      queuedAt: run.queuedAt,
      endedAt: run.endedAt ?? null,
    }
    if (invoked) {
      if (!entry.lastInvoked) entry.lastInvoked = ref
    } else if (!entry.lastRun) {
      entry.lastRun = ref
    }
    // an invoked (probe/manual) run that failed is not the function's last
    // production error
    if (!entry.lastError && run.status === 'FAILED' && !invoked) {
      entry.lastError = {
        runId: run.id,
        endedAt: run.endedAt ?? null,
        eventName: run.eventName ?? null,
      }
    }
  }
  return { perFunction, totals24h, totals7d }
}

function manifestTriggers(fn: ManifestFunction): FunctionStatus['triggers'] {
  const out: FunctionStatus['triggers'] = []
  if (fn.trigger === 'cron' && fn.cron)
    out.push({ type: 'cron', value: fn.cron })
  if (fn.event) out.push({ type: 'event', value: fn.event })
  for (const legacy of fn.legacy_events ?? []) {
    out.push({ type: 'event', value: legacy })
  }
  return out
}

/** Pick the app that serves this codebase (by manifest app id, else the first). */
export function selectApp(
  apps: InngestApp[],
  appId: string
): InngestApp | null {
  if (apps.length === 0) return null
  return (
    apps.find(a => a.name === appId) ??
    apps.find(a => a.functions?.some(f => f.slug.startsWith(`${appId}-`))) ??
    apps[0]
  )
}

/**
 * Pure merge: manifest × app × run summary → payload (no I/O).
 */
export function buildFunctionsStatus(params: {
  app: InngestApp | null
  runs: InngestRunNode[]
  manifest?: ManifestFunction[]
  appId?: string
  gqlUrl: string
  now?: Date
  cached?: boolean
}): FunctionsStatusPayload {
  const now = params.now ?? new Date()
  const appId = params.appId ?? manifestAppId()
  const manifest = (params.manifest ?? getManifestFunctions()).filter(
    f => f.control === 'spec+code'
  )
  const summary = summarizeRuns(params.runs, now)
  const appName = params.app?.name ?? appId
  const appFunctions = params.app?.functions ?? []

  const functions: FunctionStatus[] = manifest.map(fn => {
    const served = appFunctions.find(af =>
      slugMatchesFunction(af.slug, appName, fn.id)
    )
    const slug = served?.slug ?? null
    const runStats = slug ? summary.perFunction.get(slug) : undefined
    const probeExpect = probeExpectOf(fn as { probe_expect?: string })
    const lastInvoked = runStats?.lastInvoked ?? null
    return {
      id: fn.id,
      slug,
      name: served?.name ?? fn.id,
      domain: fn.domain,
      triggers: manifestTriggers(fn),
      control: fn.control,
      deployed: !!served,
      runs24h: runStats?.runs24h ?? emptyCounters(),
      runs7d: runStats?.runs7d ?? emptyCounters(),
      lastRun: runStats?.lastRun ?? null,
      lastProbe: lastInvoked
        ? {
            ...lastInvoked,
            expect: probeExpect,
            asExpected: probeAsExpected(probeExpect, lastInvoked.status),
          }
        : null,
      probeExpect,
      lastError: runStats?.lastError ?? null,
    }
  })

  const knownSlugs = new Set(functions.map(f => f.slug).filter(Boolean))
  const unknownInApp = appFunctions
    .map(f => f.slug)
    .filter(slug => !knownSlugs.has(slug))
    // `<id>-failure` twins are created by onFailure handlers — not drift.
    .filter(slug => !slug.endsWith('-failure'))

  return {
    generatedAt: now.toISOString(),
    source: { gqlUrl: params.gqlUrl, cached: !!params.cached },
    app: {
      name: appName,
      sdk: params.app?.sdkVersion ?? null,
      url: params.app?.url ?? null,
      connected: params.app?.connected ?? false,
    },
    functions,
    unknownInApp,
  }
}

// ---------------------------------------------------------------------------
// I/O layer with a 30 s in-memory cache
// ---------------------------------------------------------------------------

export const STATUS_CACHE_TTL_MS = 30_000

interface CacheEntry {
  at: number
  payload: FunctionsStatusPayload
}

let cache: CacheEntry | null = null

export function clearFunctionsStatusCache(): void {
  cache = null
}

export interface FetchStatusOptions extends GqlClientOptions {
  now?: Date
  /** total cap on runs fetched across pages (default RUNS_MAX_DEFAULT). */
  first?: number
  bypassCache?: boolean
  manifest?: ManifestFunction[]
  appId?: string
}

/**
 * Fetch apps + 7d runs and build the payload. Throws `InngestGraphqlError`
 * when the Inngest server is unreachable — callers map that to 503.
 */
export async function fetchFunctionsStatus(
  opts: FetchStatusOptions = {}
): Promise<FunctionsStatusPayload> {
  const now = opts.now ?? new Date()
  if (
    !opts.bypassCache &&
    cache &&
    now.getTime() - cache.at < STATUS_CACHE_TTL_MS
  ) {
    return {
      ...cache.payload,
      source: { ...cache.payload.source, cached: true },
    }
  }

  const client = new InngestGraphqlClient(opts)
  const appId = opts.appId ?? manifestAppId()
  const apps = await client.apps()
  const app = selectApp(apps, appId)
  const functionIDs = (app?.functions ?? []).map(f => f.id).filter(Boolean)
  const runs =
    functionIDs.length > 0
      ? await client.runs({
          from: new Date(now.getTime() - 7 * DAY_MS),
          functionIDs,
          first: opts.first,
        })
      : []

  const payload = buildFunctionsStatus({
    app,
    runs,
    manifest: opts.manifest,
    appId,
    gqlUrl: client.url,
    now,
  })
  cache = { at: now.getTime(), payload }
  return payload
}

/** Never throws: returns an error payload instead (for endpoints/tools). */
export async function fetchFunctionsStatusSafe(
  opts: FetchStatusOptions = {}
): Promise<
  | { ok: true; payload: FunctionsStatusPayload }
  | { ok: false; error: FunctionsStatusError }
> {
  try {
    const payload = await fetchFunctionsStatus(opts)
    return { ok: true, payload }
  } catch (err) {
    const gqlUrl =
      err instanceof InngestGraphqlError
        ? err.url
        : new InngestGraphqlClient(opts).url
    return {
      ok: false,
      error: {
        generatedAt: (opts.now ?? new Date()).toISOString(),
        error: err instanceof Error ? err.message : String(err),
        gqlUrl,
      },
    }
  }
}

/**
 * Compact text summary for the last 24h — used by log-monitor when file
 * logging is disabled and by the MCP `inngest_health` tool.
 */
export function renderRunsSummaryText(payload: FunctionsStatusPayload): string {
  const t = payload.functions.reduce(
    (acc, f) => {
      acc.completed += f.runs24h.completed
      acc.failed += f.runs24h.failed
      acc.running += f.runs24h.running
      return acc
    },
    { completed: 0, failed: 0, running: 0 }
  )
  const failing = payload.functions
    .filter(f => f.runs24h.failed > 0)
    .sort((a, b) => b.runs24h.failed - a.runs24h.failed)
    .map(f => `${f.id}: ${f.runs24h.failed} failed / ${f.runs24h.total} runs`)
  const notDeployed = payload.functions.filter(f => !f.deployed).map(f => f.id)
  const lines = [
    `Inngest app ${payload.app.name} (sdk ${payload.app.sdk ?? '?'}, connected=${payload.app.connected})`,
    `Runs last 24h: ${t.completed} completed, ${t.failed} failed, ${t.running} running`,
  ]
  if (failing.length) lines.push(`Failing functions: ${failing.join('; ')}`)
  if (notDeployed.length)
    lines.push(
      `In manifest but not served by the app: ${notDeployed.join(', ')}`
    )
  if (payload.unknownInApp.length)
    lines.push(`Served but not in manifest: ${payload.unknownInApp.join(', ')}`)
  return lines.join('\n')
}
