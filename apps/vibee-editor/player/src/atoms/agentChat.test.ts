import { createStore } from 'jotai'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { userAtom } from './user'
import {
  agentChatOwnerAtom,
  agentDraftAtom,
  agentMessagesAtom,
} from './agentChat'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('conversation cache follows the account', () => {
  it('never stores or displays private conversation data without an account', () => {
    const store = createStore()
    store.set(userAtom, null)
    store.set(agentMessagesAtom, [
      { id: 'private', role: 'assistant', text: 'Private response' },
    ])
    store.set(agentDraftAtom, 'Private draft')
    expect(store.get(agentMessagesAtom)).toEqual([])
    expect(store.get(agentDraftAtom)).toBe('')
  })

  it('hides a stale cached account when Telegram launched a different owner', () => {
    const store = createStore()
    store.set(userAtom, { id: 101, first_name: 'Old', auth_date: 1, hash: '' })
    store.set(agentMessagesAtom, [
      { id: 'private', role: 'assistant', text: 'Old account' },
    ])
    vi.stubGlobal('Telegram', {
      WebApp: { initDataUnsafe: { user: { id: 202 } } },
    })
    store.set(userAtom, {
      id: 101,
      first_name: 'Old cached account',
      auth_date: 1,
      hash: '',
    })
    expect(store.get(agentChatOwnerAtom)).toBe('anonymous')
    expect(store.get(agentMessagesAtom)).toEqual([])
  })
  it('isolates messages and drafts and restores only the returning account', () => {
    const store = createStore()
    store.set(userAtom, { id: 101, first_name: 'One', auth_date: 1, hash: '' })
    store.set(agentMessagesAtom, [
      { id: 'u1', role: 'user', text: 'First account private text' },
    ])
    store.set(agentDraftAtom, 'Private draft')
    store.set(userAtom, { id: 202, first_name: 'Two', auth_date: 1, hash: '' })
    expect(store.get(agentMessagesAtom)).toEqual([])
    expect(store.get(agentDraftAtom)).toBe('')
    store.set(agentMessagesAtom, [
      { id: 'u2', role: 'user', text: 'Second account' },
    ])
    store.set(userAtom, null)
    expect(store.get(agentMessagesAtom)).toEqual([])
    expect(store.get(agentDraftAtom)).toBe('')
    store.set(userAtom, { id: 101, first_name: 'One', auth_date: 1, hash: '' })
    expect(store.get(agentMessagesAtom)[0].text).toBe(
      'First account private text'
    )
    expect(store.get(agentDraftAtom)).toBe('Private draft')
  })
})
