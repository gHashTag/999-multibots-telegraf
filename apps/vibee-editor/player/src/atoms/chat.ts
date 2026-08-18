// ===============================
// Chat Atoms - Migrated from Zustand
// ===============================

import { atom } from 'jotai';
import { produce } from 'immer';
import { nanoid } from 'nanoid';
import { languageAtom, translateAtom } from './language';

// ===============================
// Types
// ===============================

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  codeBlock?: {
    language: string;
    code: string;
  };
  actions?: AgentAction[];
}

export interface AgentAction {
  id: string;
  type:
    | 'update_prop'
    | 'apply_style'
    | 'create_template'
    | 'modify_code'
    | 'add_track_item'
    | 'update_track_item'
    | 'delete_track_items'
    | 'select_items';
  label: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'applied' | 'rejected';
}

export interface LogEntry {
  timestamp: number;
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
}

export interface AgentContext {
  logs: LogEntry[];
  props: Record<string, unknown>;
  errors: Error[];
  currentTemplate: string;
  selectedItems: string[];
}

// ===============================
// Localization helpers
// ===============================

function getBrowserLanguage(): string {
  if (typeof navigator === 'undefined') return 'en';
  const lang = navigator.language || (navigator as { userLanguage?: string }).userLanguage || 'en';
  return lang.toLowerCase().split('-')[0];
}

function getWelcomeMessage(): string {
  const lang = getBrowserLanguage();
  switch (lang) {
    case 'ru':
      return 'Привет! Я VIBEE AI ассистент. Могу помочь создать и отредактировать видео шаблоны. Что хотите сделать?';
    case 'uk':
      return 'Привіт! Я VIBEE AI асистент. Можу допомогти створити та відредагувати відео шаблони. Що хочете зробити?';
    case 'es':
      return '¡Hola! Soy tu asistente VIBEE AI. Puedo ayudarte a crear y editar plantillas de video. ¿Qué te gustaría hacer?';
    case 'de':
      return 'Hallo! Ich bin dein VIBEE AI Assistent. Ich kann dir helfen, Video-Vorlagen zu erstellen und zu bearbeiten. Was möchtest du machen?';
    case 'fr':
      return 'Salut! Je suis ton assistant VIBEE AI. Je peux t\'aider à créer et modifier des modèles vidéo. Que veux-tu faire?';
    case 'zh':
      return '你好！我是你的 VIBEE AI 助手。我可以帮你创建和编辑视频模板。你想做什么？';
    case 'ja':
      return 'こんにちは！VIBEE AIアシスタントです。動画テンプレートの作成・編集をお手伝いします。何をしましょうか？';
    case 'ko':
      return '안녕하세요! VIBEE AI 어시스턴트입니다. 비디오 템플릿 제작과 편집을 도와드릴 수 있어요. 무엇을 하시겠어요?';
    default:
      return 'Hi! I\'m your VIBEE AI assistant. I can help you create and edit video templates. What would you like to build today?';
  }
}

function getClearMessage(): string {
  const lang = getBrowserLanguage();
  switch (lang) {
    case 'ru':
      return 'Чат очищен. Чем могу помочь?';
    case 'uk':
      return 'Чат очищено. Чим можу допомогти?';
    case 'es':
      return 'Chat borrado. ¿Cómo puedo ayudarte?';
    case 'de':
      return 'Chat gelöscht. Wie kann ich dir helfen?';
    case 'fr':
      return 'Chat effacé. Comment puis-je t\'aider?';
    case 'zh':
      return '聊天已清空。有什么可以帮你的？';
    case 'ja':
      return 'チャットをクリアしました。何かお手伝いできますか？';
    case 'ko':
      return '채팅이 삭제되었습니다. 무엇을 도와드릴까요?';
    default:
      return 'Chat cleared. How can I help you?';
  }
}

// ===============================
// State Atoms
// ===============================

// Messages
export const messagesAtom = atom<Message[]>([
  {
    id: 'welcome',
    role: 'assistant',
    content: getWelcomeMessage(),
    timestamp: Date.now(),
  },
]);

// Streaming status
export const isStreamingAtom = atom(false);

// Connection status
export const isChatConnectedAtom = atom(false);

// Agent context
export const agentContextAtom = atom<AgentContext>({
  logs: [],
  props: {},
  errors: [],
  currentTemplate: 'LipSyncMain',
  selectedItems: [],
});

// ===============================
// Action Atoms
// ===============================

// Add message
export const addMessageAtom = atom(
  null,
  (get, set, { role, content, extras }: { role: Message['role']; content: string; extras?: Partial<Message> }) => {
    const id = nanoid();
    set(messagesAtom, produce(get(messagesAtom), (draft) => {
      draft.push({
        id,
        role,
        content,
        timestamp: Date.now(),
        ...extras,
      });
    }));
    return id;
  }
);

// Update message
export const updateMessageAtom = atom(
  null,
  (get, set, { id, updates }: { id: string; updates: Partial<Message> }) => {
    set(messagesAtom, produce(get(messagesAtom), (draft) => {
      const message = draft.find((m) => m.id === id);
      if (message) {
        Object.assign(message, updates);
      }
    }));
  }
);

// Clear messages - uses translation system
export const clearMessagesAtom = atom(
  null,
  (get, set) => {
    const t = get(translateAtom);
    set(messagesAtom, [
      {
        id: 'welcome',
        role: 'assistant',
        content: t('chat.cleared'),
        timestamp: Date.now(),
      },
    ]);
  }
);

// Refresh welcome message when language changes
export const refreshWelcomeMessageAtom = atom(
  null,
  (get, set) => {
    const t = get(translateAtom);
    const messages = get(messagesAtom);
    // Only update if first message is the welcome message
    if (messages.length > 0 && messages[0].id === 'welcome') {
      set(messagesAtom, [
        {
          ...messages[0],
          content: t('chat.welcome'),
        },
        ...messages.slice(1),
      ]);
    }
  }
);

// Set streaming
export const setStreamingAtom = atom(
  null,
  (get, set, streaming: boolean) => {
    set(isStreamingAtom, streaming);
  }
);

// Set connected
export const setChatConnectedAtom = atom(
  null,
  (get, set, connected: boolean) => {
    set(isChatConnectedAtom, connected);
  }
);

// Add log
export const addLogAtom = atom(
  null,
  (get, set, { level, message }: { level: LogEntry['level']; message: string }) => {
    set(agentContextAtom, produce(get(agentContextAtom), (draft) => {
      draft.logs.push({
        timestamp: Date.now(),
        level,
        message,
      });
      // Keep last 100 logs
      if (draft.logs.length > 100) {
        draft.logs.shift();
      }
    }));
  }
);

// Add error
export const addErrorAtom = atom(
  null,
  (get, set, error: Error) => {
    set(agentContextAtom, produce(get(agentContextAtom), (draft) => {
      draft.errors.push(error);
      // Keep last 10 errors
      if (draft.errors.length > 10) {
        draft.errors.shift();
      }
    }));
  }
);

// Update context
export const updateContextAtom = atom(
  null,
  (get, set, updates: Partial<AgentContext>) => {
    set(agentContextAtom, produce(get(agentContextAtom), (draft) => {
      Object.assign(draft, updates);
    }));
  }
);

// Clear logs
export const clearLogsAtom = atom(
  null,
  (get, set) => {
    set(agentContextAtom, produce(get(agentContextAtom), (draft) => {
      draft.logs = [];
      draft.errors = [];
    }));
  }
);

// Apply action
export const applyActionAtom = atom(
  null,
  (get, set, { messageId, actionId }: { messageId: string; actionId: string }) => {
    set(messagesAtom, produce(get(messagesAtom), (draft) => {
      const message = draft.find((m) => m.id === messageId);
      if (message?.actions) {
        const action = message.actions.find((a) => a.id === actionId);
        if (action) {
          action.status = 'applied';
        }
      }
    }));
  }
);

// Reject action
export const rejectActionAtom = atom(
  null,
  (get, set, { messageId, actionId }: { messageId: string; actionId: string }) => {
    set(messagesAtom, produce(get(messagesAtom), (draft) => {
      const message = draft.find((m) => m.id === messageId);
      if (message?.actions) {
        const action = message.actions.find((a) => a.id === actionId);
        if (action) {
          action.status = 'rejected';
        }
      }
    }));
  }
);

// ===============================
// Log Capture (global singleton)
// ===============================

let isLogCaptureInitialized = false;
let addLogFn: ((level: LogEntry['level'], message: string) => void) | null = null;

export function setLogCaptureFn(fn: (level: LogEntry['level'], message: string) => void) {
  addLogFn = fn;
}

export function initLogCapture() {
  if (isLogCaptureInitialized) return;
  isLogCaptureInitialized = true;

  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const originalInfo = console.info;

  console.log = (...args) => {
    originalLog.apply(console, args);
    addLogFn?.('log', args.map(String).join(' '));
  };

  console.warn = (...args) => {
    originalWarn.apply(console, args);
    addLogFn?.('warn', args.map(String).join(' '));
  };

  console.error = (...args) => {
    originalError.apply(console, args);
    addLogFn?.('error', args.map(String).join(' '));
  };

  console.info = (...args) => {
    originalInfo.apply(console, args);
    addLogFn?.('info', args.map(String).join(' '));
  };
}
