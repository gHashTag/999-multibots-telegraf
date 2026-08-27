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

vi.mock('@/lib/apiFetch', () => ({ authHeaders: () => ({}) }))
vi.mock('@/config', () => ({ API_BASE: '' }))

import { editorStore } from '@/atoms/Provider'
import { agentMessagesAtom } from '@/atoms/agentChat'
import { sendToAgent } from '@/lib/agentStream'

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
    editorStore.set(agentMessagesAtom, [])
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
})
