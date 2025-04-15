import { Middleware } from 'telegraf';
import { createMockContext } from '../../core/mockContext';
import { mockFn } from '../../core/mockFunction';
import { TestResult } from '../../core/types';
import { TestCategory } from '../../core/categories';
import { logger } from '../../../utils/logger';
import { balanceNotifierScene } from '../../../scenes/balanceNotifierScene';
import { MyContext } from '../../../interfaces';

// Constants for testing
const TEST_USER_ID = 123456789;
const TEST_USERNAME = 'test_user';
const TEST_BALANCE = 100;

// Вспомогательный тип для моковых функций
interface MockFunction<T = any> {
  (...args: any[]): T;
  mock: {
    calls: any[][];
    results: any[];
    instances: any[];
  };
  mockClear(): void;
  mockReset(): void;
  mockImplementation(fn: (...args: any[]) => T): MockFunction<T>;
  mockReturnValue(value: T): MockFunction<T>;
  mockResolvedValue(value: T): MockFunction<Promise<T>>;
}

// Mock functions
const getUserBalanceMock = mockFn().mockResolvedValue(TEST_BALANCE);
const getUserInfoMock = mockFn().mockReturnValue({
  telegramId: TEST_USER_ID.toString()
});

// Setup mocks in global space
(global as any).getUserBalance = getUserBalanceMock;
(global as any).getUserInfo = getUserInfoMock;

/**
 * Setup test environment
 */
function setupTest() {
  // Reset mocks between tests
  getUserBalanceMock.mockClear();
  getUserInfoMock.mockClear();
}

/**
 * Create a properly typed context for testing
 */
function createTestContext(language = 'ru'): MyContext {
  const mockCtx = createMockContext() as unknown as MyContext;
  
  // Setup session and other properties through type casting
  const ctx = mockCtx as any;
  
  // Setup session with required fields
  ctx.session = {
    language,
    buttons: [],
    balanceNotifications: {
      enabled: false,
      threshold: 10
    }
  };
  
  // Setup necessary properties for typing
  ctx.replies = [];
  ctx.from = {
    id: TEST_USER_ID,
    username: TEST_USERNAME,
    language_code: language
  };
  
  // Setup botInfo
  ctx.botInfo = {
    id: 12345,
    username: 'test_bot',
    is_bot: true,
    first_name: 'Test Bot',
    can_join_groups: true,
    can_read_all_group_messages: true,
    supports_inline_queries: true
  };
  
  // Mock reply method
  ctx.reply = mockFn().mockImplementation(function(text: string, extra = {}) {
    ctx.replies.push({ text, extra });
    return Promise.resolve({ message_id: ctx.replies.length });
  });
  
  // Mock scene methods with proper typing for mocks
  ctx.scene = {
    enter: mockFn().mockImplementation((sceneId: string) => {
      console.log(`Scene.enter called with arg: ${sceneId}`);
      return Promise.resolve();
    }),
    leave: mockFn().mockImplementation(() => {
      console.log('Scene.leave called');
      return Promise.resolve();
    }),
    reenter: mockFn().mockImplementation(() => {
      console.log('Scene.reenter called');
      return Promise.resolve();
    }),
    session: {}
  };
  
  // Setup answerCbQuery
  ctx.answerCbQuery = mockFn().mockResolvedValue(true);
  
  return ctx;
}

/**
 * Safely invoke a handler middleware
 */
async function invokeHandler(handler: any, ctx: MyContext) {
  if (typeof handler === 'function') {
    return await handler(ctx, () => Promise.resolve());
  } else {
    console.error('Handler is not a function:', handler);
    return false;
  }
}

/**
 * Test entering balance notifier scene in Russian
 */
const testBalanceNotifierSceneEnterRussian = async (): Promise<TestResult> => {
  try {
    // Arrange
    setupTest();
    const ctx = createTestContext('ru');
    
    // Act - invoke the enter handler
    await invokeHandler(balanceNotifierScene.enterMiddleware(), ctx);
    
    // Assert
    if ((ctx as any).replies && (ctx as any).replies.length > 0) {
      const replyText = (ctx as any).replies[0].text;
      const replyMarkup = (ctx as any).replies[0].extra?.reply_markup;

      if (
        typeof replyText === 'string' && 
        replyText.includes('Настройка уведомлений о балансе') &&
        replyMarkup && 
        replyMarkup.inline_keyboard
      ) {
        return { 
          name: 'Вход в сцену balanceNotifierScene (русский)',
          category: TestCategory.All,
          success: true,
          message: 'balanceNotifierScene правильно показывает настройки уведомлений на русском языке' 
        };
      } else {
        return {
          name: 'Вход в сцену balanceNotifierScene (русский)',
          category: TestCategory.All,
          success: false,
          message: `Неправильный текст ответа или разметка: ${replyText}`
        };
      }
    } else {
      return {
        name: 'Вход в сцену balanceNotifierScene (русский)',
        category: TestCategory.All,
        success: false,
        message: 'balanceNotifierScene не отвечает на русском языке'
      };
    }
  } catch (error) {
    console.error('Ошибка в testBalanceNotifierSceneEnterRussian:', error);
    return { 
      name: 'Вход в сцену balanceNotifierScene (русский)',
      category: TestCategory.All,
      success: false, 
      message: 'Ошибка при выполнении теста',
      error: error instanceof Error ? error.message : String(error) 
    };
  }
};

/**
 * Test entering balance notifier scene in English
 */
const testBalanceNotifierSceneEnterEnglish = async (): Promise<TestResult> => {
  try {
    // Arrange
    setupTest();
    const ctx = createTestContext('en');
    
    // Act - invoke the enter handler
    await invokeHandler(balanceNotifierScene.enterMiddleware(), ctx);
    
    // Assert
    if ((ctx as any).replies && (ctx as any).replies.length > 0) {
      const replyText = (ctx as any).replies[0].text;
      const replyMarkup = (ctx as any).replies[0].extra?.reply_markup;

      if (
        typeof replyText === 'string' && 
        replyText.includes('Balance Notification Settings') &&
        replyMarkup && 
        replyMarkup.inline_keyboard
      ) {
        return { 
          name: 'Вход в сцену balanceNotifierScene (английский)',
          category: TestCategory.All,
          success: true,
          message: 'balanceNotifierScene правильно показывает настройки уведомлений на английском языке' 
        };
      } else {
        return {
          name: 'Вход в сцену balanceNotifierScene (английский)',
          category: TestCategory.All,
          success: false,
          message: `Неправильный текст ответа или разметка: ${replyText}`
        };
      }
    } else {
      return {
        name: 'Вход в сцену balanceNotifierScene (английский)',
        category: TestCategory.All,
        success: false,
        message: 'balanceNotifierScene не отвечает на английском языке'
      };
    }
  } catch (error) {
    console.error('Ошибка в testBalanceNotifierSceneEnterEnglish:', error);
    return { 
      name: 'Вход в сцену balanceNotifierScene (английский)',
      category: TestCategory.All,
      success: false, 
      message: 'Ошибка при выполнении теста',
      error: error instanceof Error ? error.message : String(error) 
    };
  }
};

/**
 * Test toggling notifications
 */
const testBalanceNotifierSceneToggleNotifications = async (): Promise<TestResult> => {
  try {
    // Arrange
    setupTest();
    const ctx = createTestContext('ru');
    
    // Simulate callback query with appropriate mocking
    (ctx as any).callbackQuery = {
      id: '12345',
      from: { id: TEST_USER_ID, is_bot: false, first_name: 'Test' },
      chat_instance: '123',
      data: 'toggle_notifications',
      message: { message_id: 1 } as any
    };
    
    // Act - invoke the action handler
    const actionHandler = balanceNotifierScene.action('toggle_notifications', (ctx: any) => {}).middleware() as Middleware<MyContext>;
    await invokeHandler(actionHandler, ctx);
    
    // Assert
    if (ctx.session?.balanceNotifications?.enabled === true) {
      // Check if scene.reenter was called
      const sceneReenterCalled = ((ctx.scene.reenter as any).mock?.calls?.length || 0) > 0;
      
      if (sceneReenterCalled) {
        return { 
          name: 'Включение уведомлений в balanceNotifierScene',
          category: TestCategory.All,
          success: true,
          message: 'balanceNotifierScene правильно включает уведомления' 
        };
      } else {
        return {
          name: 'Включение уведомлений в balanceNotifierScene',
          category: TestCategory.All,
          success: false,
          message: 'balanceNotifierScene не вызывает reenter после изменения настроек'
        };
      }
    } else {
      return {
        name: 'Включение уведомлений в balanceNotifierScene',
        category: TestCategory.All,
        success: false,
        message: 'balanceNotifierScene не включает уведомления'
      };
    }
  } catch (error) {
    console.error('Ошибка в testBalanceNotifierSceneToggleNotifications:', error);
    return { 
      name: 'Включение уведомлений в balanceNotifierScene',
      category: TestCategory.All,
      success: false, 
      message: 'Ошибка при выполнении теста включения уведомлений',
      error: error instanceof Error ? error.message : String(error) 
    };
  }
};

/**
 * Test changing threshold initiation
 */
const testBalanceNotifierSceneChangeThreshold = async (): Promise<TestResult> => {
  try {
    // Arrange
    setupTest();
    const ctx = createTestContext('ru');
    
    // Simulate callback query with appropriate mocking
    (ctx as any).callbackQuery = {
      id: '12345',
      from: { id: TEST_USER_ID, is_bot: false, first_name: 'Test' },
      chat_instance: '123',
      data: 'change_threshold',
      message: { message_id: 1 } as any
    };
    
    // Act - invoke the action handler
    const actionHandler = balanceNotifierScene.action('change_threshold', (ctx: any) => {}).middleware() as Middleware<MyContext>;
    await invokeHandler(actionHandler, ctx);
    
    // Assert
    if ((ctx as any).replies && (ctx as any).replies.length > 0) {
      const replyText = (ctx as any).replies[0].text;
      
      if (
        typeof replyText === 'string' && 
        replyText.includes('Пожалуйста, введите порог баланса') &&
        ctx.scene.session.waitingForThreshold === true
      ) {
        return { 
          name: 'Запрос изменения порога в balanceNotifierScene',
          category: TestCategory.All,
          success: true,
          message: 'balanceNotifierScene правильно запрашивает новый порог уведомлений' 
        };
      } else {
        return {
          name: 'Запрос изменения порога в balanceNotifierScene',
          category: TestCategory.All,
          success: false,
          message: `Неправильный текст запроса порога или не установлен флаг ожидания: ${replyText}`
        };
      }
    } else {
      return {
        name: 'Запрос изменения порога в balanceNotifierScene',
        category: TestCategory.All,
        success: false,
        message: 'balanceNotifierScene не отправляет запрос порога'
      };
    }
  } catch (error) {
    console.error('Ошибка в testBalanceNotifierSceneChangeThreshold:', error);
    return { 
      name: 'Запрос изменения порога в balanceNotifierScene',
      category: TestCategory.All,
      success: false, 
      message: 'Ошибка при выполнении теста запроса порога',
      error: error instanceof Error ? error.message : String(error) 
    };
  }
};

/**
 * Test setting threshold value
 */
const testBalanceNotifierSceneSetThreshold = async (): Promise<TestResult> => {
  try {
    // Arrange
    setupTest();
    const ctx = createTestContext('ru');
    
    // Set waiting for threshold flag
    ctx.scene.session.waitingForThreshold = true;
    
    // Setup message with threshold value
    (ctx as any).message = {
      message_id: 1,
      text: '25',
      from: { id: TEST_USER_ID }
    };
    
    // Act - invoke the text handler
    const textHandler = balanceNotifierScene.on('text', (ctx: any) => {}).middleware() as Middleware<MyContext>;
    await invokeHandler(textHandler, ctx);
    
    // Assert
    const thresholdUpdated = ctx.session?.balanceNotifications?.threshold === 25;
    const sceneReenterCalled = ((ctx.scene.reenter as any).mock?.calls?.length || 0) > 0;
    
    if (thresholdUpdated && sceneReenterCalled) {
      return { 
        name: 'Установка порога уведомлений в balanceNotifierScene',
        category: TestCategory.All,
        success: true,
        message: 'balanceNotifierScene правильно устанавливает новый порог уведомлений' 
      };
    } else {
      return {
        name: 'Установка порога уведомлений в balanceNotifierScene',
        category: TestCategory.All,
        success: false,
        message: `Неправильно установлен порог или не вызван reenter. Порог: ${ctx.session?.balanceNotifications?.threshold}, reenter: ${sceneReenterCalled}`
      };
    }
  } catch (error) {
    console.error('Ошибка в testBalanceNotifierSceneSetThreshold:', error);
    return { 
      name: 'Установка порога уведомлений в balanceNotifierScene',
      category: TestCategory.All,
      success: false, 
      message: 'Ошибка при выполнении теста установки порога',
      error: error instanceof Error ? error.message : String(error) 
    };
  }
};

/**
 * Test back to menu action
 */
const testBalanceNotifierSceneBackToMenu = async (): Promise<TestResult> => {
  try {
    // Arrange
    setupTest();
    const ctx = createTestContext('ru');
    
    // Simulate callback query with appropriate mocking
    (ctx as any).callbackQuery = {
      id: '12345',
      from: { id: TEST_USER_ID, is_bot: false, first_name: 'Test' },
      chat_instance: '123',
      data: 'back_to_menu',
      message: { message_id: 1 } as any
    };
    
    // Act - invoke the action handler
    const actionHandler = balanceNotifierScene.action('back_to_menu', (ctx: any) => {}).middleware() as Middleware<MyContext>;
    await invokeHandler(actionHandler, ctx);
    
    // Assert
    const sceneLeftCalled = ((ctx.scene.leave as any).mock?.calls?.length || 0) > 0;
    const sceneEnterCalled = ((ctx.scene.enter as any).mock?.calls?.length || 0) > 0;
    const sceneEnterCalledWithMenuScene = 
      ((ctx.scene.enter as any).mock?.calls[0]?.[0] === 'menuScene') || false;
    
    if (sceneLeftCalled && sceneEnterCalled && sceneEnterCalledWithMenuScene) {
      return { 
        name: 'Возврат в меню из balanceNotifierScene',
        category: TestCategory.All,
        success: true,
        message: 'balanceNotifierScene правильно возвращает в главное меню' 
      };
    } else {
      return {
        name: 'Возврат в меню из balanceNotifierScene',
        category: TestCategory.All,
        success: false,
        message: `Неправильный возврат в меню. leave: ${sceneLeftCalled}, enter: ${sceneEnterCalled}, menuScene: ${sceneEnterCalledWithMenuScene}`
      };
    }
  } catch (error) {
    console.error('Ошибка в testBalanceNotifierSceneBackToMenu:', error);
    return { 
      name: 'Возврат в меню из balanceNotifierScene',
      category: TestCategory.All,
      success: false, 
      message: 'Ошибка при выполнении теста возврата в меню',
      error: error instanceof Error ? error.message : String(error) 
    };
  }
};

/**
 * Test command handling (e.g., /cancel)
 */
const testBalanceNotifierSceneCommandHandling = async (): Promise<TestResult> => {
  try {
    // Arrange
    setupTest();
    const ctx = createTestContext('ru');
    
    // Setup message with command
    (ctx as any).message = {
      message_id: 1,
      text: '/cancel',
      from: { id: TEST_USER_ID }
    };
    
    // Act - invoke the command handler
    const commandHandler = balanceNotifierScene.command(['start', 'menu', 'exit', 'cancel'], (ctx: any) => {}).middleware() as Middleware<MyContext>;
    await invokeHandler(commandHandler, ctx);
    
    // Assert
    const sceneLeftCalled = ((ctx.scene.leave as any).mock?.calls?.length || 0) > 0;
    const sceneEnterCalled = ((ctx.scene.enter as any).mock?.calls?.length || 0) > 0;
    const sceneEnterCalledWithMenuScene = 
      ((ctx.scene.enter as any).mock?.calls[0]?.[0] === 'menuScene') || false;
    
    if (sceneLeftCalled && sceneEnterCalled && sceneEnterCalledWithMenuScene) {
      return { 
        name: 'Обработка команды в balanceNotifierScene',
        category: TestCategory.All,
        success: true,
        message: 'balanceNotifierScene правильно обрабатывает команды' 
      };
    } else {
      return {
        name: 'Обработка команды в balanceNotifierScene',
        category: TestCategory.All,
        success: false,
        message: `Неправильная обработка команды. leave: ${sceneLeftCalled}, enter: ${sceneEnterCalled}, menuScene: ${sceneEnterCalledWithMenuScene}`
      };
    }
  } catch (error) {
    console.error('Ошибка в testBalanceNotifierSceneCommandHandling:', error);
    return { 
      name: 'Обработка команды в balanceNotifierScene',
      category: TestCategory.All,
      success: false, 
      message: 'Ошибка при выполнении теста обработки команды',
      error: error instanceof Error ? error.message : String(error) 
    };
  }
};

/**
 * Run all balance notifier scene tests
 */
export async function runBalanceNotifierSceneTests(): Promise<TestResult[]> {
  console.log('Running balanceNotifierScene tests...');
  
  const results: TestResult[] = [];
  
  try {
    // Run all tests
    results.push(await testBalanceNotifierSceneEnterRussian());
    results.push(await testBalanceNotifierSceneEnterEnglish());
    results.push(await testBalanceNotifierSceneToggleNotifications());
    results.push(await testBalanceNotifierSceneChangeThreshold());
    results.push(await testBalanceNotifierSceneSetThreshold());
    results.push(await testBalanceNotifierSceneBackToMenu());
    results.push(await testBalanceNotifierSceneCommandHandling());
    
    // Log results
    let passCount = 0;
    results.forEach(result => {
      if (result.success) {
        passCount++;
        console.log(`✅ ${result.name}: ${result.message}`);
      } else {
        console.error(`❌ ${result.name}: ${result.message}`);
      }
    });
    
    console.log(`✅ Тесты сцены уведомлений о балансе: ${passCount}/${results.length} успешно`);
    return results;
  } catch (error: any) {
    console.error('❌ Тесты сцены уведомлений о балансе завершились с ошибкой:', error);
    results.push({
      name: 'Тесты сцены уведомлений о балансе',
      category: TestCategory.All,
      success: false,
      message: `Неожиданная ошибка: ${error.message}`
    });
    return results;
  }
}

// Export default function to run tests
export default runBalanceNotifierSceneTests; 