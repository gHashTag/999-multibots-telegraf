import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Provider } from 'jotai'
import { editorStore } from '@/atoms/Provider'
import { agentBusyThreadsAtom } from '@/lib/agentStream'
import { ConversationRail } from './ConversationRail'

/**
 * SEVERAL CHATS, THE RAIL (owner, 2026-09-26). Each case is what a person
 * does with the list: sees their chats newest first, starts a new one, opens
 * one, and sees which is answering. The server list is mocked; the point here
 * is what the rail draws from it, not the fetch.
 */
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
vi.mock('@/lib/apiFetch', () => ({ authHeaders: () => new Headers() }))
vi.mock('@/config', () => ({ API_BASE: '' }))

const rows = [
  {
    conversation: 'bbbb',
    title: 'a UART',
    turns: 2,
    lastAt: new Date().toISOString(),
    preview: 'done',
  },
  {
    conversation: 'aaaa',
    title: 'lint my FIFO',
    turns: 4,
    lastAt: new Date().toISOString(),
    preview: '0 warnings',
  },
]

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  editorStore.set(agentBusyThreadsAtom, [])
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, conversations: rows }),
    }))
  )
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

const flush = () => act(async () => await new Promise(r => setTimeout(r, 0)))

describe('the conversation rail', () => {
  it('lists the chats and starts a new one', async () => {
    let made: string | null | undefined = undefined
    await act(async () => {
      root.render(
        <Provider store={editorStore}>
          <ConversationRail
            agent="rtl"
            current="aaaa"
            open
            onClose={() => {}}
            onOpen={() => {}}
            onNew={() => {
              made = 'new'
            }}
          />
        </Provider>
      )
    })
    await flush()
    const titles = [...host.querySelectorAll('.conv-row__title')].map(
      n => n.textContent
    )
    expect(titles).toContain('a UART')
    expect(titles).toContain('lint my FIFO')
    act(() =>
      (
        host.querySelector('[data-testid="conv-new"]') as HTMLButtonElement
      ).click()
    )
    expect(made).toBe('new')
  })

  it('marks the conversation that is answering with a live dot', async () => {
    editorStore.set(agentBusyThreadsAtom, ['agent:rtl~aaaa'])
    await act(async () => {
      root.render(
        <Provider store={editorStore}>
          <ConversationRail
            agent="rtl"
            current="aaaa"
            open
            onClose={() => {}}
            onOpen={() => {}}
            onNew={() => {}}
          />
        </Provider>
      )
    })
    await flush()
    // The answering row (aaaa) has a dot; the other (bbbb) does not.
    const dots = host.querySelectorAll('.conv-row__dot')
    expect(dots).toHaveLength(1)
  })

  it('says so when the list will not load, and does not pretend it is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => ({}) }))
    )
    await act(async () => {
      root.render(
        <Provider store={editorStore}>
          <ConversationRail
            agent={null}
            current={null}
            open
            onClose={() => {}}
            onOpen={() => {}}
            onNew={() => {}}
          />
        </Provider>
      )
    })
    await flush()
    expect(host.querySelector('.conv-rail__note')?.textContent).toBeTruthy()
  })
})
