import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Provider } from 'jotai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * THE MINI APP'S CHAT TAKES ANY FILE.
 *
 * Salvage study 2026-09-22, matrix rows "Text documents / PDF / Mini app
 * chat": the picker accepted image/*, video/* and audio/* only, so a PDF, a
 * spreadsheet or even a .txt could not be chosen in the app while the bot read
 * them. The server now reads PDFs and office files and names what it cannot
 * open, so the picker no longer decides -- and a chosen document must travel
 * to the agent as a `file` attachment, the kind the server reads.
 */

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
  }),
}))
vi.mock('@/components/Header', () => ({ Header: () => null }))
vi.mock('@/components/Chat/ChatAssets', () => ({
  ChatAssets: ({ text }: { text: string }) => <span>{text}</span>,
}))
vi.mock('@/lib/apiFetch', () => ({ authHeaders: () => new Headers() }))
vi.mock('@/config', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@/config')),
  API_BASE: 'https://api.example.test',
}))
const uploaded: string[] = []
vi.mock('@/lib/s3Upload', () => ({
  uploadToS3: async (_file: File, name: string) => {
    uploaded.push(name)
    return `/s3/assets/1-${name}`
  },
}))
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

import { editorStore } from '@/atoms/Provider'
import { agentMessagesAtom } from '@/atoms/agentChat'

let posted: unknown[] = []

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

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  posted = []
  uploaded.length = 0
  localStorage.clear()
  editorStore.set(agentMessagesAtom, [])
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/api/agent/chat')) {
        posted.push(JSON.parse(String(init?.body)))
        return stream(['{"тип":"текст","текст":"ok"}']) // cyrillic-ok: server keys
      }
      if (String(url).includes('/api/agent/history'))
        return { ok: true, json: async () => ({ messages: [] }) }
      return { ok: true, json: async () => ({}) }
    })
  )
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

async function draw() {
  const { default: ChatPage } = await import('./Chat')
  await act(async () => {
    root.render(
      <Provider store={editorStore}>
        <MemoryRouter initialEntries={['/chat']}>
          <Routes>
            <Route path="/chat" element={<ChatPage />} />
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

/** Which of these files would the picker let a person choose at all? */
function pickerAdmits(input: HTMLInputElement, file: File): boolean {
  const accept = input.getAttribute('accept')
  if (!accept) return true
  return accept.split(',').some(rule => {
    const r = rule.trim().toLowerCase()
    if (r.startsWith('.')) return file.name.toLowerCase().endsWith(r)
    if (r.endsWith('/*')) return file.type.startsWith(r.slice(0, -1))
    return file.type === r
  })
}

describe('the attach button', () => {
  it('lets a person choose a PDF, a spreadsheet and a text file, not only media', async () => {
    await draw()
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!
    expect(input).not.toBeNull()
    for (const file of [
      new File(['%PDF'], 'brief.pdf', { type: 'application/pdf' }),
      new File(['x'], 'budget.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      new File(['x'], 'notes.txt', { type: 'text/plain' }),
      new File(['x'], 'photo.jpg', { type: 'image/jpeg' }),
    ]) {
      expect(pickerAdmits(input, file), `the picker refuses ${file.name}`).toBe(
        true
      )
    }
    // Its label says so, through the dictionary.
    const button = host.querySelector<HTMLButtonElement>('button.attach-btn')!
    expect(button.getAttribute('aria-label')).toBe('chat.attachAny')
  })

  it('sends a chosen PDF to the agent as a file attachment', async () => {
    await draw()
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!
    const pdf = new File(['%PDF-1.4'], 'brief.pdf', { type: 'application/pdf' })
    await act(async () => {
      Object.defineProperty(input, 'files', {
        value: [pdf],
        configurable: true,
      })
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await settle()
    expect(uploaded).toEqual(['brief.pdf'])

    const send = host.querySelector<HTMLButtonElement>('button.send-btn')!
    await act(async () => {
      send.click()
    })
    await settle()

    const body = posted[0] as { messages: Array<{ content: string }> }
    const last = body.messages[body.messages.length - 1].content
    expect(last).toContain('[attached file: brief.pdf; mime=application/pdf;')
    expect(last).toContain('/s3/assets/1-brief.pdf')
  })
})
