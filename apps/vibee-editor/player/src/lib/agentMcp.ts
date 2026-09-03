import { RENDER_URL } from '@/config'
import { authHeaders } from '@/lib/apiFetch'
import { SAFE_BETA_TOOL_NAMES, type SafeBetaToolName } from './agentControls'

const safeBetaToolNames = new Set<string>(SAFE_BETA_TOOL_NAMES)

export interface McpToolDescription {
  name: string
  description?: string
  inputSchema: Record<string, unknown>
  annotations?: {
    readOnlyHint?: boolean
    destructiveHint?: boolean
  }
  _meta?: {
    scope?: string
    effect?: string
    requiresOwnerApproval?: boolean
  }
}

export function resolveAgentMcpUrl(
  renderUrl: string,
  browserOrigin?: string
): string {
  if (!/^https?:\/\//i.test(renderUrl) && !browserOrigin) {
    return `${renderUrl.replace(/[?#].*$/, '').replace(/\/+$/, '')}/mcp`
  }

  const url = new URL(renderUrl, browserOrigin)
  url.username = ''
  url.password = ''
  url.search = ''
  url.hash = ''
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/mcp`
  return url.toString()
}

export const AGENT_MCP_URL = resolveAgentMcpUrl(
  RENDER_URL,
  typeof window === 'undefined' ? undefined : window.location.origin
)

let requestId = 0

async function rpc<T>(
  method: 'tools/list' | 'tools/call',
  params?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(AGENT_MCP_URL, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: ++requestId,
      method,
      params,
    }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || payload?.error || !payload?.result) {
    throw new Error(`MCP request failed (${response.status})`)
  }
  return payload.result as T
}

export async function listAgentTools(): Promise<McpToolDescription[]> {
  const result = await rpc<{ tools?: McpToolDescription[] }>('tools/list')
  return Array.isArray(result.tools) ? result.tools : []
}

export async function callAgentTool<T>(
  name: SafeBetaToolName,
  args: Record<string, unknown> = {}
): Promise<T> {
  if (!safeBetaToolNames.has(name)) {
    throw new Error('Tool is outside the SAFE BETA policy')
  }
  const result = await rpc<{ structuredContent?: T }>('tools/call', {
    name,
    arguments: args,
  })
  return (result.structuredContent ?? result) as T
}
