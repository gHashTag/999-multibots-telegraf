import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { editorStore } from '@/atoms/Provider'
import { userAtom } from '@/atoms/user'
import { agentMessagesAtom } from '@/atoms/agentChat'
import { agentBusyAtom } from '@/lib/agentStream'
import { clearAgentHistory, startAgentHistorySync } from './agentHistorySync'

vi.mock('@/lib/apiFetch', () => ({ authHeaders: () => new Headers() }))
vi.mock('@/config', () => ({ API_BASE: '' }))

const body = (content = 'From the bot', ownerId = '701') => ({
  ok: true,
  ownerId,
  messages: [{ id: 44, role: 'user', content, surface: 'bot' }],
})
const response = (data = body()) => ({ ok: true, json: async () => data })
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}
let stop: (() => void) | undefined

beforeEach(() => {
  vi.useFakeTimers()
  editorStore.set(userAtom, {
    id: 701,
    first_name: 'One',
    auth_date: 1,
    hash: '',
  })
  editorStore.set(agentMessagesAtom, [])
  editorStore.set(agentBusyAtom, false)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response())
  )
})
afterEach(() => {
  stop?.()
  stop = undefined
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('shared history refresh lifecycle', () => {
  it('does not fetch, clear or cache history after logout while launch credentials remain', async () => {
    stop = startAgentHistorySync()
    await flush()
    editorStore.set(userAtom, null)
    await clearAgentHistory()
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(editorStore.get(agentMessagesAtom)).toEqual([])
  })

  it('rejects a response authenticated as a different account', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      response(body('Other account private text', '999')) as Response
    )
    stop = startAgentHistorySync()
    await flush()
    expect(editorStore.get(agentMessagesAtom)).toEqual([])
  })

  it('does not let the initial welcome placeholder postpone the first history load', async () => {
    stop = startAgentHistorySync()
    editorStore.set(agentMessagesAtom, [
      { id: 'welcome', role: 'assistant', text: 'Welcome' },
    ])
    await flush()
    expect(editorStore.get(agentMessagesAtom)[0].text).toBe('From the bot')
  })
  it('refreshes on mount, focus and interval and removes every listener on cleanup', async () => {
    stop = startAgentHistorySync()
    await flush()
    expect(editorStore.get(agentMessagesAtom)[0].text).toBe('From the bot')
    window.dispatchEvent(new Event('focus'))
    await flush()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(fetch).toHaveBeenCalledTimes(3)
    stop()
    stop = undefined
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(20_000)
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('waits while streaming, then refreshes after the completed reply', async () => {
    editorStore.set(agentBusyAtom, true)
    stop = startAgentHistorySync()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(fetch).not.toHaveBeenCalled()
    editorStore.set(agentBusyAtom, false)
    await flush()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(editorStore.get(agentMessagesAtom)[0].text).toBe('From the bot')
  })

  it('discards old requests even if they return after a newer stream finishes', async () => {
    let finishOld!: (value: Response) => void
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finishOld = resolve
        })
    )
    stop = startAgentHistorySync()
    editorStore.set(agentBusyAtom, true)
    editorStore.set(agentMessagesAtom, [
      { id: 'a1', role: 'assistant', text: 'Completed newest reply' },
    ])
    editorStore.set(agentBusyAtom, false)
    await flush()
    finishOld(response(body('Stale reply')) as Response)
    await flush()
    expect(editorStore.get(agentMessagesAtom)[0].text).toBe('From the bot')
  })

  it('never applies the previous owner response to the next account', async () => {
    let finishOld!: (value: Response) => void
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finishOld = resolve
        })
    )
    stop = startAgentHistorySync()
    vi.mocked(fetch).mockResolvedValueOnce(
      response(body('From the bot', '702')) as Response
    )
    editorStore.set(userAtom, {
      id: 702,
      first_name: 'Two',
      auth_date: 1,
      hash: '',
    })
    await flush()
    finishOld(response(body('First account private text')) as Response)
    await flush()
    expect(editorStore.get(agentMessagesAtom)[0].text).toBe('From the bot')
  })

  it('keeps the visible conversation when clear fails, and clears only on confirmation', async () => {
    const local = [
      { id: 'a1', role: 'assistant' as const, text: 'Keep until confirmed' },
    ]
    editorStore.set(agentMessagesAtom, local)
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response)
    await expect(clearAgentHistory()).rejects.toThrow()
    expect(editorStore.get(agentMessagesAtom)).toEqual(local)
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response)
    await clearAgentHistory()
    expect(editorStore.get(agentMessagesAtom)).toEqual([])
  })
})
