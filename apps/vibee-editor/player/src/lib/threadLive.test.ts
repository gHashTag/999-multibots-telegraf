import { describe, expect, it } from 'vitest'
import {
  lastIdOf,
  parseSse,
  reconnectDelay,
  subscribeThread,
  type Work,
  workFrom,
} from './threadLive'

/**
 * The card sheet's live thread (spec kanban-card-chat.t27 v5, LIVE_DOOR):
 * the parser keeps half an event for the next chunk, the subscriber sends
 * `after=` the last id it saw, and a door that is not there stops it for good.
 */

function sseResponse(chunks: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const s of chunks) c.enqueue(new TextEncoder().encode(s))
      c.close()
    },
  })
  return new Response(body, {
    headers: { 'content-type': 'text/event-stream' },
  })
}

describe('threadLive', () => {
  it('parses whole events and keeps the unfinished rest', () => {
    const { events, rest } = parseSse(
      ': ping\n\nid: 4\nevent: turn\ndata: {"id":4}\n\nid: 5\nevent: tu'
    )
    expect(events).toEqual([{ event: 'turn', data: '{"id":4}', id: '4' }])
    expect(rest).toBe('id: 5\nevent: tu')
  })

  it('backs off up to half a minute and reads the last id of a history', () => {
    expect([0, 1, 2, 3, 9].map(reconnectDelay)).toEqual([
      2000, 4000, 8000, 16000, 30000,
    ])
    expect(lastIdOf({ messages: [{ id: 3 }, { id: 9 }, { id: 'x' }] })).toBe(9)
    expect(lastIdOf(null)).toBe(0)
  })

  it('hears new turns, reconnects after `end` from the last id, and stops', async () => {
    const urls: string[] = []
    const heard: number[] = []
    let calls = 0
    let stop = () => {}
    const done = new Promise<void>(resolve => {
      const fetchImpl = (async (url: string) => {
        urls.push(url)
        calls++
        if (calls === 1)
          return sseResponse([
            'id: 6\nevent: turn\ndata: {}\n\nid: 7\nev',
            'ent: turn\ndata: {}\n\nid: 6\nevent: turn\ndata: {}\n\n',
            'event: end\ndata: {"after":7}\n\n',
          ])
        stop()
        resolve()
        return new Response('', { status: 404 })
      }) as typeof fetch
      stop = subscribeThread({
        base: 'https://r',
        task: 'gHashTag/t27#1',
        after: 5,
        headers: () => ({}),
        onTurn: id => heard.push(id),
        fetchImpl,
        sleep: async () => undefined,
      })
    })
    await done
    expect(heard).toEqual([6, 7])
    expect(urls[0]).toContain('/api/agent/history/live?')
    expect(urls[0]).toContain('after=5')
    expect(urls[1]).toContain('after=7')
  })

  it('a render without the door is asked once, not forever', async () => {
    let calls = 0
    subscribeThread({
      base: '',
      task: '1',
      after: 0,
      headers: () => ({}),
      onTurn: () => undefined,
      fetchImpl: (async () => {
        calls++
        return new Response('{}', { status: 404 })
      }) as typeof fetch,
      sleep: async () => undefined,
    })
    await new Promise(r => setTimeout(r, 20))
    expect(calls).toBe(1)
  })

  it('hears the agent at work, a kind and a safe name only (v6)', async () => {
    const works: Work[] = []
    let stop = () => {}
    const done = new Promise<void>(resolve => {
      let calls = 0
      stop = subscribeThread({
        base: '',
        task: '1',
        after: 0,
        headers: () => ({}),
        onTurn: () => undefined,
        onWork: w => works.push(w),
        fetchImpl: (async () => {
          if (++calls === 1)
            return sseResponse([
              'event: work\ndata: {"kind":1}\n\n',
              'event: work\ndata: {"kind":2,"name":"browser_open"}\n\n',
              'event: work\ndata: {"kind":9}\n\n',
              'event: work\ndata: not json\n\n',
              'event: work\ndata: {"kind":4}\n\n',
              'event: end\ndata: {"after":0}\n\n',
            ])
          stop()
          resolve()
          return new Response('', { status: 404 })
        }) as typeof fetch,
        sleep: async () => undefined,
      })
    })
    await done
    expect(works).toEqual([
      { kind: 1 },
      { kind: 2, name: 'browser_open' },
      { kind: 4 },
    ])
    expect(workFrom('{"kind":2,"name":"<b>x</b>"}')).toEqual({ kind: 2 })
  })
})
