import { atom } from 'jotai'
import { editorStore } from '@/atoms/Provider'
import {
  agentChatOwnerAtom,
  agentDraftAtom,
  agentMessagesAtom,
} from '@/atoms/agentChat'
import { agentBusyAtom } from './agentStream'
import {
  adoptHistory,
  shouldAdoptHistory,
  turnsFromResponse,
} from './agentHistory'
import { API_BASE } from '@/config'
import { authHeaders } from './apiFetch'

export const agentHistoryClearingAtom = atom(false)
const isBusy = () =>
  editorStore.get(agentBusyAtom) || editorStore.get(agentHistoryClearingAtom)

/** Final persisted turns refresh across devices; live token streams stay local. */
export function startAgentHistorySync(): () => void {
  let alive = true
  let generation = 0
  let request: AbortController | undefined

  const invalidate = () => {
    generation++
    request?.abort()
  }
  const refresh = async () => {
    invalidate()
    if (!alive || isBusy() || document.visibilityState === 'hidden') return
    const version = generation
    const owner = editorStore.get(agentChatOwnerAtom)
    if (owner === 'anonymous') return
    const local = editorStore.get(agentMessagesAtom)
    request = new AbortController()
    try {
      const response = await fetch(`${API_BASE}/api/agent/history?limit=100`, {
        headers: authHeaders(),
        signal: request.signal,
      })
      if (!response.ok) return
      const body = await response.json()
      if (body?.ownerId !== owner) return
      const server = turnsFromResponse(body)
      const current = editorStore.get(agentMessagesAtom)
      if (
        !alive ||
        version !== generation ||
        isBusy() ||
        server === null ||
        owner !== editorStore.get(agentChatOwnerAtom) ||
        (local !== current &&
          (local.some(message => message.id !== 'welcome') ||
            current.some(message => message.id !== 'welcome')))
      )
        return
      if (shouldAdoptHistory({ server, local: current, busy: false })) {
        editorStore.set(agentMessagesAtom, adoptHistory(server, current))
      }
    } catch {
      // Keep the scoped cache on transport/auth failures; valid [] clears it.
    }
  }

  const onChange = () => {
    void refresh()
  }
  const unsubscribeBusy = editorStore.sub(agentBusyAtom, onChange)
  const unsubscribeOwner = editorStore.sub(agentChatOwnerAtom, onChange)
  const unsubscribeClear = editorStore.sub(agentHistoryClearingAtom, onChange)
  document.addEventListener('visibilitychange', onChange)
  window.addEventListener('focus', onChange)
  const timer = window.setInterval(onChange, 10_000)
  void refresh()
  return () => {
    alive = false
    invalidate()
    window.clearInterval(timer)
    unsubscribeBusy()
    unsubscribeOwner()
    unsubscribeClear()
    document.removeEventListener('visibilitychange', onChange)
    window.removeEventListener('focus', onChange)
  }
}

/** Keep visible history until the server confirms the owner-scoped deletion. */
export async function clearAgentHistory(): Promise<void> {
  if (isBusy()) return
  const owner = editorStore.get(agentChatOwnerAtom)
  if (owner === 'anonymous') return
  editorStore.set(agentHistoryClearingAtom, true)
  try {
    const response = await fetch(
      `${API_BASE}/api/agent/history?expectedOwnerId=${encodeURIComponent(owner)}`,
      {
        method: 'DELETE',
        headers: authHeaders(),
      }
    )
    if (!response.ok || (await response.json())?.ok !== true)
      throw new Error('History clear failed')
    if (owner !== editorStore.get(agentChatOwnerAtom)) return
    editorStore.set(agentMessagesAtom, [])
    editorStore.set(agentDraftAtom, '')
  } finally {
    editorStore.set(agentHistoryClearingAtom, false)
  }
}
