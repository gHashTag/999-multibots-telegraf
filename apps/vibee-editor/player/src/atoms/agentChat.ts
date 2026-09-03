// ===============================
// Переписка с агентом — вкладка «Агент» (/chat)
// ===============================

import { atom } from 'jotai'

/**
 * ЗАЧЕМ ЭТОТ ФАЙЛ. И переписка, и недописанное сообщение жили в `useState`
 * страницы `pages/Chat.tsx`. Страница размонтируется при любом уходе на другую
 * вкладку — и разговор исчезал вместе с ней. В агента пишут не реплику, а
 * задание: «сделай рилс про то-то, вот такой стиль, вот такой голос». Потерять
 * это дороже, чем любую настройку интерфейса.
 *
 * ИСТОРИЯ. Рядом жил `atoms/chat.ts` — он обслуживал `ChatPanel`, который не
 * импортировался ничем, кроме собственного бочонка. Правка туда была бы
 * декорацией; оба файла удалены. Живая поверхность одна — `pages/Chat.tsx`,
 * и форма сообщения у неё своя: `text`, `thinking`, `tools`.
 */

export interface ToolCall {
  name: string
  /** Сколько инструмент отработал, мс. */
  ms?: number
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** Transport that accepted the message; server history joins both channels. */
  channel?: 'mini_app' | 'telegram'
  /** Server timestamp of the completed message. */
  createdAt?: string
  /** Stable server idempotency key used only to resume an incomplete turn. */
  externalId?: string
  /** Поток размышления модели — сворачиваемый, показывается по желанию. */
  thinking?: string
  tools?: ToolCall[]
}

const MAX_STORED_MESSAGES = 100

const sessionMessagesAtom = atom<Message[]>([])

/** История переписки. Пишется с обрезкой хвоста — свежее важнее старого. */
export const agentMessagesAtom = atom(
  get => get(sessionMessagesAtom),
  (get, set, update: Message[] | ((prev: Message[]) => Message[])) => {
    const prev = get(sessionMessagesAtom)
    const next = typeof update === 'function' ? update(prev) : update
    set(
      sessionMessagesAtom,
      next.length > MAX_STORED_MESSAGES
        ? next.slice(next.length - MAX_STORED_MESSAGES)
        : next
    )
  }
)

/**
 * Недописанное сообщение.
 *
 * Человек описывает ролик абзацем, отвлекается на ленту, возвращается — и
 * раньше видел пустое поле.
 */
export const agentDraftAtom = atom('')
