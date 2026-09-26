// ===============================
// Переписка с агентом — вкладка «Агент» (/chat)
// ===============================

import { atom, type WritableAtom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { STORAGE_KEYS } from '@vibee/atoms'

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

export type AgentAttachmentKind = 'image' | 'video' | 'audio' | 'file'

export interface AgentAttachment {
  id: string
  name: string
  url: string
  mimeType: string
  kind: AgentAttachmentKind
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  text: string
  attachments?: AgentAttachment[]
  /**
   * Which client wrote this turn. Absent for anything typed here and now:
   * only history fetched from the server carries it.
   */
  surface?: string
  /** Поток размышления модели — сворачиваемый, показывается по желанию. */
  thinking?: string
  tools?: ToolCall[]
  /**
   * A message the agent prepared FOR SOMEBODY ELSE (a client, a group), waiting
   * for the owner's press. The server has always sent it on the stream; the
   * app used to drop it, so approving meant leaving for the bot.
   */
  sendCard?: SendCard
}

/** One prepared send, as the stream delivers it (render tg-proposals.ts). */
export interface SendCard {
  id: string
  /** One-time; valid for this card only, and only for the caller. */
  secret: string
  action: string
  target: string
  display?: string
  what?: string
  media?:
    | { kind: 'photo' | 'video' | 'voice' | 'video_note'; url: string }
    | { kind: 'document'; url: string; fileName?: string }
    | { kind: 'album'; urls: string[] }
  expiresAt?: number
  /** What happened to it on this screen. */
  state?: 'waiting' | 'sending' | 'sent' | 'cancelled' | 'failed'
  error?: string
}

/**
 * Сколько сообщений храним.
 *
 * localStorage даёт около 5 МБ на origin, а переписка растёт без предела.
 * Переполнение бросает QuotaExceededError на ЗАПИСИ — сломался бы не чат, а
 * всё, что пишет в хранилище после него: черновик, вкладка, настройки. Сотни
 * сообщений хватает, чтобы вернуться к разговору, и не хватает, чтобы забить
 * квоту.
 */
const MAX_STORED_MESSAGES = 100

/**
 * `getOnInit` — не косметика.
 *
 * По умолчанию atomWithStorage отдаёт значение по умолчанию на первом рендере
 * и подтягивает сохранённое позже, из onMount. Страница чата на монтировании
 * решает, показывать ли приветствие: она бы увидела пустой список, положила
 * приветствие, и восстановленная история легла бы поверх — или наоборот.
 * С `getOnInit` первое же чтение идёт из localStorage, и гонки нет.
 */
const storedMessagesAtom = atomWithStorage<Message[]>(
  STORAGE_KEYS.agentChat,
  [],
  undefined,
  { getOnInit: true }
)

type MessagesUpdate = Message[] | ((prev: Message[]) => Message[])
export type MessagesAtom = WritableAtom<Message[], [MessagesUpdate], void>

/** Trim the tail on write -- the fresh end of a conversation matters more. */
function trimmed(
  stored: WritableAtom<Message[], [Message[]], void>
): MessagesAtom {
  return atom(
    get => get(stored),
    (get, set, update: MessagesUpdate) => {
      const prev = get(stored)
      const next = typeof update === 'function' ? update(prev) : update
      set(
        stored,
        next.length > MAX_STORED_MESSAGES
          ? next.slice(next.length - MAX_STORED_MESSAGES)
          : next
      )
    }
  )
}

/** The person's own thread (`/chat`). Unchanged key, unchanged behaviour. */
export const agentMessagesAtom: MessagesAtom = trimmed(storedMessagesAtom)

/**
 * ONE THREAD PER CLIENT.
 *
 * The owner's complaint, verbatim: every client's conversation landed in one
 * place. A thread about a client is keyed by that client -- on the server as
 * `thread='client:<id>'`, here as its own localStorage entry -- so clearing or
 * reading one never touches another, and never touches the self thread.
 *
 * A small keyed record rather than jotai's atomFamily: the set of clients on
 * one device is tiny, and a Map we own is one less import to reason about.
 */
export const clientThreadStorageKey = (clientId: string): string =>
  `${STORAGE_KEYS.agentChat}:client:${clientId}`

const clientThreads = new Map<string, MessagesAtom>()
const marketplaceAgentThreads = new Map<string, MessagesAtom>()

export const marketplaceAgentThreadStorageKey = (agentId: string): string =>
  `${STORAGE_KEYS.agentChat}:agent:${agentId}`

export function agentMessagesAtomFor(
  clientId: string | null | undefined,
  marketplaceAgent?: string | null
): MessagesAtom {
  /*
   * A CLIENT'S THREAD WINS. A specialist called into a client conversation
   * (render routes.ts threadFor) answers in the CLIENT's thread: one
   * conversation about one person, whoever helps with it.
   */
  if (marketplaceAgent && !clientId) {
    let found = marketplaceAgentThreads.get(marketplaceAgent)
    if (!found) {
      found = trimmed(
        atomWithStorage<Message[]>(
          marketplaceAgentThreadStorageKey(marketplaceAgent),
          [],
          undefined,
          { getOnInit: true }
        )
      )
      marketplaceAgentThreads.set(marketplaceAgent, found)
    }
    return found
  }
  if (!clientId) return agentMessagesAtom
  let found = clientThreads.get(clientId)
  if (!found) {
    found = trimmed(
      atomWithStorage<Message[]>(
        clientThreadStorageKey(clientId),
        [],
        undefined,
        {
          getOnInit: true,
        }
      )
    )
    clientThreads.set(clientId, found)
  }
  return found
}

/**
 * Недописанное сообщение.
 *
 * Человек описывает ролик абзацем, отвлекается на ленту, возвращается — и
 * раньше видел пустое поле.
 */
export const agentDraftAtom = atomWithStorage<string>(
  STORAGE_KEYS.agentChatDraft,
  '',
  undefined,
  { getOnInit: true }
)
