import { useEffect, useState } from 'react'
import { API_BASE } from '@/config'
import { authHeaders } from '@/lib/apiFetch'

/**
 * THE CATALOGUE AGENTS' FACES (render agent-avatars.ts): the owner's face,
 * img2img in each agent's style. Public reading; {} until answered or when
 * none are made, so every place falls back to the agent's icon.
 */
let cache: Record<string, string> | null = null
let inflight: Promise<Record<string, string>> | null = null

export function forgetAgentAvatarsForTests(): void {
  cache = null
  inflight = null
}

function load(): Promise<Record<string, string>> {
  if (cache) return Promise.resolve(cache)
  inflight ??= fetch(`${API_BASE}/api/agents/avatars`)
    .then(r => (r.ok ? r.json() : null))
    .then(b => {
      const a = b?.avatars
      cache = a && typeof a === 'object' ? (a as Record<string, string>) : {}
      return cache
    })
    .catch(() => ({}))
    .finally(() => {
      inflight = null
    })
  return inflight
}

export function useAgentAvatars(version = 0): Record<string, string> {
  const [avatars, setAvatars] = useState<Record<string, string>>(cache ?? {})
  useEffect(() => {
    let live = true
    if (version > 0) cache = null
    void load().then(a => {
      if (live) setAvatars(a)
    })
    return () => {
      live = false
    }
  }, [version])
  return avatars
}

/**
 * Ask the agent to draw them (tool agent_avatars_make, keeper only, priced
 * per picture). Returns the tool's answer, or its refusal as text.
 */
export async function makeAgentAvatars(
  agent: string | null,
  send: typeof fetch = fetch
): Promise<{ ok: boolean; text: string }> {
  try {
    const r = await send(`${API_BASE}/mcp`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'agent_avatars_make',
          arguments: agent ? { agent, redo: true } : {},
        },
      }),
    })
    if (!r.ok) return { ok: false, text: `HTTP ${r.status}` }
    const d = await r.json()
    const out = d?.result?.structuredContent
    if (!out)
      return { ok: false, text: String(d?.error?.message ?? 'no answer') }
    const made = Array.isArray(out.made) ? out.made : []
    cache = null
    return {
      ok: out.done === true,
      text: made.length
        ? made
            .map(
              (m: { agent: string; state: string }) => `${m.agent}: ${m.state}`
            )
            .join(' · ')
        : String(out.reason ?? out.note ?? ''),
    }
  } catch (e) {
    return { ok: false, text: e instanceof Error ? e.message : 'network' }
  }
}
