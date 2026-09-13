import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Provider } from 'jotai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Spec: t27 specs/automation/crm-client-workspace.t27
 *
 * A CLIENT THREAD NEVER MIXES WITH THE OWNER'S OWN THREAD.
 *
 * The complaint that started this: every client's conversation landed in one
 * place. So the properties tested here are the seams where mixing could
 * happen -- the history read, the chat request, the clear, and the browser
 * storage -- and, on the other side, that `/chat` sends exactly what it sent
 * before this feature existed.
 */

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
  }),
}))
// The header drags half the app behind it and has nothing to say here.
vi.mock('@/components/Header', () => ({ Header: () => null }))
vi.mock('@/components/Chat/ChatAssets', () => ({
  ChatAssets: ({ text }: { text: string }) => <span>{text}</span>,
}))
vi.mock('@/lib/apiFetch', () => ({ authHeaders: () => new Headers() }))
vi.mock('@/config', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@/config')),
  API_BASE: 'https://api.example.test',
}))
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

import { editorStore } from '@/atoms/Provider'
import {
  agentMessagesAtom,
  agentMessagesAtomFor,
  clientThreadStorageKey,
} from '@/atoms/agentChat'
import { STORAGE_KEYS } from '@vibee/atoms'

const CLIENT = '435572800'

interface Seen {
  method: string
  url: string
  body: unknown
}
let seen: Seen[] = []

/** One NDJSON chunk the way the server streams it. */
function stream(lines: string[]) {
  const bytes = new TextEncoder().encode(lines.map(s => `${s}\n`).join(''))
  let given = false
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () =>
          given
            ? { done: true, value: undefined }
            : ((given = true), { done: false, value: bytes }),
      }),
    },
  }
}

function serve(history: Array<{ role: string; content: string }> = []) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      seen.push({ method, url: String(url), body })
      if (url.includes('/api/agent/history')) {
        if (method === 'DELETE') return { ok: true, json: async () => ({ ok: true }) }
        return { ok: true, json: async () => ({ messages: history }) }
      }
      if (url.includes('/api/agent/chat')) {
        return stream(['{"тип":"текст","текст":"ok"}']) // cyrillic-ok: server keys
      }
      if (url.includes('/mcp') || url.includes('/api/tokens')) {
        return { ok: true, json: async () => ({}) }
      }
      return { ok: false, status: 404, json: async () => ({}) }
    })
  )
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  seen = []
  localStorage.clear()
  editorStore.set(agentMessagesAtom, [])
  editorStore.set(agentMessagesAtomFor(CLIENT), [])
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
  const { default: ChatPage } = await import('./Chat')
  await act(async () => {
    root.render(
      <Provider store={editorStore}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/crm/:clientId/chat" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>
      </Provider>
    )
  })
  await act(async () => {
    await new Promise(r => setTimeout(r, 0))
  })
}

const settle = () =>
  act(async () => {
    await new Promise(r => setTimeout(r, 0))
  })

function type(text: string) {
  const input = host.querySelector<HTMLInputElement>('input.chat-input')!
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value'
  )!.set!
  setter.call(input, text)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('the thread about a client', () => {
  it('reads history with ?client=, sends body.client, clears with ?client=', async () => {
    serve()
    await draw(`/crm/${CLIENT}/chat`)

    const historyGet = seen.find(
      s => s.method === 'GET' && s.url.includes('/api/agent/history')
    )!
    expect(historyGet.url).toContain(`client=${CLIENT}`)
    expect(historyGet.url).toContain('limit=100')

    // Send one message.
    await act(async () => {
      type('what next')
    })
    const send = host.querySelector<HTMLButtonElement>('button.send-btn')!
    await act(async () => {
      send.click()
    })
    await settle()
    const post = seen.find(s => s.method === 'POST' && s.url.includes('/api/agent/chat'))!
    expect(post).toBeDefined()
    expect((post.body as { client?: string }).client).toBe(CLIENT)
    expect((post.body as { surface?: string }).surface).toBe('miniapp')

    // Start over: only this thread is cleared.
    const reset = [...host.querySelectorAll<HTMLButtonElement>('button.chat-reset')][0]
    expect(reset).toBeDefined()
    await act(async () => {
      reset.click()
    })
    await settle()
    const del = seen.find(s => s.method === 'DELETE')!
    expect(del.url).toContain('/api/agent/history?client=' + CLIENT)
  })

  it('names the client and offers the way back to their page', async () => {
    serve()
    await draw(`/crm/${CLIENT}/chat`)
    expect(host.textContent).toContain(`crm.client.chat.title:${CLIENT}`)
    const back = host.querySelector<HTMLAnchorElement>('a.chat-client__back')!
    expect(back.getAttribute('href')).toBe(`/crm/${CLIENT}`)
    // The greeting is the client one, not the self one.
    expect(host.textContent).toContain(`crm.client.chat.welcome:${CLIENT}`)
  })

  it('keeps its messages under its own storage key, apart from the self thread', async () => {
    serve([
      { role: 'user', content: 'ClientThreadOnly' },
      { role: 'assistant', content: 'yes' },
    ])
    await draw(`/crm/${CLIENT}/chat`)
    expect(host.textContent).toContain('ClientThreadOnly')

    const key = clientThreadStorageKey(CLIENT)
    expect(key).toBe(`${STORAGE_KEYS.agentChat}:client:${CLIENT}`)
    expect(key).not.toBe(STORAGE_KEYS.agentChat)
    expect(String(localStorage.getItem(key))).toContain('ClientThreadOnly')
    // The self thread's storage does not carry the client's turns.
    expect(String(localStorage.getItem(STORAGE_KEYS.agentChat) ?? '')).not.toContain(
      'ClientThreadOnly'
    )
    expect(editorStore.get(agentMessagesAtom)).toEqual([])
  })
})

describe('the self thread is untouched', () => {
  it('/chat reads, sends and clears without any client parameter', async () => {
    serve()
    await draw('/chat')
    const historyGet = seen.find(
      s => s.method === 'GET' && s.url.includes('/api/agent/history')
    )!
    expect(historyGet.url).toBe('https://api.example.test/api/agent/history?limit=100')
    expect(host.querySelector('.chat-client')).toBeNull()

    await act(async () => {
      type('hello')
    })
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button.send-btn')!.click()
    })
    await settle()
    const post = seen.find(s => s.method === 'POST' && s.url.includes('/api/agent/chat'))!
    expect(post.body).not.toHaveProperty('client')

    await act(async () => {
      host.querySelector<HTMLButtonElement>('button.chat-reset')!.click()
    })
    await settle()
    const del = seen.find(s => s.method === 'DELETE')!
    expect(del.url).toBe('https://api.example.test/api/agent/history')
  })
})
