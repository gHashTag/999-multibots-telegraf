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
import { agentDraftAtom, agentMessagesAtom } from '@/atoms/agentChat'
import type { Message } from '@/atoms/agentChat'
import { API_BASE } from '@/config'
import { authHeaders } from '@/lib/apiFetch'

/** Идёт ли ответ прямо сейчас. В атоме, а не в useState: переживает уход. */
export const agentBusyAtom = atom(false)

/** Не даём запустить второй поток поверх первого. */
let inFlight = false
let hydrationPromise: Promise<void> | null = null
let sessionGeneration = 0
let hydrationGeneration = 0
let hydrationAbort: AbortController | null = null
let streamAbort: AbortController | null = null
let activeStreamGeneration = 0
let observedOwnerSessionKey: string | null = null

interface ServerHistoryMessage {
  id: string | number
  external_id?: string
  role: 'user' | 'assistant'
  content: string
  channel: 'mini_app' | 'telegram'
  created_at: string
  metadata?: { tools?: unknown }
}

function requestHeaders(): Headers {
  const headers = authHeaders()
  const devKey = import.meta.env.DEV
    ? (import.meta.env.VITE_AGENT_KEY as string | undefined)
    : undefined
  if (devKey && !headers.has('X-Telegram-Init-Data')) {
    headers.set('X-Agent-Key', devKey)
  }
  return headers
}

function serverMessage(message: ServerHistoryMessage): Message | null {
  if (
    (message.role !== 'user' && message.role !== 'assistant') ||
    (message.channel !== 'mini_app' && message.channel !== 'telegram') ||
    typeof message.content !== 'string' ||
    !message.content.trim()
  ) {
    return null
  }
  const rawTools = Array.isArray(message.metadata?.tools)
    ? message.metadata.tools
    : []
  return {
    id: `server:${String(message.id)}`,
    role: message.role,
    text: message.content,
    channel: message.channel,
    createdAt: message.created_at,
    externalId: message.external_id,
    tools: rawTools
      .filter((name): name is string => typeof name === 'string')
      .map(name => ({ name })),
  }
}

/** Rehydrate the owner-scoped transcript shared with @t27ai_bot. */
export async function hydrateAgentHistory(force = false): Promise<void> {
  if (hydrationPromise && !force) return hydrationPromise
  if (force) hydrationAbort?.abort()
  const ownerGeneration = sessionGeneration
  const requestGeneration = ++hydrationGeneration
  const controller = new AbortController()
  hydrationAbort = controller
  const task = (async () => {
    const res = await fetch(`${API_BASE}/api/agent/history`, {
      method: 'GET',
      headers: requestHeaders(),
      signal: controller.signal,
    })
    if (!res.ok) return
    const body = (await res.json().catch(() => null)) as {
      messages?: ServerHistoryMessage[]
    } | null
    const messages = Array.isArray(body?.messages)
      ? body.messages.map(serverMessage).filter((m): m is Message => !!m)
      : []
    // A successful server response is canonical even when it is empty, so a
    // cleared conversation propagates to every device.
    if (
      ownerGeneration === sessionGeneration &&
      requestGeneration === hydrationGeneration &&
      (!inFlight || force)
    ) {
      editorStore.set(agentMessagesAtom, messages)
    }
  })()
    .catch(() => undefined)
    .finally(() => {
      if (hydrationAbort === controller) hydrationAbort = null
      if (hydrationPromise === task) hydrationPromise = null
    })
  hydrationPromise = task
  return task
}

/** Invalidate every response that belongs to the previous browser identity. */
export function resetAgentLocalSession(): void {
  sessionGeneration += 1
  hydrationGeneration += 1
  hydrationAbort?.abort()
  hydrationAbort = null
  streamAbort?.abort()
  streamAbort = null
  hydrationPromise = null
  inFlight = false
  editorStore.set(agentBusyAtom, false)
  editorStore.set(agentMessagesAtom, [])
  editorStore.set(agentDraftAtom, '')
}

/**
 * Returns true only when the verified browser owner actually changed.
 * A route remount with the same owner must not abort a stream that continued
 * while the user visited Feed/Profile.
 */
export function switchAgentOwnerSession(ownerSessionKey: string): boolean {
  if (observedOwnerSessionKey === null) {
    observedOwnerSessionKey = ownerSessionKey
    return false
  }
  if (observedOwnerSessionKey === ownerSessionKey) return false
  observedOwnerSessionKey = ownerSessionKey
  resetAgentLocalSession()
  return true
}

/** Clear only the verified owner's canonical transcript. */
export async function clearAgentHistory(): Promise<boolean> {
  if (inFlight) return false
  const ownerGeneration = sessionGeneration
  const res = await fetch(`${API_BASE}/api/agent/history`, {
    method: 'DELETE',
    headers: requestHeaders(),
  })
  // Logout/login may complete while this DELETE is in flight. Never let an
  // owner-A response erase owner-B state.
  if (!res.ok || ownerGeneration !== sessionGeneration) return false
  resetAgentLocalSession()
  return true
}

function patch(agentId: string, fn: (m: Message) => Message): void {
  if (activeStreamGeneration !== sessionGeneration) return
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
  const ownerGeneration = sessionGeneration
  activeStreamGeneration = ownerGeneration
  const controller = new AbortController()
  streamAbort = controller
  editorStore.set(agentBusyAtom, true)

  const clientMessageId = `mini:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`
  const userMsg: Message = {
    id: clientMessageId,
    role: 'user',
    text: trimmed,
    channel: 'mini_app',
  }
  const agentId = `a${Date.now()}`
  const agentMsg: Message = {
    id: agentId,
    role: 'assistant',
    text: '',
    thinking: '',
    tools: [],
  }

  editorStore.set(agentMessagesAtom, prev => [...prev, userMsg, agentMsg])

  try {
    // Личность: обычно подпись Telegram (authHeaders ставит
    // X-Telegram-Init-Data). В DEV на localhost подписи нет — тогда, если
    // задан VITE_AGENT_KEY, идём ключом агента. Ветка ТОЛЬКО для
    // import.meta.env.DEV: ключ в прод-сборку не попадает.
    const headers = requestHeaders()
    const res = await fetch(`${API_BASE}/api/agent/chat`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        message: trimmed,
        client_message_id: clientMessageId,
      }),
    })
    if (!res.ok || !res.body) {
      // Код И тело: тело — единственное место, где сервер объясняет причину.
      const body = await res.text().catch(() => '')
      if (res.status === 409) {
        await hydrateAgentHistory(true)
      } else {
        patch(agentId, m => ({
          ...m,
          text: `Не получилось: ${res.status}. ${body.slice(0, 200)}`,
        }))
      }
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    // Был ли вызов инструмента с последнего куска текста — см. ниже.
    let послеИнструмента = false
    // Что реально пришло за ответ — чтобы после потока отличить «агент
    // промолчал» от «агент ответил». Без этого пустой ответ и оборванный на
    // пределе витков выглядели одинаково: пустой пузырь без объяснения.
    let былТекст = false
    let былаОшибка = false
    let текстОбрыва = ''
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
          const chunk = String(ev['текст'] || '')
          /**
           * Абзац после инструмента. Агент говорит НЕСКОЛЬКО раз за ответ:
           * до вызова инструмента и после него. Сервер шлёт эти куски как
           * обычные дельты, а мы клеили их встык — и живой ответ выглядел так:
           *
           *   «…и сразу нарисую.Кота прямо сейчас не выйдет, и вот почему»
           *   «…вдруг кот там уже есть, бесплатно:Картинки не работают»
           *
           * Два предложения из разных ходов слипались без пробела, причём
           * ровно в том месте, где человеку важнее всего понять: тут агент
           * сходил и проверил. Разрыв ставим один раз на границе — не на
           * каждой дельте, иначе получим лесенку из пустых строк.
           */
          if (chunk) былТекст = true
          const разрыв = послеИнструмента ? '\n\n' : ''
          послеИнструмента = false
          patch(agentId, m => ({
            ...m,
            text:
              m.text && разрыв && !m.text.endsWith('\n')
                ? m.text + разрыв + chunk
                : m.text + chunk,
          }))
        } else if (kind === 'инструмент') {
          послеИнструмента = true
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
          былаОшибка = true
          patch(agentId, m => ({
            ...m,
            text: m.text + `\n\n⚠️ ${String(ev['текст'] || '')}`,
          }))
        } else if (kind === 'готово') {
          // Сервер шлёт «готово» всегда; при достижении предела витков в нём
          // есть «обрыв» с причиной. Раньше этой ветки не было — и причина
          // обрыва молча терялась, а человек видел, будто агент просто замолк.
          if (ev['обрыв']) текстОбрыва = String(ev['обрыв'])
        }
      }
    }

    // Поток закончился. Если агент не сказал ни слова, не позвал инструмент с
    // ответом и не сообщил об ошибке — это не «успех с пустым пузырём», а
    // молчание. Объясняем его явно, а не оставляем пустоту.
    if (!былТекст && !былаОшибка) {
      const сообщение = текстОбрыва
        ? `Не уложился в шаги: ${текстОбрыва}. Попробуй задачу поменьше.`
        : 'Агент не сформулировал ответ. Повтори вопрос или уточни его.'
      patch(agentId, m => ({ ...m, text: m.text || сообщение }))
    } else if (текстОбрыва) {
      // Текст был, но ответ оборван на пределе — дописываем причину, чтобы
      // человек понимал, почему мысль не закончена.
      patch(agentId, m => ({ ...m, text: `${m.text}\n\n⚠️ ${текстОбрыва}` }))
    }
  } catch (e) {
    if (ownerGeneration === sessionGeneration) {
      patch(agentId, m => ({
        ...m,
        text: `Сеть недоступна: ${String(e).slice(0, 160)}`,
      }))
    }
  } finally {
    if (ownerGeneration === sessionGeneration) {
      inFlight = false
      editorStore.set(agentBusyAtom, false)
    }
    if (streamAbort === controller) streamAbort = null
  }
}
