import { atom } from 'jotai'
import { RENDER_URL } from '../config'
import { getInitData } from '../lib/telegram'
import { getErrorMessage } from '../features/script/utils/errorMessages'
import { languageAtom } from './language'

// ===============================
// Личный SOUL.md человека: кем он себя считает и каким голосом писать
// его посты. Агент читает его в системный промпт; здесь — редактор
// для самого человека (профиль → «Мой SOUL»).
// ===============================

export const soulAtom = atom<string | null>(null)
export const soulLoadedAtom = atom(false)
export const soulSavingAtom = atom(false)
export const soulErrorAtom = atom<string | null>(null)

/** Подпись initData, в DEV — ключ агента (не попадает в прод-сборку). */
function soulHeaders(): Headers {
  const h = new Headers({ 'Content-Type': 'application/json' })
  const initData = getInitData()
  if (initData) {
    h.set('X-Telegram-Init-Data', initData)
    return h
  }
  const devKey = import.meta.env.DEV
    ? (import.meta.env.VITE_AGENT_KEY as string | undefined)
    : undefined
  if (devKey) h.set('X-Agent-Key', devKey)
  return h
}

/** Вызов инструмента агента через MCP — тот же вход, что у внешних
 *  клиентов (Claude/Codex/Gemini): один реестр инструментов, одна
 *  проверка личности (подпись или ключ), ноль отдельных HTTP-роутов. */
async function callTool<T>(
  name: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  const res = await fetch(`${RENDER_URL}/mcp`, {
    method: 'POST',
    headers: soulHeaders(),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || data?.error) {
    const msg = data?.error?.message || `HTTP ${res.status}`
    throw new Error(msg)
  }
  // tools/call отдаёт { content: [{type:'text', text}] , structuredContent }
  return (data?.result?.structuredContent ?? data?.result) as T
}

export const loadSoulAtom = atom(null, async (get, set) => {
  set(soulErrorAtom, null)
  try {
    const r = await callTool<{ есть: boolean; soul?: string }>('soul_get')
    set(soulAtom, r.есть && typeof r.soul === 'string' ? r.soul : null)
    set(soulLoadedAtom, true)
  } catch (e) {
    set(soulErrorAtom, getErrorMessage(e, get(languageAtom)))
    set(soulAtom, null)
    set(soulLoadedAtom, true)
  }
})

/** Сохранить (пустая строка = сбросить через душу-подсказку агента). */
export const saveSoulAtom = atom(
  null,
  // `get` нужен: в catch ниже по нему берётся язык для текста ошибки.
  // Параметр назывался `_get`, и обработчик ошибки САМ падал с
  // ReferenceError — то есть при неудачном сохранении человек не получал
  // никакого сообщения вообще, а промис отклонялся.
  async (get, set, soul: string): Promise<boolean> => {
    set(soulSavingAtom, true)
    set(soulErrorAtom, null)
    try {
      if (!soul.trim()) {
        // Пустой SOUL инструмент отказывается писать (это защита от
        // случайного стирания) — честно сообщаем то же самое.
        throw new Error(
          'Пустой SOUL не сохраняется. Хочешь сбросить — напиши агенту в чате.'
        )
      }
      const r = await callTool<{ сохранено: boolean; причина?: string }>(
        'soul_edit',
        { soul }
      )
      if (!r.сохранено) throw new Error(r.причина || 'агент отказал')
      set(soulAtom, soul)
      return true
    } catch (e) {
      set(soulErrorAtom, getErrorMessage(e, get(languageAtom)))
      return false
    } finally {
      set(soulSavingAtom, false)
    }
  }
)
