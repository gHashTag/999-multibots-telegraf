import { MyContext } from '@/interfaces';
import { Scenes } from 'telegraf';
import { mockFn } from './mockFunction';

/**
 * Создает базовый мок-контекст для тестирования Telegraf сцен
 */
export function createMockContext() {
  const replies: any[] = [];
  
  return {
    message: undefined,
    from: { id: 123456789, is_bot: false, first_name: 'Test', language_code: 'ru' },
    chat: { id: 123456789, type: 'private', first_name: 'Test' },
    session: {
      balance: 1000,
      isAdmin: false,
      language: 'ru'
    },
    i18n: {
      t: (key: string) => key,
    },
    reply: function(text: string, extra?: any) {
      replies.push({ text, extra });
      return Promise.resolve({ message_id: replies.length });
    },
    replyWithHTML: function(text: string, extra?: any) {
      replies.push({ text, extra, format: 'HTML' });
      return Promise.resolve({ message_id: replies.length });
    },
    replyWithMarkdownV2: function(text: string, extra?: any) {
      replies.push({ text, extra, format: 'Markdown' });
      return Promise.resolve({ message_id: replies.length });
    },
    replyWithPhoto: function(photo: string, extra?: any) {
      replies.push({ photo, extra });
      return Promise.resolve({ message_id: replies.length });
    },
    replyWithVideo: function(video: string, extra?: any) {
      replies.push({ video, extra });
      return Promise.resolve({ message_id: replies.length });
    },
    editMessageText: function(text: string, extra?: any) {
      replies.push({ text, extra, action: 'edit' });
      return Promise.resolve({ message_id: replies.length });
    },
    editMessageReplyMarkup: function(markup: any) {
      replies.push({ markup, action: 'editMarkup' });
      return Promise.resolve({ message_id: replies.length });
    },
    answerCbQuery: function(text?: string) {
      if (text) replies.push({ text, action: 'cbQuery' });
      return Promise.resolve(true);
    },
    scene: {
      enter: function(sceneId: string) {
        replies.push({ action: 'enterScene', sceneId });
        return Promise.resolve();
      },
      reenter: function() {
        replies.push({ action: 'reenterScene' });
        return Promise.resolve();
      },
      leave: function() {
        replies.push({ action: 'leaveScene' });
        return Promise.resolve();
      }
    },
    wizard: {
      cursor: 0,
      next: mockFn(() => 1),
      selectStep: mockFn((step: number) => step),
      back: mockFn(() => -1),
      scene: {
        leave: mockFn(() => Promise.resolve()),
        enter: mockFn((sceneId: string) => Promise.resolve()),
        current: null,
      }
    },
    telegram: {
      sendMessage: function(chatId: number | string, text: string, extra?: any) {
        replies.push({ chatId, text, extra });
        return Promise.resolve({ message_id: replies.length });
      },
      sendPhoto: function(chatId: number | string, photo: string, extra?: any) {
        replies.push({ chatId, photo, extra });
        return Promise.resolve({ message_id: replies.length });
      },
      sendVideo: function(chatId: number | string, video: string, extra?: any) {
        replies.push({ chatId, video, extra });
        return Promise.resolve({ message_id: replies.length });
      },
      getFile: function(fileId: string) {
        return Promise.resolve({ file_id: fileId, file_path: `mock_files/${fileId}.jpg` });
      }
    },
    replies
  };
}

/**
 * Создает мок-контекст для тестирования Wizard сцен с возможностью указания текущего шага
 */
export function createMockWizardContext(step = 0) {
  const ctx = createMockContext();
  return {
    ...ctx,
    wizard: {
      ...ctx.wizard,
      cursor: step,
      step: step,
      current: {}
    }
  };
}

/**
 * Глобальный mock для fetch, используемый в тестах
 */
global.fetch = mockFn();

/**
 * Поддержка устаревшего API для обратной совместимости
 * Это будет использоваться только если глобальная переменная jest не определена
 */
// Declare the global jest object type
declare global {
  var jest: {
    fn: (implementation?: Function) => any;
    mock: (moduleName: string, factory?: object) => any;
  };
}

// Check if jest is already defined before creating it
if (typeof global.jest === 'undefined') {
  global.jest = {
    fn: (implementation?: Function) => {
      return mockFn(implementation as any);
    },
    mock: (moduleName: string, factory?: object) => {
      console.warn(`jest.mock called for ${moduleName} but not fully implemented in custom mock system`);
      return factory || {};
    }
  };
}

export default { createMockContext, createMockWizardContext }; 