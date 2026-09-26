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
  agentBusyThreadsAtom,
  agentQueueAtom,
  isAgentBusy,
  removeQueued,
  sendOrQueue,
  stopAgent,
  threadKeyOf,
} from '@/lib/agentStream'

/** A server answer that ends only when the test says so. */
const sent: Array<{
  message: string
  client: string | null
  agent?: string
  conversation?: string
}> = []
const signals: AbortSignal[] = []
let release: Array<() => void> = []

function stream(signal?: AbortSignal) {
  let done = false
  let resolveGate: () => void = () => {}
  let rejectGate: (e: unknown) => void = () => {}
  const gate = new Promise<void>((r, j) => {
    resolveGate = r
    rejectGate = j
  })
  release.push(resolveGate)
  signal?.addEventListener('abort', () =>
    rejectGate(new DOMException('aborted', 'AbortError'))
  )
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
  signals.length = 0
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
        ...(body.agent ? { agent: body.agent } : {}),
        ...(body.conversation ? { conversation: body.conversation } : {}),
      })
      if (init?.signal) signals.push(init.signal)
      return stream(init?.signal ?? undefined)
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
    sendOrQueue('drop me', [], { client: '900000031' })
    const id = editorStore.get(agentQueueAtom)[0].id
    sendOrQueue('also the client', [], { client: '900000031' })
    removeQueued(id)
    await finishCurrent()
    await finishCurrent()
    expect(sent).toEqual([
      { message: 'about the client', client: '900000031' },
      { message: 'also the client', client: '900000031' },
    ])
  })

  it('several conversations answer at once: one busy chat does not hold another', async () => {
    expect(sendOrQueue('to the RTL engineer', [], { agent: 'rtl' })).toBe(
      'sent'
    )
    expect(
      sendOrQueue('a second RTL chat', [], {
        agent: 'rtl',
        conversation: 'k3x9',
      })
    ).toBe('sent')
    expect(sendOrQueue('to myself')).toBe('sent')
    await flush()
    expect(sent.map(s => s.message)).toEqual([
      'to the RTL engineer',
      'a second RTL chat',
      'to myself',
    ])
    expect(sent[1]).toMatchObject({ agent: 'rtl', conversation: 'k3x9' })
    expect(isAgentBusy('agent:rtl')).toBe(true)
    expect(isAgentBusy('agent:rtl~k3x9')).toBe(true)
    expect(editorStore.get(agentBusyThreadsAtom)).toHaveLength(3)
    // Busy in its own conversation only: this one waits behind its own answer.
    expect(sendOrQueue('more for rtl', [], { agent: 'rtl' })).toBe('queued')
    for (let i = 0; i < 4; i++) await finishCurrent()
    expect(sent.at(-1)?.message).toBe('more for rtl')
    await finishCurrent()
    expect(isAgentBusy()).toBe(false)
  })

  it('Stop cuts the stream of that conversation only and drops what was queued behind it', async () => {
    sendOrQueue('long task', [], { agent: 'fpga' })
    sendOrQueue('other chat', [], { agent: 'rtl' })
    await flush()
    sendOrQueue('queued behind the long one', [], { agent: 'fpga' })
    stopAgent(threadKeyOf({ agent: 'fpga' }))
    for (let i = 0; i < 5; i++) await flush()
    expect(signals[0].aborted).toBe(true)
    expect(signals[1].aborted).toBe(false)
    expect(isAgentBusy('agent:fpga')).toBe(false)
    expect(isAgentBusy('agent:rtl')).toBe(true)
    expect(editorStore.get(agentQueueAtom)).toEqual([])
    expect(sent.map(s => s.message)).toEqual(['long task', 'other chat'])
    await finishCurrent()
    await finishCurrent()
  })

  it('a thread key reads like the server thread it talks to', () => {
    expect(threadKeyOf({})).toBe('self')
    expect(threadKeyOf({ conversation: 'k3x9' })).toBe('self~k3x9')
    expect(threadKeyOf({ agent: 'rtl', conversation: 'k3x9' })).toBe(
      'agent:rtl~k3x9'
    )
    // A client's thread is one conversation, whoever helps in it.
    expect(
      threadKeyOf({ client: '900000031', agent: 'rtl', conversation: 'k3x9' })
    ).toBe('client:900000031')
  })

  it('an empty line is neither sent nor queued', () => {
    expect(sendOrQueue('   ')).toBe('empty')
    expect(editorStore.get(agentQueueAtom)).toEqual([])
  })
})
