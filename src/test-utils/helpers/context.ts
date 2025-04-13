import { MyContext } from '@/interfaces';
import mockApi from '@/test-utils/core/mock';

/**
 * Создает тестовый контекст для тестирования
 */
export function getTestContext(): MyContext {
  return {
    from: {
      id: 123456,
      username: 'test_user',
      first_name: 'Test',
      last_name: 'User',
      is_bot: false,
      language_code: 'en'
    },
    chat: {
      id: 123456,
      type: 'private',
      first_name: 'Test',
      last_name: 'User',
      username: 'test_user'
    },
    message: {
      message_id: 1,
      from: {
        id: 123456,
        username: 'test_user',
        first_name: 'Test',
        last_name: 'User',
        is_bot: false,
        language_code: 'en'
      },
      chat: {
        id: 123456,
        type: 'private',
        first_name: 'Test',
        last_name: 'User',
        username: 'test_user'
      },
      date: Math.floor(Date.now() / 1000),
      text: 'Test message'
    },
    scene: {
      enter: mockApi.create(),
      reenter: mockApi.create(),
      leave: mockApi.create(),
      state: {}
    },
    session: {},
    reply: mockApi.create(),
    i18n: {
      t: (key: string) => key
    }
  } as unknown as MyContext;
} 