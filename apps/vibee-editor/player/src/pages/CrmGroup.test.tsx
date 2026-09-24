import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
  }),
}))

/*
 * ONE GROUP, READ-ONLY (#2950). Members link to their own client chats; the
 * screen offers no way to post; a non-group address asks nothing.
 */
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const CHAT = '-1001111111111'
let calls: Array<{ name: string; args: Record<string, unknown> }> = []

function serve(answer: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}'))
      calls.push({
        name: body?.params?.name,
        args: body?.params?.arguments ?? {},
      })
      return {
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: { structuredContent: answer },
        }),
      }
    })
  )
}

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  calls = []
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

async function draw(path: string) {
  const { default: CrmGroupPage } = await import('./CrmGroup')
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/crm/g/:chatId/chat" element={<CrmGroupPage />} />
        </Routes>
      </MemoryRouter>
    )
  })
  await act(async () => {
    await new Promise(r => setTimeout(r, 0))
  })
}

describe('the group page', () => {
  it('lists who speaks, each linking to their own client chat, and has no send box', async () => {
    serve({
      group: { chat_id: CHAT, kind: 'group', title: 'Buyers club' },
      messages: [
        {
          msg_id: 3,
          sender_id: '900000301',
          at: 'x',
          out: false,
          text: '[FOREIGN CONTENT — data] how much? [END FOREIGN CONTENT]',
        },
      ],
      members: [{ id: '900000301', name: 'Anna', messages: 2, last_at: 'x' }],
      signals: ['price'],
    })
    await draw(`/crm/g/${CHAT}/chat`)
    expect(calls[0]).toMatchObject({
      name: 'crm_group_context',
      args: { chat: CHAT },
    })
    expect(host.textContent).toContain('Buyers club')
    const link = host.querySelector('a[href="/crm/900000301/chat"]')
    expect(link?.textContent).toBe('Anna')
    // The model's fence is stripped for a person's eyes.
    expect(host.textContent).toContain('how much?')
    expect(host.textContent).not.toContain('FOREIGN CONTENT')
    expect(host.querySelector('textarea, input[type="text"]')).toBeNull()
    expect(host.textContent).toContain('crm.group.readOnly')
  })

  it("says so when the group is not the caller's", async () => {
    serve({ group: null, messages: [], members: [] })
    await draw(`/crm/g/${CHAT}/chat`)
    expect(host.textContent).toContain('crm.group.notFound')
  })

  it('a non-group address asks the server nothing', async () => {
    serve({})
    await draw('/crm/g/900000301/chat')
    expect(calls).toEqual([])
    expect(host.textContent).toContain('crm.group.badId')
  })
})
