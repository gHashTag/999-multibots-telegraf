// ===============================
// Переписка с агентом — вкладка «Агент» (/chat)
// ===============================

import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { STORAGE_KEYS } from '@vibee/atoms';

/**
 * ЗАЧЕМ ЭТОТ ФАЙЛ. И переписка, и недописанное сообщение жили в `useState`
 * страницы `pages/Chat.tsx`. Страница размонтируется при любом уходе на другую
 * вкладку — и разговор исчезал вместе с ней. В агента пишут не реплику, а
 * задание: «сделай рилс про то-то, вот такой стиль, вот такой голос». Потерять
 * это дороже, чем любую настройку интерфейса.
 *
 * ПОЧЕМУ ОТДЕЛЬНО ОТ `atoms/chat.ts`. Тот модуль обслуживает `ChatPanel` —
 * компонент, который не импортируется НИЧЕМ, кроме собственного бочонка
 * (`components/Panels/index.ts`). Правка там была бы декорацией. Живая
 * поверхность — `pages/Chat.tsx`, и у неё своя форма сообщения (`text`,
 * `thinking`, `tools`), несовместимая с `Message` из `atoms/chat.ts`.
 */

export interface ToolCall {
  name: string;
  /** Сколько инструмент отработал, мс. */
  ms?: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** Поток размышления модели — сворачиваемый, показывается по желанию. */
  thinking?: string;
  tools?: ToolCall[];
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
const MAX_STORED_MESSAGES = 100;

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
);

/** История переписки. Пишется с обрезкой хвоста — свежее важнее старого. */
export const agentMessagesAtom = atom(
  (get) => get(storedMessagesAtom),
  (
    get,
    set,
    update: Message[] | ((prev: Message[]) => Message[])
  ) => {
    const prev = get(storedMessagesAtom);
    const next = typeof update === 'function' ? update(prev) : update;
    set(
      storedMessagesAtom,
      next.length > MAX_STORED_MESSAGES
        ? next.slice(next.length - MAX_STORED_MESSAGES)
        : next
    );
  }
);

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
);
