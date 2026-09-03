import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authHeaders: vi.fn(
    () => new Headers({ 'X-Telegram-Init-Data': 'signed-init-data-sentinel' })
  ),
}))

vi.mock('@/config', () => ({
  RENDER_URL:
    'https://user:password@render.example.test/base/?debug=1#fragment',
}))
vi.mock('@/lib/apiFetch', () => ({ authHeaders: mocks.authHeaders }))

import {
  AGENT_MCP_URL,
  callAgentTool,
  listAgentTools,
  resolveAgentMcpUrl,
} from '../agentMcp'

describe('SAFE BETA MCP browser client', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('uses the verified session headers without a browser-side MCP key', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: { tools: [{ name: 'whoami', inputSchema: {} }] },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    const tools = await listAgentTools()

    expect(tools.map(tool => tool.name)).toEqual(['whoami'])
    expect(AGENT_MCP_URL).toBe('https://render.example.test/base/mcp')
    const [, request] = fetchMock.mock.calls[0]
    const headers = request?.headers as Headers
    expect(headers.get('X-Telegram-Init-Data')).toBe(
      'signed-init-data-sentinel'
    )
    expect(headers.has('X-Agent-Key')).toBe(false)
    expect(String(request?.body)).not.toContain('signed-init-data-sentinel')
  })

  it('allows only the three SAFE BETA calls from UI code', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          result: { structuredContent: { status: 'draft' } },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    await expect(
      callAgentTool('content_plan_prepare', { topic: 'Мой контент' })
    ).resolves.toEqual({ status: 'draft' })
    await expect(
      callAgentTool('feed_publish' as never, { caption: 'unsafe' })
    ).rejects.toThrow('SAFE BETA')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not echo a server credential-shaped error into UI exceptions', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          error: { message: 'private-key-sentinel' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    await expect(callAgentTool('whoami')).rejects.toThrow('MCP request failed')
    await expect(callAgentTool('whoami')).rejects.not.toThrow(
      'private-key-sentinel'
    )
  })

  it('sanitizes credentials, query and fragment from the browser MCP endpoint', () => {
    expect(
      resolveAgentMcpUrl(
        'https://name:secret@example.test/root/?token=hidden#private'
      )
    ).toBe('https://example.test/root/mcp')
  })
})
