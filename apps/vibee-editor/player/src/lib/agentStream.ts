/**
 * Разговор с агентом живёт ВНЕ React.
 *
 * ЗАЧЕМ. Владелец спросил прямо: «чтобы при переключении между табами агент
 * работал нативно в бэкграунде — это реально?». Да, но не там, где поток жил
 * раньше. Запрос выполнялся внутри `pages/Chat.tsx`: уход на другую вкладку
 * размонтирует страницу, а вместе с ней умирает и `fetch`. Человек писал
 * задание, переключался посмотреть ленту — и возвращался к оборванному
 * ответу, даже когда сервер честно досчитал.
 *
 * Здесь модуль-одиночка: он не принадлежит ни одному компоненту, поэтому
 * размонтирование его не касается. Состояние он пишет прямо в общий стор
 * jotai, а страница только читает — то есть при возврате она подхватывает
 * уже идущий поток на том месте, до которого он дошёл.
 *
 * ЧЕГО ЭТО НЕ ДАЁТ. Это фон в пределах ЖИВОЙ страницы, а не системный
 * фоновый процесс: если Telegram выгрузит мини-апп из памяти или человек
 * перезагрузит окно, запрос всё равно оборвётся. Сохранится только то, что
 * уже успело записаться в историю. Обещать больше нечестно — Service Worker
 * тут не поможет, ответ идёт потоком в открытое соединение.
 */
import { atom } from 'jotai'
import { editorStore } from '@/atoms/Provider'
import { agentMessagesAtom } from '@/atoms/agentChat'
import type { Message } from '@/atoms/agentChat'
import { API_BASE } from '@/config'
import { authHeaders } from '@/lib/apiFetch'

/** Идёт ли ответ прямо сейчас. В атоме, а не в useState: переживает уход. */
export const agentBusyAtom = atom(false)

/** Не даём запустить второй поток поверх первого. */
let inFlight = false

function patch(agentId: string, fn: (m: Message) => Message): void {
  editorStore.set(agentMessagesAtom, prev =>
    prev.map(m => (m.id === agentId ? fn(m) : m))
  )
}

export function isAgentBusy(): boolean {
  return inFlight
}

/**
 * Отправить сообщение агенту. Возвращает промис, но ЖДАТЬ его не обязательно:
 * весь результат попадает в стор, а страница читает стор.
 */
export async function sendToAgent(text: string): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed || inFlight) return
  inFlight = true
  editorStore.set(agentBusyAtom, true)

  const userMsg: Message = { id: `u${Date.now()}`, role: 'user', text: trimmed }
  const agentId = `a${Date.now()}`
  const agentMsg: Message = {
    id: agentId,
    role: 'assistant',
    text: '',
    thinking: '',
    tools: [],
  }

  // История для сервера — из уже показанных сообщений плюс новое.
  const history = [...editorStore.get(agentMessagesAtom), userMsg]
    .filter(m => m.id !== 'welcome')
    .map(m => ({ role: m.role, content: m.text }))

  editorStore.set(agentMessagesAtom, prev => [...prev, userMsg, agentMsg])

  try {
    // Личность: обычно подпись Telegram (authHeaders ставит
    // X-Telegram-Init-Data). В DEV на localhost подписи нет — тогда, если
    // задан VITE_AGENT_KEY, идём ключом агента. Ветка ТОЛЬКО для
    // import.meta.env.DEV: ключ в прод-сборку не попадает.
    const headers = authHeaders()
    const devKey = import.meta.env.DEV
      ? (import.meta.env.VITE_AGENT_KEY as string | undefined)
      : undefined
    if (devKey && !headers.has('X-Telegram-Init-Data')) {
      headers.set('X-Agent-Key', devKey)
    }
    const res = await fetch(`${API_BASE}/api/agent/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ messages: history }),
    })
    if (!res.ok || !res.body) {
      // Код И тело: тело — единственное место, где сервер объясняет причину.
      const body = await res.text().catch(() => '')
      patch(agentId, m => ({
        ...m,
        text: `Не получилось: ${res.status}. ${body.slice(0, 200)}`,
      }))
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        let ev: Record<string, unknown>
        try {
          ev = JSON.parse(line)
        } catch {
          continue
        }
        const kind = ev['тип']
        if (kind === 'размышление') {
          patch(agentId, m => ({
            ...m,
            thinking: (m.thinking || '') + String(ev['текст'] || ''),
          }))
        } else if (kind === 'текст') {
          patch(agentId, m => ({ ...m, text: m.text + String(ev['текст'] || '') }))
        } else if (kind === 'инструмент') {
          patch(agentId, m => ({
            ...m,
            tools: [...(m.tools || []), { name: String(ev['имя']) }],
          }))
        } else if (kind === 'результат') {
          const nm = String(ev['имя'])
          const ms = Number(ev['мс'])
          patch(agentId, m => ({
            ...m,
            tools: (m.tools || []).map(tc =>
              tc.name === nm && tc.ms == null ? { ...tc, ms } : tc
            ),
          }))
        } else if (kind === 'ошибка') {
          patch(agentId, m => ({
            ...m,
            text: m.text + `\n\n⚠️ ${String(ev['текст'] || '')}`,
          }))
        }
      }
    }
  } catch (e) {
    patch(agentId, m => ({
      ...m,
      text: `Сеть недоступна: ${String(e).slice(0, 160)}`,
    }))
  } finally {
    inFlight = false
    editorStore.set(agentBusyAtom, false)
  }
}
