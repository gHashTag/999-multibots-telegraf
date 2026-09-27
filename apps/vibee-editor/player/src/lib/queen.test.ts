/**
 * THE QUEEN: HER OWN THREAD, NO WAIT ON THE AGENT, TASKS FOR THE AGENT.
 *
 * Pinned: tasks are read out of her answer (at most three, no duplicates)
 * and hidden from the text; her turn goes to the chat route as
 * role=supervisor for THIS client; her answer lands in her own thread; and
 * a server refusal is shown in her answer, not swallowed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/apiFetch', () => ({ authHeaders: () => ({}) }))
vi.mock('@/config', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  API_BASE: '',
}))

import { editorStore } from '@/atoms/Provider'
import { queenMessagesAtomFor } from '@/atoms/agentChat'
import {
  askQueen,
  loadQueenHistory,
  queenBusyAtom,
  tasksIn,
  withoutTasks,
} from './queen'

const CLIENT = '900000031'

const stream = (lines: string[]) =>
  new Response(lines.map(l => l + '\n').join(''), { status: 200 })

describe('tasksIn / withoutTasks', () => {
  it('reads up to three distinct tasks and hides the markers', () => {
    const a =
      'She is waiting for a portrait.\n[[task: draw her portrait 9:16]]\n' +
      '[[task: draw her portrait 9:16]]\n[[task:  prepare the send card ]]' +
      '[[task: a]][[task: b]]'
    expect(tasksIn(a)).toEqual([
      'draw her portrait 9:16',
      'prepare the send card',
      'a',
    ])
    expect(withoutTasks(a)).toBe('She is waiting for a portrait.')
  })
})

describe('askQueen', () => {
  beforeEach(() => editorStore.set(queenMessagesAtomFor(CLIENT), []))

  it('asks as supervisor about this client and keeps her own thread', async () => {
    const seen: Array<Record<string, unknown>> = []
    const fetchMock = vi.fn(async (_u: string, init?: RequestInit) => {
      seen.push(JSON.parse(String(init?.body)))
      return stream([
        JSON.stringify({ тип: 'текст', текст: 'Stuck on the gift. ' }), // cyrillic-ok: the stream's own fields
        JSON.stringify({ тип: 'текст', текст: '[[task: draw it]]' }), // cyrillic-ok: the stream's own fields
      ])
    })
    const out = await askQueen(CLIENT, 'where is it stuck?', fetchMock as never)
    expect(seen[0]).toMatchObject({ client: CLIENT, role: 'supervisor' })
    expect(tasksIn(out.text)).toEqual(['draw it'])
    const thread = editorStore.get(queenMessagesAtomFor(CLIENT))
    expect(thread.map(m => m.role)).toEqual(['user', 'assistant'])
    expect(thread[1].id).toBe(out.id)
    expect(thread[1].text).toContain('Stuck on the gift.')
  })

  it('a refusal is written into her answer', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: 'not a seller' }), {
          status: 403,
        })
    )
    await askQueen(CLIENT, 'hi', fetchMock as never)
    const thread = editorStore.get(queenMessagesAtomFor(CLIENT))
    expect(thread[1].text).toContain('not a seller')
  })
})

describe('loadQueenHistory', () => {
  const OTHER = '900000032'
  const turns = (...t: Array<[string, string]>) =>
    new Response(
      JSON.stringify({
        ok: true,
        messages: t.map(([role, content]) => ({ role, content })),
      }),
      { status: 200 }
    )

  beforeEach(() => {
    editorStore.set(queenMessagesAtomFor(CLIENT), [])
    editorStore.set(queenMessagesAtomFor(OTHER), [])
    editorStore.set(queenBusyAtom, {})
  })

  it("brings back this client's supervisor thread into an empty panel", async () => {
    const urls: string[] = []
    const fetchMock = vi.fn(async (u: string) => {
      urls.push(u)
      return turns(
        ['user', 'where is it stuck?'],
        ['assistant', 'On the gift.']
      )
    })
    expect(await loadQueenHistory(CLIENT, fetchMock as never)).toBe(true)
    expect(urls[0]).toContain(`client=${CLIENT}`)
    expect(urls[0]).toContain('role=supervisor')
    expect(
      editorStore.get(queenMessagesAtomFor(CLIENT)).map(m => m.text)
    ).toEqual(['where is it stuck?', 'On the gift.'])
    // Another client's panel is not touched.
    expect(editorStore.get(queenMessagesAtomFor(OTHER))).toEqual([])
  })

  it('never wipes the panel with an empty, shorter or failed answer', async () => {
    const local = [
      { id: 'q1', role: 'user' as const, text: 'a' },
      { id: 'q2', role: 'assistant' as const, text: 'b' },
    ]
    editorStore.set(queenMessagesAtomFor(CLIENT), local)
    for (const answer of [
      () => turns(),
      () => turns(['user', 'a']),
      () => new Response('nope', { status: 500 }),
      () => {
        throw new Error('offline')
      },
    ]) {
      expect(
        await loadQueenHistory(CLIENT, vi.fn(async () => answer()) as never)
      ).toBe(false)
      expect(editorStore.get(queenMessagesAtomFor(CLIENT))).toEqual(local)
    }
  })

  it('does not replace her thread while she is answering', async () => {
    editorStore.set(queenBusyAtom, { [CLIENT]: true })
    const fetchMock = vi.fn(async () =>
      turns(['user', 'x'], ['assistant', 'y'])
    )
    expect(await loadQueenHistory(CLIENT, fetchMock as never)).toBe(false)
    expect(editorStore.get(queenMessagesAtomFor(CLIENT))).toEqual([])
  })
})
