import { create } from '@/test-utils/core/mock';
import { MyContext } from '@/interfaces/telegram-bot.interface';
import { logger } from '@/utils/logger';
import { ModeEnum } from '@/types/mode.enum';

interface MockContextOptions {
  is_ru?: boolean;
  mode?: ModeEnum;
  telegram_id?: string;
}

/**
 * Создает мок контекста для тестирования
 */
export function mockContext(options: MockContextOptions = {}): MyContext {
  const {
    is_ru = false,
    mode = ModeEnum.TEST,
    telegram_id = '123456789'
  } = options;

  // Создаем мок для метода reply
  const replyMock = create<(text: string) => Promise<any>>()
    .mockImplementation(async (text: string) => {
      logger.info(`Mock reply called with: ${text}`);
      return { message_id: 1 };
    });

  // Создаем мок для метода sendMessage
  const sendMessageMock = create<(chatId: number, text: string) => Promise<any>>()
    .mockImplementation(async (chatId: number, text: string) => {
      logger.info(`Mock sendMessage called with chatId: ${chatId}, text: ${text}`);
      return { message_id: 1 };
    });

  // Создаем базовый контекст
  const baseCtx = {
    session: {
      data: {
        numImages: 1,
        telegram_id: telegram_id,
        mode: mode,
        attempts: 0,
        videoModel: '',
        is_ru
      },
      __language_code: is_ru ? 'ru' : 'en',
      memory: { messages: [] },
      email: 'test@example.com',
      selectedModel: '',
      prompt: '',
      selectedSize: '',
      userModel: {},
      amount: 0,
      subscription: {},
      images: [],
      modelName: '',
      targetUserId: 0,
      username: 'testuser',
      triggerWord: '',
      steps: 0,
      inviter: '',
      inviteCode: '',
      invoiceURL: '',
      buttons: [],
      bypass_payment_check: false,
      selectedPayment: {
        amount: 0,
        stars: 0
      }
    },
    attempts: 0,
    scene: create<any>().mockImplementation(() => ({
      enter: async () => {},
      leave: async () => {}
    })),
    wizard: create<any>().mockImplementation(() => ({
      next: async () => {},
      back: async () => {}
    })),
    amount: 0,
    from: {
      id: parseInt(telegram_id),
      first_name: 'Test',
      last_name: 'User',
      username: 'testuser',
      language_code: is_ru ? 'ru' : 'en'
    },
    reply: replyMock,
    telegram: {
      sendMessage: sendMessageMock
    },
    // Добавляем недостающие свойства из MyContext
    update: {},
    botInfo: {
      id: 0,
      is_bot: true,
      first_name: 'Test Bot',
      username: 'test_bot',
      can_join_groups: true,
      can_read_all_group_messages: true,
      supports_inline_queries: false
    },
    state: {},
    updateType: 'message',
    chat: {
      id: parseInt(telegram_id),
      type: 'private',
      first_name: 'Test',
      username: 'testuser'
    },
    message: {
      message_id: 1,
      date: Date.now(),
      chat: {
        id: parseInt(telegram_id),
        type: 'private',
        first_name: 'Test',
        username: 'testuser'
      }
    }
  };

  return baseCtx as unknown as MyContext;
}

// Экспортируем createMockContext как алиас для обратной совместимости
export const createMockContext = mockContext; 