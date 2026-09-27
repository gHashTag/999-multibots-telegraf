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
import { askQueen, taskTarget, tasksIn, withoutTasks } from './queen'

const CLIENT = '900000031'

const stream = (lines: string[]) =>
  new Response(lines.map(l => l + '\n').join(''), { status: 200 })

describe('taskTarget', () => {
  it("her task goes to the specialist chosen in the client's thread", () => {
    expect(taskTarget(CLIENT, 'blogger')).toEqual({
      client: CLIENT,
      agent: 'blogger',
    })
  })

  it('and to the plain assistant when none is chosen', () => {
    expect(taskTarget(CLIENT, null)).toEqual({ client: CLIENT })
    expect(taskTarget(CLIENT)).toEqual({ client: CLIENT })
  })
})

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
