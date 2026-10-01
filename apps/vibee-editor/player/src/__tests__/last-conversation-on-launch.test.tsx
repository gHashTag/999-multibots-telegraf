/**
 * A RETURNING PERSON IS TAKEN BACK TO THE CONVERSATION, NOT TO THE SALE.
 *
 * Owner, 2026-10-02: "if the user chose agents, do not show the sales screen
 * again; keep the last conversation with a client or the agent". The CRM was
 * never remembered, so an evening of client chats ended, on the next launch,
 * on whatever remembered screen came before it -- often /agents, the page
 * that sells.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { Provider } from 'jotai'
import { STORAGE_KEYS } from '@vibee/atoms'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RouteMemory } from '@/components/Navigation/RouteMemory'
import { isConversation, resumeTarget } from '@/lib/launchMemory'
import { survivesStorageReset } from '@/lib/storageReset'
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

describe('where a greeted person is taken back to', () => {
  it('the screen they were on, when they were working there', () => {
    expect(resumeTarget('/crm', '/chat')).toBe('/crm')
    expect(resumeTarget('/generate/script', '/chat')).toBe('/generate/script')
  })

  it('the last conversation, over the sales page they passed through', () => {
    expect(resumeTarget('/agents', '/crm/5550001/chat')).toBe(
      '/crm/5550001/chat'
    )
    expect(resumeTarget('/feed', '/agents/blogger/work')).toBe(
      '/agents/blogger/work'
    )
    expect(resumeTarget(null, '/crm/g/-100200/chat')).toBe(
      '/crm/g/-100200/chat'
    )
  })

  it('the remembered screen, or the feed, when there was no conversation', () => {
    expect(resumeTarget('/agents', null)).toBe('/agents')
    expect(resumeTarget(null, null)).toBe('/feed')
  })

  it('never a path that is not a conversation, whatever the storage holds', () => {
    expect(resumeTarget('/agents', '/somebody')).toBe('/agents')
    expect(resumeTarget('/agents', '/crm')).toBe('/agents')
    expect(resumeTarget('/nonsense', null)).toBe('/feed')
  })

  it('knows a conversation when it sees one', () => {
    for (const path of [
      '/chat',
      '/crm/123/chat',
      '/crm/g/-1001/chat',
      '/agents/blogger/work',
    ]) {
      expect(isConversation(path), path).toBe(true)
    }
    for (const path of ['/crm', '/crm/123', '/agents', '/feed', '/chatx']) {
      expect(isConversation(path), path).toBe(false)
    }
  })

  it('keeps the last conversation through the storage reset', () => {
    expect(survivesStorageReset(STORAGE_KEYS.lastChat)).toBe(true)
  })
})

describe('the memory of screens and conversations', () => {
  let host: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    window.localStorage.clear()
    host = document.createElement('div')
    document.body.appendChild(host)
  })
  afterEach(() => {
    act(() => root?.unmount())
    root = null
    host.remove()
    window.localStorage.clear()
  })

  function visit(path: string) {
    act(() => root?.unmount())
    root = createRoot(host)
    act(() => {
      root!.render(
        <Provider>
          <MemoryRouter initialEntries={[path]}>
            <RouteMemory />
          </MemoryRouter>
        </Provider>
      )
    })
  }

  it('remembers a client chat in the CRM as both the screen and the conversation', () => {
    visit('/crm/777/chat')
    expect(window.localStorage.getItem(STORAGE_KEYS.lastRoute)).toBe(
      '/crm/777/chat'
    )
    expect(window.localStorage.getItem(STORAGE_KEYS.lastChat)).toBe(
      '/crm/777/chat'
    )
  })

  it('a later screen moves the screen, not the conversation', () => {
    visit('/chat')
    visit('/agents')
    expect(window.localStorage.getItem(STORAGE_KEYS.lastRoute)).toBe('/agents')
    expect(window.localStorage.getItem(STORAGE_KEYS.lastChat)).toBe('/chat')
  })
})
