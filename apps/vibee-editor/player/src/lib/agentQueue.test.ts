/**
 * THE QUEUE: WRITING WHILE THE AGENT IS STILL ANSWERING.
 *
 * Owner, 2026-09-24: the input must not lock while the agent works, and the
 * lines written meanwhile go when it is ready. Pinned: a line sent while an
 * answer is in flight waits instead of being dropped, the queue drains in
 * order one answer at a time, each line goes to ITS thread, and a removed
 * line never leaves.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/apiFetch', () => ({ authHeaders: () => ({}) }))
vi.mock('@/config', () => ({ API_BASE: '' }))

import { editorStore } from '@/atoms/Provider'
import {
  agentQueueAtom,
  isAgentBusy,
  removeQueued,
  sendOrQueue,
} from '@/lib/agentStream'

/** A server answer that ends only when the test says so. */
const sent: Array<{ message: string; client: string | null }> = []
let release: Array<() => void> = []

function stream() {
  let done = false
  let resolveGate: () => void = () => {}
  const gate = new Promise<void>(r => (resolveGate = r))
  release.push(resolveGate)
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: async () => {
          if (done) return { done: true, value: undefined }
          await gate
          done = true
          return {
            done: false,
            value: new TextEncoder().encode('{"type":"text","text":"ok"}\n'),
          }
        },
      }),
    },
  }
}

const flush = () => new Promise(r => setTimeout(r, 0))

beforeEach(() => {
  sent.length = 0
  release = []
  editorStore.set(agentQueueAtom, [])
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}'))
      const last = (body.messages ?? []).at(-1)
      sent.push({
        message: String(last?.content ?? ''),
        client: body.client ?? null,
      })
      return stream()
    })
  )
})

async function finishCurrent() {
  release.shift()?.()
  for (let i = 0; i < 5; i++) await flush()
}

describe('sendOrQueue', () => {
  it('queues while busy and sends in order when the agent is free', async () => {
    expect(sendOrQueue('first')).toBe('sent')
    await flush()
    expect(isAgentBusy()).toBe(true)
    expect(sendOrQueue('second')).toBe('queued')
    expect(sendOrQueue('third')).toBe('queued')
    expect(editorStore.get(agentQueueAtom).map(q => q.text)).toEqual([
      'second',
      'third',
    ])
    expect(sent.map(s => s.message)).toEqual(['first'])

    await finishCurrent()
    expect(sent.map(s => s.message)).toEqual(['first', 'second'])
    expect(editorStore.get(agentQueueAtom).map(q => q.text)).toEqual(['third'])

    await finishCurrent()
    expect(sent.map(s => s.message)).toEqual(['first', 'second', 'third'])
    await finishCurrent()
    expect(isAgentBusy()).toBe(false)
  })

  it('a removed line never leaves, and each line keeps its thread', async () => {
    sendOrQueue('about the client', [], { client: '900000031' })
    await flush()
    const id = (sendOrQueue('drop me'), editorStore.get(agentQueueAtom)[0].id)
    sendOrQueue('to self')
    removeQueued(id)
    await finishCurrent()
    await finishCurrent()
    expect(sent).toEqual([
      { message: 'about the client', client: '900000031' },
      { message: 'to self', client: null },
    ])
  })

  it('an empty line is neither sent nor queued', () => {
    expect(sendOrQueue('   ')).toBe('empty')
    expect(editorStore.get(agentQueueAtom)).toEqual([])
  })
})
