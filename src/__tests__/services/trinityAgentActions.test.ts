import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn() } }))
import { спроситьАгента as askAgent } from '@/services/trinityAgent' // cyrillic-ok: existing API

function event(destination: string) {
  return {
    ['тип']: 'результат',
    ['имя']: 'open_app',
    ['значение']: {
      action: { type: 'open_mini_app', destination },
    },
  }
}

function mockStream(events: unknown[]) {
  const bytes = new TextEncoder().encode(
    events.map(item => JSON.stringify(item)).join('\n')
  )
  const body = new ReadableStream({
    start(controller) {
      for (let index = 0; index < bytes.length; index += 11) {
        controller.enqueue(bytes.slice(index, index + 11))
      }
      controller.close()
    },
  })
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [] })))
    .mockResolvedValueOnce(new Response(body))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('agent tool result actions over NDJSON', () => {
  beforeEach(() => vi.stubEnv('RENDER_API_KEY', 'unit-test-internal-key'))
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('keeps successful open_app results across chunk and Unicode boundaries', async () => {
    const fetchMock = mockStream([
      { ['тип']: 'текст', ['текст']: 'Готово.' },
      event('video'),
      event('files'),
    ])
    const answer = await askAgent('123456789', 'Open the video editor')
    expect(answer['текст']).toBe('Готово.')
    expect(answer.actions).toEqual([
      { type: 'open_mini_app', destination: 'video' },
      { type: 'open_mini_app', destination: 'files' },
    ])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not mistake text, another tool, a failed result, or an arbitrary URL for a button', async () => {
    mockStream([
      { ...event('video'), ['тип']: 'инструмент' },
      { ...event('video'), ['имя']: 'generate_video' },
      {
        ...event('video'),
        ['значение']: {
          ok: false,
          action: { type: 'open_mini_app', destination: 'video' },
        },
      },
      {
        ...event('video'),
        ['значение']: {
          error: 'failed',
          action: { type: 'open_mini_app', destination: 'video' },
        },
      },
      event('https://evil.example'),
      { ['тип']: 'текст', ['текст']: JSON.stringify(event('video')) },
    ])
    expect((await askAgent('123456789', 'Hello')).actions).toEqual([])
  })

  it('preserves a button-only result for delivery', async () => {
    mockStream([event('plan')])
    const answer = await askAgent('123456789', 'Open my plan')
    expect(answer['текст']).toBe('')
    expect(answer.actions).toEqual([
      { type: 'open_mini_app', destination: 'plan' },
    ])
  })
})
