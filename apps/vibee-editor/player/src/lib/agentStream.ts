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
import type { AgentAttachment, Message } from '@/atoms/agentChat'
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

export function messageContentForAgent(message: Message): string {
  const oneLine = (value: string, limit: number) =>
    value
      .replace(/[\r\n\[\]]+/g, ' ')
      .trim()
      .slice(0, limit)
  const attachmentLines = (message.attachments ?? []).map(
    attachment =>
      `[attached ${attachment.kind}: ${oneLine(attachment.name, 160)}; mime=${oneLine(attachment.mimeType, 100)}; url=${oneLine(attachment.url, 2_048)}]`
  )
  return [message.text.trim(), ...attachmentLines].filter(Boolean).join('\n')
}

/**
 * Отправить сообщение агенту. Возвращает промис, но ЖДАТЬ его не обязательно:
 * весь результат попадает в стор, а страница читает стор.
 */
export async function sendToAgent(
  text: string,
  attachments: AgentAttachment[] = []
): Promise<void> {
  const trimmed = text.trim()
  if ((!trimmed && attachments.length === 0) || inFlight) return
  inFlight = true
  editorStore.set(agentBusyAtom, true)

  const userMsg: Message = {
    id: `u${Date.now()}`,
    role: 'user',
    text: trimmed || `Прикреплено файлов: ${attachments.length}`,
    attachments: attachments.map(attachment => ({ ...attachment })),
  }
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
    .map(m => ({ role: m.role, content: messageContentForAgent(m) }))

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
      body: JSON.stringify({
        messages: history,
        /*
         * ОТКУДА ПИШЕТ ЧЕЛОВЕК. Разговор общий для бота и мини-аппа, и
         * сервер сохраняет поверхность вместе с репликой: по общей ленте
         * должно быть видно, где именно человек это сказал. Значение
         * сверяется сервером со списком известных — своему клиенту тут тоже
         * не верим на слово.
         */
        surface: 'miniapp',
      }),
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
    patch(agentId, m => ({
      ...m,
      text: `Сеть недоступна: ${String(e).slice(0, 160)}`,
    }))
  } finally {
    inFlight = false
    editorStore.set(agentBusyAtom, false)
  }
}
