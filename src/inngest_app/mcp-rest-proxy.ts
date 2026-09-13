#!/usr/bin/env node
/**
 * Inngest REST API v2 → MCP proxy (stdio).
 *
 * WHY THIS EXISTS. The self-hosted Inngest server (`inngest start`) exposes
 * `/mcp`, and its data tools (get_apps, list_runs, get_run_trace, …) are
 * generated from REST API v2. But the MCP handler builds the internal REST
 * request WITHOUT forwarding the caller's Authorization header
 * (pkg/api/v2/apiv2mcp/tools.go `Request`, pkg/devserver/mcp.go `executeV2`).
 * When the server runs with INNGEST_SIGNING_KEY, REST v2 is guarded by
 * SigningKeyMiddleware and every data tool answers
 * "REST API v2 returned HTTP 401: Authentication failed" — no client-side
 * header can fix it. Measured 2026-09-13 against inngest/inngest:latest.
 *
 * This proxy speaks MCP over stdio, discovers the same tool catalog from
 * `${INNGEST_BASE_URL}/api/v2/operations` (public, no auth), and executes
 * each call against REST v2 with `Authorization: Bearer ${INNGEST_SIGNING_KEY}`
 * (the server accepts the plain key or its sha256 — pkg/authn).
 *
 * Fail-closed: without INNGEST_SIGNING_KEY the process exits with a clear
 * message instead of serving tools that can only 401.
 *
 * Usage (see .mcp.json → `inngest-prod`):
 *   INNGEST_SIGNING_KEY=… INNGEST_BASE_URL=https://… npx tsx src/inngest_app/mcp-rest-proxy.ts
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

export type JsonSchema = {
  type: string
  properties?: Record<string, { type?: string; description?: string }>
  required?: string[]
  additionalProperties?: boolean
}

export type Operation = {
  id: string
  summary?: string
  description?: string
  http?: { method: string; path: string }
  mcp?: {
    name: string
    title?: string
    description?: string
    inputSchema?: JsonSchema
    annotations?: Record<string, boolean>
  }
}

export type ProxyTool = {
  name: string
  title?: string
  description: string
  inputSchema: JsonSchema
  annotations?: Record<string, boolean>
  method: string
  path: string
}

export type Fetcher = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
) => Promise<{ status: number; text(): Promise<string> }>

const DEFAULT_BASE_URL = 'https://inngestinngest-production-c468.up.railway.app'

/** `{run_id}` → `runId`, matching the tool's camelCase input schema. */
export function pathParamToArg(param: string): string {
  return param.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase())
}

/** Operations catalog → tools. Skips entries without an http or mcp block. */
export function toolsFromOperations(operations: Operation[]): ProxyTool[] {
  const out: ProxyTool[] = []
  for (const op of operations) {
    if (!op.http || !op.mcp?.name) continue
    out.push({
      name: op.mcp.name,
      title: op.mcp.title ?? op.summary,
      description:
        op.mcp.description ?? op.description ?? op.summary ?? op.mcp.name,
      inputSchema: op.mcp.inputSchema ?? {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: op.mcp.annotations,
      method: op.http.method.toUpperCase(),
      path: op.http.path,
    })
  }
  return out
}

export type BuiltRequest = {
  url: string
  method: string
  body?: string
}

/**
 * Mirrors upstream `apiv2mcp.Request`: path params from `{snake_case}` →
 * camelCase args (required); for GET the rest become the query string; for
 * anything else the rest become the JSON body.
 */
export function buildRequest(
  baseUrl: string,
  tool: ProxyTool,
  args: Record<string, unknown>
): BuiltRequest {
  const used = new Set<string>()
  const path = tool.path.replace(/\{([a-z0-9_]+)\}/gi, (_m, p: string) => {
    const key = pathParamToArg(p)
    const v = args[key]
    if (v === undefined || v === null || String(v).trim() === '') {
      throw new Error(`${key} is required`)
    }
    used.add(key)
    return encodeURIComponent(String(v))
  })
  const rest: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(args)) {
    if (used.has(k) || v === undefined || v === null) continue
    rest[k] = v
  }
  const base = baseUrl.replace(/\/+$/, '')
  let url = `${base}/api/v2${path}`
  let body: string | undefined
  if (tool.method === 'GET') {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(rest)) {
      if (Array.isArray(v)) v.forEach(x => q.append(k, String(x)))
      else q.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
    }
    const qs = q.toString()
    if (qs) url += `?${qs}`
  } else if (Object.keys(rest).length > 0) {
    body = JSON.stringify(rest)
  }
  return { url, method: tool.method, body }
}

export async function fetchOperations(
  baseUrl: string,
  fetcher: Fetcher
): Promise<Operation[]> {
  const base = baseUrl.replace(/\/+$/, '')
  const res = await fetcher(`${base}/api/v2/operations`, {
    headers: { accept: 'application/json' },
  })
  const text = await res.text()
  if (res.status >= 400) {
    throw new Error(
      `operations catalog: HTTP ${res.status}: ${text.slice(0, 200)}`
    )
  }
  const parsed = JSON.parse(text) as {
    data?: { operations?: Operation[] }
    operations?: Operation[]
  }
  return parsed.data?.operations ?? parsed.operations ?? []
}

export async function executeTool(
  baseUrl: string,
  signingKey: string,
  tool: ProxyTool,
  args: Record<string, unknown>,
  fetcher: Fetcher
): Promise<{ status: number; text: string }> {
  const req = buildRequest(baseUrl, tool, args)
  const headers: Record<string, string> = {
    accept: 'application/json',
    authorization: `Bearer ${signingKey}`,
  }
  if (req.body !== undefined) headers['content-type'] = 'application/json'
  const res = await fetcher(req.url, {
    method: req.method,
    headers,
    body: req.body,
  })
  return { status: res.status, text: await res.text() }
}

export function readConfig(env: NodeJS.ProcessEnv): {
  baseUrl: string
  signingKey: string
} {
  const signingKey = (env.INNGEST_SIGNING_KEY ?? '').trim()
  if (!signingKey) {
    throw new Error(
      'INNGEST_SIGNING_KEY is not set. The self-hosted Inngest REST API v2 ' +
        'is guarded by the signing key; export it from the Inngest service ' +
        'variables on Railway before starting the proxy.'
    )
  }
  const baseUrl = (env.INNGEST_BASE_URL ?? DEFAULT_BASE_URL).trim()
  return { baseUrl, signingKey }
}

async function main(): Promise<void> {
  const { baseUrl, signingKey } = readConfig(process.env)
  const fetcher: Fetcher = (url, init) => fetch(url, init)
  const tools = toolsFromOperations(await fetchOperations(baseUrl, fetcher))
  const byName = new Map(tools.map(t => [t.name, t]))

  const server = new Server(
    { name: 'inngest-rest-proxy', version: '1.0.0' },
    { capabilities: { tools: {} } }
  )
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(t => ({
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema: t.inputSchema,
      annotations: t.annotations,
    })),
  }))
  server.setRequestHandler(CallToolRequestSchema, async request => {
    const tool = byName.get(request.params.name)
    if (!tool) {
      return {
        content: [
          { type: 'text', text: `Unknown tool: ${request.params.name}` },
        ],
        isError: true,
      }
    }
    try {
      const args = (request.params.arguments ?? {}) as Record<string, unknown>
      const { status, text } = await executeTool(
        baseUrl,
        signingKey,
        tool,
        args,
        fetcher
      )
      if (status >= 400) {
        return {
          content: [
            {
              type: 'text',
              text: `REST API v2 returned HTTP ${status}: ${text}`,
            },
          ],
          isError: true,
        }
      }
      return { content: [{ type: 'text', text }] }
    } catch (e) {
      return {
        content: [
          { type: 'text', text: e instanceof Error ? e.message : String(e) },
        ],
        isError: true,
      }
    }
  })

  await server.connect(new StdioServerTransport())
  console.error(
    `[inngest-rest-proxy] ${tools.length} tools from ${baseUrl}/api/v2/operations`
  )
}

const isDirectRun =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  /mcp-rest-proxy\.(ts|js)$/.test(process.argv[1] ?? '')

if (isDirectRun) {
  main().catch(e => {
    console.error(`[inngest-rest-proxy] ${e instanceof Error ? e.message : e}`)
    process.exit(1)
  })
}
