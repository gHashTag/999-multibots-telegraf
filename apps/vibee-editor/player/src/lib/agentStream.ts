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
import { agentMessagesAtomFor } from '@/atoms/agentChat'
import type {
  AgentAttachment,
  Message,
  MessagesAtom,
  SendCard,
} from '@/atoms/agentChat'
import { API_BASE } from '@/config'
import { authHeaders } from '@/lib/apiFetch'
import { reportClientError } from '@/lib/clientErrorBeacon'
import { markEmbedSignInNeeded } from '@/lib/embedGuest'

/**
 * WHICH CONVERSATIONS ARE ANSWERING RIGHT NOW (owner, 2026-09-26: "so I can
 * keep several chats going").
 *
 * This used to be one boolean for the whole app: while the RTL engineer
 * answered, a question to the blogger waited in the queue behind it. Each
 * conversation now has its own stream, its own queue and its own stop; the
 * server already ran turns side by side. In an atom, not useState: it
 * outlives the page.
 */
export const agentBusyThreadsAtom = atom<string[]>([])

/** Anything answering anywhere -- for places that only need "is it busy". */
export const agentBusyAtom = atom(get => get(agentBusyThreadsAtom).length > 0)

/** One stream per conversation, and the handle that stops it. */
const inFlight = new Map<string, AbortController>()

function publishBusy(): void {
  editorStore.set(agentBusyThreadsAtom, [...inFlight.keys()])
}

function patchIn(
  thread: MessagesAtom,
  agentId: string,
  fn: (m: Message) => Message
): void {
  editorStore.set(thread, prev => prev.map(m => (m.id === agentId ? fn(m) : m)))
}

/**
 * WHICH THREAD. `client` is the lead's Telegram id when the person is talking
 * ABOUT a client on `/crm/:clientId/chat`; absent, it is their own thread and
 * the request looks exactly as it did before this option existed.
 */
/** The stream's proposal, narrowed; anything malformed is no card at all. */
export function toSendCard(raw: unknown): SendCard | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = typeof r.id === 'string' ? r.id : ''
  const secret = typeof r.secret === 'string' ? r.secret : ''
  if (!id || !secret) return null
  const m = r.media as Record<string, unknown> | undefined
  let media: SendCard['media']
  if (m && typeof m === 'object') {
    if (m.kind === 'album' && Array.isArray(m.urls))
      media = { kind: 'album', urls: m.urls.map(String) }
    else if (typeof m.url === 'string')
      media =
        m.kind === 'document'
          ? {
              kind: 'document',
              url: m.url,
              fileName: typeof m.fileName === 'string' ? m.fileName : undefined,
            }
          : {
              kind: (['photo', 'video', 'voice', 'video_note'].includes(
                String(m.kind)
              )
                ? m.kind
                : 'photo') as 'photo',
              url: m.url,
            }
  }
  return {
    id,
    secret,
    action: String(r.action ?? 'send'),
    target: String(r.target ?? ''),
    display: typeof r.display === 'string' ? r.display : undefined,
    what: typeof r.what === 'string' ? r.what : undefined,
    media,
    expiresAt: Number.isFinite(Number(r.expiresAt))
      ? Number(r.expiresAt)
      : undefined,
    state: 'waiting',
  }
}

/**
 * Send or drop a prepared message, from the app itself -- the same doors the
 * bot's buttons use (/api/tg/proposal/confirm and /cancel), authorised by the
 * card's one-time secret AND the caller's own signature.
 */
export async function answerSendCard(
  card: SendCard,
  send: boolean
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(
      `${API_BASE}/api/tg/proposal/${send ? 'confirm' : 'cancel'}`,
      {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ id: card.id, secret: card.secret }),
      }
    )
    const j = (await r.json().catch(() => ({}))) as {
      ok?: boolean
      error?: string
    }
    return r.ok && j.ok !== false
      ? { ok: true }
      : { ok: false, error: j.error || `HTTP ${r.status}` }
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) }
  }
}

export interface SendOptions {
  client?: string | null
  /** A live specialist from the labour market. */
  agent?: string | null
  /** One of several conversations with self or a specialist (never a client). */
  conversation?: string | null
}

/**
 * The conversation a send belongs to, as one key: the same names as the
 * server's threads (render conversation.ts), so the two are read alike. A
 * client's thread is the client's whoever helps in it, and it does not split.
 */
export function threadKeyOf(options: SendOptions = {}): string {
  if (options.client) return `client:${options.client}`
  const base = options.agent ? `agent:${options.agent}` : 'self'
  return options.conversation ? `${base}~${options.conversation}` : base
}

/** Is this conversation answering -- or, with no key, any conversation. */
export function isAgentBusy(threadKey?: string): boolean {
  return threadKey === undefined ? inFlight.size > 0 : inFlight.has(threadKey)
}

/**
 * STOP. The person pressed Stop: the stream is cut, the server sees the
 * socket close and starts nothing new (routes.ts `gone`), and what was
 * already written stays on screen with a note. The lines queued behind it
 * are dropped too -- "stop" that let the next queued task start at once
 * would not be a stop.
 */
export function stopAgent(threadKey: string): void {
  editorStore.set(agentQueueAtom, q =>
    q.filter(m => threadKeyOf(m.options) !== threadKey)
  )
  inFlight.get(threadKey)?.abort()
}

/**
 * MESSAGES WRITTEN WHILE THE AGENT IS STILL ANSWERING.
 *
 * Owner, 2026-09-24: the input must not lock while the agent works; what is
 * written meanwhile should wait in a queue and go when the agent is ready.
 * The composer used to be disabled for the whole answer, so a thought that
 * came mid-answer was either lost or typed into a closed field.
 *
 * The queue lives here, next to the stream, for the same reason the stream
 * does: it outlives the page. Each item remembers its own thread (client /
 * specialist), so a line queued in one conversation never goes into another.
 * It is sent strictly in order, one answer at a time, and every item stays
 * removable until it leaves.
 */
export interface QueuedMessage {
  id: string
  text: string
  attachments: AgentAttachment[]
  options: SendOptions
}

export const agentQueueAtom = atom<QueuedMessage[]>([])

let queueSeq = 0

/** Send now if the agent is free, otherwise put it at the end of the queue. */
export function sendOrQueue(
  text: string,
  attachments: AgentAttachment[] = [],
  options: SendOptions = {}
): 'sent' | 'queued' | 'empty' {
  if (!text.trim() && attachments.length === 0) return 'empty'
  const key = threadKeyOf(options)
  const waiting = editorStore
    .get(agentQueueAtom)
    .some(q => threadKeyOf(q.options) === key)
  if (!inFlight.has(key) && !waiting) {
    void sendToAgent(text, attachments, options)
    return 'sent'
  }
  editorStore.set(agentQueueAtom, q => [
    ...q,
    { id: `q${Date.now()}-${++queueSeq}`, text, attachments, options },
  ])
  // A queue with a free conversation (e.g. the page came back after the
  // answer ended) must not sit waiting for an answer that will never come.
  if (!inFlight.has(key)) drainQueue(key)
  return 'queued'
}

export function removeQueued(id: string): void {
  editorStore.set(agentQueueAtom, q => q.filter(m => m.id !== id))
}

/**
 * Send the first queued line of a conversation, if that conversation is
 * free. With no key, every conversation with something waiting gets its turn.
 */
export function drainQueue(threadKey?: string): void {
  const queue = editorStore.get(agentQueueAtom)
  const keys =
    threadKey === undefined
      ? [...new Set(queue.map(q => threadKeyOf(q.options)))]
      : [threadKey]
  for (const key of keys) {
    if (inFlight.has(key)) continue
    const next = editorStore
      .get(agentQueueAtom)
      .find(q => threadKeyOf(q.options) === key)
    if (!next) continue
    editorStore.set(agentQueueAtom, q => q.filter(m => m.id !== next.id))
    void sendToAgent(next.text, next.attachments, next.options)
  }
}

export function messageContentForAgent(message: Message): string {
  const oneLine = (value: string, limit: number) =>
    value
      .replace(/[\r\n[\]]+/g, ' ')
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
  attachments: AgentAttachment[] = [],
  options: SendOptions = {}
): Promise<void> {
  const trimmed = text.trim()
  const key = threadKeyOf(options)
  if ((!trimmed && attachments.length === 0) || inFlight.has(key)) return
  const stop = new AbortController()
  inFlight.set(key, stop)
  publishBusy()
  const client = options.client || null
  const marketplaceAgent = options.agent || null
  const conversation = client ? null : options.conversation || null
  const thread = agentMessagesAtomFor(client, marketplaceAgent, conversation)
  const patch = (agentId: string, fn: (m: Message) => Message) =>
    patchIn(thread, agentId, fn)

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
  const history = [...editorStore.get(thread), userMsg]
    .filter(m => m.id !== 'welcome')
    .map(m => ({ role: m.role, content: messageContentForAgent(m) }))

  editorStore.set(thread, prev => [...prev, userMsg, agentMsg])

  /**
   * A network drop before the first byte is retried once. 08.09.2026 the
   * render container was replaced mid-conversation (SIGTERM, ~5 min until the
   * next one answered) and the person saw "Network unavailable: TypeError:
   * Load failed" twice with no explanation; a second attempt a few seconds
   * later is what they would do by hand. Once text has arrived the stream is
   * not retried: the answer would be sent twice.
   */
  const MAX_ATTEMPTS = 2
  const startedAt = Date.now()
  let receivedText = false
  /**
   * TURN ID, SENT AS THE STREAM'S FIRST EVENT (`chat.ts`, `runAgent`).
   *
   * The server logs the start and end of this same turn under one
   * structured line (`[agent:turn]`), and until now nothing linked a
   * browser-side error report to that specific server log line -- matching
   * them up meant cross-referencing timestamp and telegram_id by hand. The
   * id we're sent here goes into `reportClientError` below.
   */
  let turnId: string | undefined
  const attempt = async (): Promise<void> => {
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
      signal: stop.signal,
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
        // Only when talking about a client: the key is absent otherwise, so
        // the self thread's request body is byte-for-byte what it was.
        ...(client ? { client } : {}),
        ...(marketplaceAgent ? { agent: marketplaceAgent } : {}),
        ...(conversation ? { conversation } : {}),
      }),
    })
    if (!res.ok || !res.body) {
      // In the game's TRI frame a refused credential means "sign in", and the
      // route gate swaps the chat for the sign-in panel (lib/embedGuest.ts).
      if (res.status === 401) markEmbedSignInNeeded()
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
        if (kind === 'ход') {
          turnId = String(ev['id'] || '') || undefined
        } else if (kind === 'размышление') {
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
          if (chunk) {
            былТекст = true
            receivedText = true
          }
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
        } else if (kind === 'proposal') {
          // A message prepared for somebody else, waiting for the press:
          // shown under this answer with Send / Cancel (SendCardView.tsx).
          const card = toSendCard(ev['proposal'])
          if (card) patch(agentId, m => ({ ...m, sendCard: card }))
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
  }
  try {
    for (let n = 1; n <= MAX_ATTEMPTS; n++) {
      try {
        await attempt()
        break
      } catch (e) {
        const networkDrop = e instanceof TypeError && !stop.signal.aborted
        if (networkDrop && !receivedText && n < MAX_ATTEMPTS) {
          patch(agentId, m => ({
            ...m,
            text: 'Соединение прервалось (сеть или обновление сервера), повторяю…',
          }))
          await new Promise(r => setTimeout(r, 2500))
          continue
        }
        throw e
      }
    }
  } catch (e) {
    if (stop.signal.aborted) {
      // The person's own Stop is not a failure: nothing to report, and what
      // had arrived stays, marked as cut short.
      patch(agentId, m => ({
        ...m,
        text: m.text ? `${m.text}\n\n⏹ Остановлено.` : '⏹ Остановлено.', // cyrillic-ok: shown to the person
        stopped: true,
      }))
      return
    }
    const detail = String(e).slice(0, 160)
    patch(agentId, m => ({
      ...m,
      text:
        (receivedText && m.text ? `${m.text}\n\n` : '') +
        `Не удалось связаться с сервером: ${detail}. Нажмите «Повтори» через минуту.`,
    }))
    reportClientError({
      kind: 'agent_stream_failed',
      message: detail,
      context: `elapsedMs=${Date.now() - startedAt} receivedText=${receivedText} turn=${turnId ?? 'none'}`,
    })
  } finally {
    inFlight.delete(key)
    publishBusy()
    // The next message written in this conversation meanwhile, if any.
    queueMicrotask(() => drainQueue(key))
  }
}
