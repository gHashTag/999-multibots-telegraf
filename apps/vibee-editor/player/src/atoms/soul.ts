import { atom } from 'jotai'
import { RENDER_URL } from '../config'
import { authHeaders } from '../lib/apiFetch'
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

/*
 * THE ONE DOOR, NOT A COPY OF IT.
 *
 * This screen built its own headers: the Telegram signature, or a dev agent
 * key -- and nothing else. Opened in a browser, where there is no signature,
 * it sent no identity at all, and the owner's "Save and continue" on the twin
 * form answered "a Telegram signature or an agent key is required" while he
 * was signed in (2026-09-22). authHeaders already knows the order: the
 * signature alone when there is one, the app session when there is not.
 */
/** Вызов инструмента агента через MCP — тот же вход, что у внешних
 *  клиентов (Claude/Codex/Gemini): один реестр инструментов, одна
 *  проверка личности (подпись или ключ), ноль отдельных HTTP-роутов. */
async function callTool<T>(
  name: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  const res = await fetch(`${RENDER_URL}/mcp`, {
    method: 'POST',
    headers: authHeaders(),
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
