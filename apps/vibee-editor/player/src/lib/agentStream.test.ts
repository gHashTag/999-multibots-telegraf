/**
 * Сборка ответа агента из потока.
 *
 * ЗАЧЕМ ТЕСТ. Агент за один ответ говорит НЕСКОЛЬКО раз: до вызова
 * инструмента и после. Сервер шлёт куски как обычные дельты, без границ.
 * Живой прод склеивал их встык — «…и сразу нарисую.Кота прямо сейчас не
 * выйдет». Ошибка невидима для типов и для сборки: строка сложилась со
 * строкой, всё законно. Поймать её может только проверка результата.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/apiFetch', () => ({ authHeaders: () => new Headers() }))
vi.mock('@/config', () => ({ API_BASE: '' }))

import { editorStore } from '@/atoms/Provider'
import { agentDraftAtom, agentMessagesAtom } from '@/atoms/agentChat'
import {
  clearAgentHistory,
  hydrateAgentHistory,
  resetAgentLocalSession,
  switchAgentOwnerSession,
  sendToAgent,
} from '@/lib/agentStream'

/** Отдаёт готовые NDJSON-строки так, как их отдаёт сервер. */
function поток(строки: string[]) {
  const байты = new TextEncoder().encode(строки.map(s => `${s}\n`).join(''))
  let отдано = false
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: async () =>
          отдано
            ? { done: true, value: undefined }
            : ((отдано = true), { done: false, value: байты }),
      }),
    },
  }
}

const ответАгента = () => {
  const все = editorStore.get(agentMessagesAtom)
  return все.filter(m => m.role === 'assistant').at(-1)
}

describe('sendToAgent: сборка текста', () => {
  beforeEach(() => {
    resetAgentLocalSession()
  })

  it('ставит абзац между репликами вокруг инструмента', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        поток([
          '{"тип":"текст","текст":"Сейчас проверю и сразу нарисую."}',
          '{"тип":"инструмент","имя":"providers_status"}',
          '{"тип":"результат","имя":"providers_status","мс":12}',
          '{"тип":"текст","текст":"Кота прямо сейчас не выйдет."}',
        ])
      )
    )
    await sendToAgent('нарисуй кота')

    const t = ответАгента()?.text || ''
    expect(t).not.toContain('нарисую.Кота')
    expect(t).toContain('нарисую.\n\nКота')
  })

  it('внутри одной реплики дельты клеятся встык, без лишних переносов', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        поток([
          '{"тип":"текст","текст":"Кот "}',
          '{"тип":"текст","текст":"готов"}',
          '{"тип":"текст","текст":"."}',
        ])
      )
    )
    await sendToAgent('нарисуй кота')

    expect(ответАгента()?.text).toBe('Кот готов.')
  })

  it('не начинает ответ с пустой строки, если инструмент вызван первым', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        поток([
          '{"тип":"инструмент","имя":"my_balance"}',
          '{"тип":"результат","имя":"my_balance","мс":9}',
          '{"тип":"текст","текст":"Баланс 0."}',
        ])
      )
    )
    await sendToAgent('сколько у меня токенов')

    expect(ответАгента()?.text).toBe('Баланс 0.')
  })

  it('посылает только новый текст и idempotency id, а не client-owned history', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        поток(['{"тип":"текст","текст":"Ок"}']) // cyrillic-ok: existing test helper
    )
    vi.stubGlobal('fetch', fetchMock)

    await sendToAgent('новый ход')

    const [, options] = fetchMock.mock.calls[0]
    const body = JSON.parse(String(options?.body))
    expect(body.message).toBe('новый ход')
    expect(body.client_message_id).toMatch(/^mini:/)
    expect(body).not.toHaveProperty('messages')
    expect(body).not.toHaveProperty('telegramId')
  })

  it('восстанавливает общую Telegram + Mini App историю с сервера', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          messages: [
            {
              id: '11',
              role: 'user',
              content: 'Сообщение из Telegram',
              channel: 'telegram',
              created_at: '2026-09-01T10:00:00.000Z',
            },
            {
              id: '12',
              role: 'assistant',
              content: 'Ответ агента',
              channel: 'telegram',
              created_at: '2026-09-01T10:00:01.000Z',
              metadata: { tools: ['feed_stats'] },
            },
          ],
        }),
      }))
    )

    await hydrateAgentHistory(true)

    expect(editorStore.get(agentMessagesAtom)).toEqual([
      expect.objectContaining({
        id: 'server:11',
        role: 'user',
        text: 'Сообщение из Telegram',
        channel: 'telegram',
      }),
      expect.objectContaining({
        id: 'server:12',
        role: 'assistant',
        text: 'Ответ агента',
        channel: 'telegram',
        tools: [{ name: 'feed_stats' }],
      }),
    ])
  })

  it('при успешной пустой истории очищает stale локальную копию', async () => {
    editorStore.set(agentMessagesAtom, [
      { id: 'stale', role: 'user', text: 'уже удалённый разговор' },
    ])
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ messages: [] }) }))
    )

    await hydrateAgentHistory(true)

    expect(editorStore.get(agentMessagesAtom)).toEqual([])
  })

  it('does not replay an incomplete Mini App turn during hydration', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'GET') {
          return {
            ok: true,
            json: async () => ({
              messages: [
                {
                  id: '20',
                  external_id: 'mini:pending-turn',
                  role: 'user',
                  content: 'Continue my plan',
                  channel: 'mini_app',
                  created_at: '2026-09-01T10:00:00.000Z',
                },
              ],
            }),
          }
        }
        throw new Error('hydration must not replay the model')
      }
    )
    vi.stubGlobal('fetch', fetchMock)

    await hydrateAgentHistory(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(editorStore.get(agentMessagesAtom)).toEqual([
      expect.objectContaining({
        role: 'user',
        text: 'Continue my plan',
        externalId: 'mini:pending-turn',
      }),
    ])
  })

  it('discards owner A hydration after the local session is reset', async () => {
    let resolveResponse: ((value: unknown) => void) | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise(resolve => {
            resolveResponse = resolve
          })
      )
    )
    const hydration = hydrateAgentHistory(true)
    editorStore.set(agentDraftAtom, 'private draft')
    resetAgentLocalSession()
    resolveResponse?.({
      ok: true,
      json: async () => ({
        messages: [
          {
            id: 'old-owner',
            role: 'user',
            content: 'private history',
            channel: 'telegram',
            created_at: '2026-09-01T10:00:00.000Z',
          },
        ],
      }),
    })
    await hydration

    expect(editorStore.get(agentMessagesAtom)).toEqual([])
    expect(editorStore.get(agentDraftAtom)).toBe('')
  })

  it('preserves an active same-owner session across a route remount', () => {
    switchAgentOwnerSession('owner-remount')
    editorStore.set(agentMessagesAtom, [
      { id: 'live', role: 'assistant', text: 'still streaming' },
    ])

    expect(switchAgentOwnerSession('owner-remount')).toBe(false)
    expect(editorStore.get(agentMessagesAtom)).toEqual([
      { id: 'live', role: 'assistant', text: 'still streaming' },
    ])
  })

  it('does not let a delayed clear from owner A erase owner B', async () => {
    let resolveDelete: ((value: unknown) => void) | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise(resolve => {
            resolveDelete = resolve
          })
      )
    )
    const pendingClear = clearAgentHistory()
    resetAgentLocalSession()
    editorStore.set(agentMessagesAtom, [
      { id: 'owner-b', role: 'assistant', text: 'private B history' },
    ])
    resolveDelete?.({ ok: true })

    await expect(pendingClear).resolves.toBe(true)
    expect(editorStore.get(agentMessagesAtom)).toEqual([
      { id: 'owner-b', role: 'assistant', text: 'private B history' },
    ])
  })
})
