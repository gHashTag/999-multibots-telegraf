import { useEffect, useState } from 'react'
import { API_BASE } from '@/config'
import { authHeaders } from '@/lib/apiFetch'

/** The caller's clients this agent helped with (tool agent_clients). */
export interface ClientWork {
  client: string
  turns: number
  lastAt: string
}

/**
 * One question, two homes: the agent's dashboard lists its clients, and so
 * does the agent panel beside its chat (owner, 2026-09-29: "each agent has
 * its own dashboard for working with clients"). The tool call lives here so
 * both read the same answer -- a copied fetch would drift, and the panel
 * would stop being the dashboard's truth. `open` false skips the call (a
 * person who may not open the thread reads nothing).
 */
export function useAgentClients(
  agentId: string,
  open: boolean
): ClientWork[] | null {
  const [rows, setRows] = useState<ClientWork[] | null>(null)
  useEffect(() => {
    if (!open) return
    let live = true
    fetch(`${API_BASE}/mcp`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'agent_clients', arguments: { agent: agentId } },
      }),
    })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const c = d?.result?.structuredContent?.clients
        if (live && Array.isArray(c)) setRows(c as ClientWork[])
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [agentId, open])
  return open ? rows : null
}
