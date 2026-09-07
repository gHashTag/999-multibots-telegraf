import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Provider } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { editorStore } from '@/atoms/Provider'
import { userAtom } from '@/atoms/user'
import { agentMessagesAtom } from '@/atoms/agentChat'
import { uploadToS3 } from '@/lib/s3Upload'
import ChatPage from './Chat'

vi.hoisted(() => {
  sessionStorage.setItem(
    'vibee-user',
    JSON.stringify({
      id: 900001,
      first_name: 'Fixture',
      auth_date: 1,
      hash: '',
    })
  )
  localStorage.setItem(
    'vibee-agent-chat-by-owner',
    JSON.stringify({
      '900001': [
        {
          id: 'server-7',
          role: 'assistant',
          text: 'Open audio',
          actions: ['audio'],
          tools: [{ name: 'open_app', ms: 5 }],
        },
      ],
    })
  )
})
vi.mock('@/components/Header', () => ({ Header: () => null }))
vi.mock('@/components/Chat/ChatAssets', () => ({
  ChatAssets: ({ text }: { text: string }) => <span>{text}</span>,
}))
vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}))
vi.mock('@/lib/apiFetch', () => ({ authHeaders: () => new Headers() }))
vi.mock('@/config', () => ({ API_BASE: '' }))
vi.mock('@/lib/s3Upload', () => ({ uploadToS3: vi.fn() }))
vi.mock('@/lib/mediaUrl', () => ({ toAbsoluteUrl: (url: string) => url }))

describe('chat mount and pending uploads keep account context', () => {
  let host: HTMLDivElement
  let root: Root
  let finishHistory: (response: Response) => void

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        if (String(input).includes('/api/agent/history')) {
          return new Promise<Response>(resolve => {
            finishHistory = resolve
          })
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: false }),
        } as Response)
      })
    )
    vi.mocked(uploadToS3).mockReset().mockResolvedValue('/s3/other.jpg')
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  })

  async function mount() {
    await act(async () => {
      root.render(
        <Provider store={editorStore}>
          <MemoryRouter>
            <ChatPage />
          </MemoryRouter>
        </Provider>
      )
    })
  }

  it('preserves cached task actions when user hydration precedes the welcome effect', async () => {
    expect(editorStore.get(userAtom)).toBeNull()
    await mount()
    expect(editorStore.get(userAtom)?.id).toBe(900001)
    expect(editorStore.get(agentMessagesAtom)[0].actions).toEqual(['audio'])
    await act(async () => {
      finishHistory({
        ok: true,
        json: async () => ({
          ok: true,
          ownerId: '900001',
          messages: [{ id: 7, role: 'assistant', content: 'Open audio' }],
        }),
      } as Response)
    })
    expect(host.querySelector('a[href="/generate/audio"]')).not.toBeNull()
    expect(editorStore.get(agentMessagesAtom)[0].actions).toEqual(['audio'])
  })

  it.each(['resolved', 'rejected'] as const)(
    'does not carry a %s upload into another account or start its next file',
    async outcome => {
      editorStore.set(userAtom, {
        id: 900001,
        first_name: 'First',
        auth_date: 1,
        hash: '',
      })
      let resolveUpload!: (url: string | null) => void
      let rejectUpload!: (error: Error) => void
      vi.mocked(uploadToS3).mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            resolveUpload = resolve
            rejectUpload = reject
          })
      )
      await mount()
      const input = host.querySelector<HTMLInputElement>('input[type="file"]')!
      Object.defineProperty(input, 'files', {
        configurable: true,
        value: [
          new File(['first'], 'private.jpg', { type: 'image/jpeg' }),
          new File(['second'], 'second.jpg', { type: 'image/jpeg' }),
        ],
      })
      await act(async () => {
        input.dispatchEvent(new Event('change', { bubbles: true }))
      })
      expect(uploadToS3).toHaveBeenCalledTimes(1)
      act(() =>
        editorStore.set(userAtom, {
          id: 900002,
          first_name: 'Second',
          auth_date: 1,
          hash: '',
        })
      )
      await act(async () => {
        if (outcome === 'resolved') resolveUpload('/s3/private.jpg')
        else rejectUpload(new Error('Private first-account filename'))
      })
      expect(uploadToS3).toHaveBeenCalledTimes(1)
      expect(host.querySelectorAll('.chat-attachment-chip')).toHaveLength(0)
      expect(host.querySelector('.chat-attachment-error')).toBeNull()
    }
  )
})
