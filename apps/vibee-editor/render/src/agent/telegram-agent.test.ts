import { describe, expect, it, vi } from 'vitest'
import {
  parseTelegramAgentTextUpdate,
  processTelegramAgentTextUpdate,
  sendTelegramAgentWelcome,
} from './telegram-agent'

const privateText = {
  update_id: 101,
  message: {
    message_id: 55,
    from: { id: 42, is_bot: false },
    chat: { id: 42, type: 'private' },
    text: 'Собери контент-план',
  },
}

describe('Telegram transport for the Trinity agent', () => {
  it('accepts ordinary private text but not commands, groups, or bots', () => {
    expect(parseTelegramAgentTextUpdate(privateText)).toMatchObject({
      telegramId: '42',
      chatId: 42,
      text: 'Собери контент-план',
      externalId: 'telegram:101:55',
    })
    expect(
      parseTelegramAgentTextUpdate({
        ...privateText,
        message: { ...privateText.message, text: '/start' },
      })
    ).toBeNull()
    expect(
      parseTelegramAgentTextUpdate({
        ...privateText,
        message: {
          ...privateText.message,
          chat: { id: -1, type: 'group' },
        },
      })
    ).toBeNull()
    expect(
      parseTelegramAgentTextUpdate({
        ...privateText,
        message: {
          ...privateText.message,
          from: { id: 42, is_bot: true },
        },
      })
    ).toBeNull()
  })

  it('persists once, streams a native draft, then stores and sends the final reply', async () => {
    const append = vi
      .fn()
      .mockResolvedValueOnce({ inserted: true, message: { id: '1' } })
      .mockResolvedValueOnce({ inserted: true, message: { id: '2' } })
    const load = vi.fn().mockResolvedValue([
      {
        id: '1',
        telegramId: '42',
        channel: 'telegram',
        externalId: 'telegram:101:55',
        role: 'user',
        content: 'Собери контент-план',
        metadata: {},
        createdAt: '2026-09-01T10:00:00.000Z',
      },
    ])
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: true }),
    })
    const runner = async function* () {
      yield { ['тип']: 'текст' as const, ['текст']: 'Готовлю ' }
      yield {
        ['тип']: 'инструмент' as const,
        ['имя']: 'content_plan_prepare',
        ['аргументы']: '{}',
      }
      yield {
        ['тип']: 'результат' as const,
        ['имя']: 'content_plan_prepare',
        ['мс']: 12,
        ['значение']: null,
      }
      yield { ['тип']: 'текст' as const, ['текст']: 'план.' }
      yield { ['тип']: 'готово' as const, ['витков']: 2 }
    }

    const result = await processTelegramAgentTextUpdate(privateText, {
      pool: { query: vi.fn() },
      botToken: 'test-token',
      appendMessage: append,
      findMessage: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          content: 'Готовлю план.',
          metadata: {
            tools: ['content_plan_prepare'],
            delivery: 'pending',
            next_chunk: 0,
            total_chunks: 1,
            telegram_message_ids: [],
          },
        }),
      loadHistory: load,
      replaceMetadata: vi.fn(),
      runAgent: runner,
      fetchFn,
      now: () => 1_788_222_000_000,
    })

    expect(result).toBe('handled')
    expect(load).toHaveBeenCalledWith(expect.anything(), '42', 40)
    expect(append).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({
        telegramId: '42',
        channel: 'telegram',
        externalId: 'telegram:101:55',
        role: 'user',
      })
    )
    expect(append).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({
        telegramId: '42',
        channel: 'telegram',
        externalId: 'telegram-reply:101:55',
        role: 'assistant',
        content: 'Готовлю план.',
        metadata: {
          tools: ['content_plan_prepare'],
          delivery: 'pending',
          next_chunk: 0,
          total_chunks: 1,
          telegram_message_ids: [],
        },
      })
    )
    const methods = fetchFn.mock.calls.map(([url]) =>
      String(url).split('/').pop()
    )
    expect(methods).toContain('sendMessageDraft')
    expect(methods).toContain('sendMessage')
    const finalCall = fetchFn.mock.calls.find(([url]) =>
      String(url).endsWith('/sendMessage')
    )
    expect(JSON.parse(String(finalCall?.[1]?.body))).toMatchObject({
      chat_id: 42,
      text: 'Готовлю план.',
    })
  })

  it('does not generate or send when Telegram retries a completed update', async () => {
    const append = vi.fn().mockResolvedValue({ inserted: false, message: null })
    const fetchFn = vi.fn()
    const runner = vi.fn()
    const result = await processTelegramAgentTextUpdate(privateText, {
      pool: { query: vi.fn() },
      botToken: 'test-token',
      appendMessage: append,
      findMessage: vi.fn().mockResolvedValue({
        content: 'Done',
        metadata: { delivery: 'sent' },
      }),
      loadHistory: vi.fn(),
      runAgent: runner as never,
      fetchFn,
    })

    expect(result).toBe('duplicate')
    expect(runner).not.toHaveBeenCalled()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('recovers a user row that exists without an assistant reply', async () => {
    const append = vi
      .fn()
      .mockResolvedValueOnce({ inserted: false, message: null })
      .mockResolvedValueOnce({ inserted: true, message: { id: '2' } })
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    })
    const runner = vi.fn()
    const find = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        content:
          'Предыдущий запуск агента прервался. Отправьте задачу новым сообщением.',
        metadata: {
          delivery: 'pending',
          next_chunk: 0,
          total_chunks: 1,
          telegram_message_ids: [],
          interrupted: true,
        },
      })

    const result = await processTelegramAgentTextUpdate(privateText, {
      pool: { query: vi.fn() },
      botToken: 'test-token',
      appendMessage: append,
      findMessage: find,
      loadHistory: vi.fn(),
      replaceMetadata: vi.fn(),
      runAgent: runner as never,
      fetchFn,
    })

    expect(result).toBe('handled')
    expect(runner).not.toHaveBeenCalled()
    expect(append).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({
        role: 'assistant',
        metadata: expect.objectContaining({ interrupted: true }),
      })
    )
    expect(
      fetchFn.mock.calls.some(([url]) => String(url).endsWith('/sendMessage'))
    ).toBe(true)
  })

  it('resumes Telegram delivery from the first unsent chunk', async () => {
    const longReply = `${'a'.repeat(4_096)}${'b'.repeat(100)}`
    const replaceMetadata = vi.fn()
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 22 } }),
    })
    const result = await processTelegramAgentTextUpdate(privateText, {
      pool: { query: vi.fn() },
      botToken: 'test-token',
      appendMessage: vi
        .fn()
        .mockResolvedValue({ inserted: false, message: null }),
      findMessage: vi.fn().mockResolvedValue({
        content: longReply,
        metadata: {
          delivery: 'pending',
          next_chunk: 1,
          total_chunks: 2,
          telegram_message_ids: [11],
        },
      }),
      replaceMetadata,
      runAgent: vi.fn() as never,
      fetchFn,
    })

    expect(result).toBe('handled')
    const sends = fetchFn.mock.calls.filter(([url]) =>
      String(url).endsWith('/sendMessage')
    )
    expect(sends).toHaveLength(1)
    expect(JSON.parse(String(sends[0]?.[1]?.body)).text).toBe('b'.repeat(100))
    expect(replaceMetadata).toHaveBeenCalledWith(
      expect.anything(),
      '42',
      'telegram',
      'telegram-reply:101:55',
      expect.objectContaining({
        delivery: 'sent',
        next_chunk: 2,
        telegram_message_ids: [11, 22],
      })
    )
  })

  it('answers /start without buttons or a model call', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: true }),
    })
    const handled = await sendTelegramAgentWelcome(
      {
        ...privateText,
        message: { ...privateText.message, text: '/start invite' },
      },
      { botToken: 'test-token', fetchFn }
    )

    expect(handled).toBe(true)
    const body = JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))
    expect(body.text).toContain('Просто напишите задачу')
    expect(body).not.toHaveProperty('reply_markup')
  })
})
