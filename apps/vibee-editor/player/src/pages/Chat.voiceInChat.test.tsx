import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Provider } from 'jotai'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

/**
 * VOICE MODE LIVES INSIDE THE CHAT (owner, 2026-10-02: "why is the voice
 * agent not in the context of the chat?").
 *
 * The full-screen overlay covered the conversation the person was talking
 * about. Tested here: voice opens as a bar with the conversation still on
 * screen, a line typed into the chat's box goes to the voice session (and
 * is answered aloud) instead of past it, and the full screen is one tap
 * away and back.
 */

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
    lang: 'en',
  }),
}))
vi.mock('@/components/Header', () => ({ Header: () => null }))
vi.mock('@/components/Chat/ChatAssets', () => ({
  ChatAssets: ({ text }: { text: string }) => <span>{text}</span>,
}))
vi.mock('@/components/Voice/VoiceOrb', () => ({
  VoiceOrb: () => <button type="button" data-testid="voice-orb" />,
}))
vi.mock('@/lib/apiFetch', () => ({ authHeaders: () => new Headers() }))
vi.mock('@/config', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@/config')),
  API_BASE: 'https://api.example.test',
}))

const fake = vi.hoisted(() => {
  const snapshot = {
    phase: 'listening',
    heard: '',
    saying: '',
    error: null,
    muted: false,
    keyboard: false,
    fallbackVoice: false,
  }
  return {
    session: {
      snapshot,
      subscribe: () => () => {},
      start: async () => {},
      stop: () => {},
      type: (text: string) => void text,
      interrupt: () => {},
      toggleMute: () => {},
      analyser: () => null,
    },
  }
})
vi.mock('@/lib/voice/chatVoice', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@/lib/voice/chatVoice')),
  createChatVoiceSession: () => fake.session,
}))
vi.mock('@/lib/voice/voiceApi', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@/lib/voice/voiceApi')),
  fetchVoiceStatus: async () => ({ voices: { en: [], ru: [] } }),
}))
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

import { editorStore } from '@/atoms/Provider'
import { agentMessagesAtom } from '@/atoms/agentChat'
import { voiceSeparateAtom } from '@/lib/voice/chatVoice'

let posts: string[] = []
let host: HTMLDivElement
let root: Root

beforeEach(() => {
  posts = []
  localStorage.clear()
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }))
  editorStore.set(voiceSeparateAtom, false)
  editorStore.set(agentMessagesAtom, [
    { id: 'u1', role: 'user', text: 'what is on my plan' },
    { id: 'a1', role: 'assistant', text: 'Three reels this week.' },
  ])
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/agent/chat') && init?.method === 'POST')
        posts.push(String(init.body))
      if (url.includes('/api/agent/history'))
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
  vi.restoreAllMocks()
})

beforeAll(async () => {
  await import('./Chat')
}, 60_000)

const settle = () =>
  act(async () => {
    await new Promise(r => setTimeout(r, 0))
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
  await settle()
}

const q = (id: string) =>
  host.querySelector<HTMLElement>(`[data-testid="${id}"]`)

async function click(el: Element | null) {
  expect(el).not.toBeNull()
  await act(async () => {
    ;(el as HTMLElement).click()
  })
  await settle()
}

function typeInBox(text: string) {
  const input = host.querySelector<HTMLTextAreaElement>('textarea.chat-input')!
  Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value'
  )!.set!.call(input, text)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('voice mode inside the chat', () => {
  it('opens as a bar, with the conversation still on screen', async () => {
    await draw()
    await click(q('chat-voice'))
    expect(q('voice-dock')).not.toBeNull()
    expect(host.querySelector('.voice-overlay')).toBeNull()
    expect(host.textContent).toContain('Three reels this week.')
    expect(host.querySelector('textarea.chat-input')).not.toBeNull()
  })

  it('a line typed into the box goes to the voice session, not past it', async () => {
    const typed = vi.spyOn(fake.session, 'type')
    await draw()
    await click(q('chat-voice'))
    await act(async () => typeInBox('and next week?'))
    await click(host.querySelector('button.send-btn'))
    expect(typed).toHaveBeenCalledWith('and next week?')
    expect(posts).toEqual([])
    expect(
      host.querySelector<HTMLTextAreaElement>('textarea.chat-input')!.value
    ).toBe('')
  })

  it('the full screen is one tap away, and the chat one tap back', async () => {
    await draw()
    await click(q('chat-voice'))
    await click(q('voice-expand'))
    expect(host.querySelector('.voice-overlay')).not.toBeNull()
    expect(q('voice-dock')).toBeNull()
    // The choice is remembered for the next time voice opens.
    expect(editorStore.get(voiceSeparateAtom)).toBe(true)
    await click(q('voice-dock-back'))
    expect(q('voice-dock')).not.toBeNull()
    expect(host.querySelector('.voice-overlay')).toBeNull()
  })

  it('End closes voice and the box sends to the chat again', async () => {
    const typed = vi.spyOn(fake.session, 'type')
    await draw()
    await click(q('chat-voice'))
    await click(q('voice-close'))
    expect(q('voice-dock')).toBeNull()
    await act(async () => typeInBox('plain text'))
    await click(host.querySelector('button.send-btn'))
    expect(typed).not.toHaveBeenCalled()
    expect(posts.length).toBe(1)
  })
})
