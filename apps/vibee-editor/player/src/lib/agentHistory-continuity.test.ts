import { describe, it, expect } from 'vitest'
import {
  shouldAdoptHistory,
  adoptHistory,
  turnsFromResponse,
} from '@/lib/agentHistory'
import type { Message } from '@/atoms/agentChat'

const local: Message[] = [{ id: 'server-42', role: 'user', text: 'hello' }]

describe('authoritative shared history', () => {
  it('adopts empty and shorter valid histories, including deletion elsewhere', () => {
    expect(shouldAdoptHistory({ server: [], local, busy: false })).toBe(true)
    expect(
      shouldAdoptHistory({
        server: [{ id: 42, role: 'user', content: 'hello' }],
        local: [
          ...local,
          { id: 'server-43', role: 'assistant', text: 'deleted' },
        ],
        busy: false,
      })
    ).toBe(true)
  })

  it('never replaces the message ids being patched by an active stream', () => {
    expect(shouldAdoptHistory({ server: [], local, busy: true })).toBe(false)
  })

  it('preserves ids when the window shifts and skips identical history', () => {
    const server = [{ id: 42, role: 'user', content: 'hello' }]
    expect(adoptHistory(server)[0].id).toBe('server-42')
    expect(shouldAdoptHistory({ server, local, busy: false })).toBe(false)
    expect(
      adoptHistory([
        { id: 41, role: 'assistant', content: 'earlier' },
        ...server,
      ])[1].id
    ).toBe('server-42')
  })

  it('retains local attachments and tool details without duplicating bubbles', () => {
    const attachment = {
      id: 'asset-1',
      kind: 'image' as const,
      name: 'cat.jpg',
      mimeType: 'image/jpeg',
      url: 'https://media.example/cat.jpg',
    }
    const current: Message[] = [
      { id: 'u1', role: 'user', text: 'Use this', attachments: [attachment] },
      {
        id: 'a1',
        role: 'assistant',
        text: 'Done',
        tools: [{ name: 'feed_publish', ms: 12 }],
        actions: ['feed'],
      },
    ]
    const restored = adoptHistory(
      [
        {
          id: 50,
          role: 'user',
          content:
            'Use this\n[attached image: cat.jpg; mime=image/jpeg; url=https://media.example/cat.jpg]',
        },
        { id: 51, role: 'assistant', content: 'Done' },
      ],
      current
    )
    expect(restored).toHaveLength(2)
    expect(restored[0]).toMatchObject({
      id: 'server-50',
      text: 'Use this',
      attachments: [attachment],
    })
    expect(restored[1].tools).toEqual([{ name: 'feed_publish', ms: 12 }])
    expect(restored[1].actions).toEqual(['feed'])
  })

  it('restores another device attachment into a real attachment bubble', () => {
    const [message] = adoptHistory([
      {
        id: 50,
        role: 'user',
        content:
          'Use this\n[attached image: cat.jpg; mime=image/jpeg; url=https://media.example/cat.jpg]',
      },
    ])
    expect(message.text).toBe('Use this')
    expect(message.attachments).toHaveLength(1)
    expect(message.attachments?.[0]).toMatchObject({
      kind: 'image',
      url: 'https://media.example/cat.jpg',
    })
  })

  it('distinguishes malformed/unavailable history from an authoritative empty response', () => {
    expect(turnsFromResponse({ ok: true, messages: [] })).toEqual([])
    for (const body of [
      null,
      {},
      { ok: false, messages: [] },
      { messages: 'bad' },
      { messages: [null] },
    ]) {
      expect(turnsFromResponse(body)).toBeNull()
    }
    expect(
      turnsFromResponse({
        ok: true,
        messages: [{ id: 42, role: 'user', content: 'hello', surface: 'bot' }],
      })
    ).toEqual([{ id: 42, role: 'user', content: 'hello', surface: 'bot' }])
  })
})
