import { Middleware } from 'telegraf';
import { createMockContext } from '../../core/mockContext';
import { mockFn } from '../../core/mockFunction';
import { TestResult } from '../../core/types';
import { TestCategory } from '../../core/categories';
import { logger } from '../../../utils/logger';
import { inviteScene } from '../../../scenes/inviteScene';
import { MyContext } from '../../../interfaces';

// Constants for testing
const TEST_USER_ID = 123456789;
const TEST_USERNAME = 'test_user';
const TEST_REFERRALS_COUNT = 5;
const TEST_BOT_USERNAME = 'test_bot';

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
const getReferalsCountAndUserDataMock = mockFn().mockResolvedValue({
  count: TEST_REFERRALS_COUNT,
  userData: null
});

// Setup mocks in global space
(global as any).getReferalsCountAndUserData = getReferalsCountAndUserDataMock;

/**
 * Setup test environment
 */
function setupTest() {
  // Reset mocks between tests
  getReferalsCountAndUserDataMock.mockClear();
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
    buttons: []
  };
  
  // Setup necessary properties for typing
  ctx.replies = [];
  ctx.from = {
    id: TEST_USER_ID,
    username: TEST_USERNAME,
    language_code: language,
    first_name: 'Test',
    last_name: 'User',
    is_bot: false
  };
  
  // Setup botInfo
  ctx.botInfo = {
    id: 12345,
    username: TEST_BOT_USERNAME,
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
    })
  };
  
  // Mock telegram API method
  ctx.telegram = {
    sendMessage: mockFn().mockResolvedValue(true)
  } as any;
  
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
 * Test entering invite scene in Russian
 */
const testInviteSceneEnterRussian = async (): Promise<TestResult> => {
  try {
    // Arrange
    setupTest();
    const ctx = createTestContext('ru');
    
    // Act - invoke the enter handler
    await invokeHandler(inviteScene.enterMiddleware(), ctx);
    
    // Assert
    if ((ctx as any).replies && (ctx as any).replies.length > 0) {
      const introText = (ctx as any).replies[0].text;
      const linkText = (ctx as any).replies[1].text;

      if (
        typeof introText === 'string' && 
        introText.includes('Пригласите друга') &&
        introText.includes(`Рефаралы: ${TEST_REFERRALS_COUNT}`) &&
        typeof linkText === 'string' &&
        linkText.includes(`https://t.me/${TEST_BOT_USERNAME}?start=${TEST_USER_ID}`)
      ) {
        return { 
          name: 'Вход в сцену inviteScene (русский)',
          category: TestCategory.All,
          success: true,
          message: 'inviteScene правильно показывает информацию о приглашениях на русском языке' 
        };
      } else {
        return {
          name: 'Вход в сцену inviteScene (русский)',
          category: TestCategory.All,
          success: false,
          message: `Неправильный текст ответа: ${introText}, ${linkText}`
        };
      }
    } else {
      return {
        name: 'Вход в сцену inviteScene (русский)',
        category: TestCategory.All,
        success: false,
        message: 'inviteScene не отвечает на русском языке'
      };
    }
  } catch (error) {
    console.error('Ошибка в testInviteSceneEnterRussian:', error);
    return { 
      name: 'Вход в сцену inviteScene (русский)',
      category: TestCategory.All,
      success: false, 
      message: 'Ошибка при выполнении теста',
      error: error instanceof Error ? error.message : String(error) 
    };
  }
};

/**
 * Test entering invite scene in English
 */
const testInviteSceneEnterEnglish = async (): Promise<TestResult> => {
  try {
    // Arrange
    setupTest();
    const ctx = createTestContext('en');
    
    // Act - invoke the enter handler
    await invokeHandler(inviteScene.enterMiddleware(), ctx);
    
    // Assert
    if ((ctx as any).replies && (ctx as any).replies.length > 0) {
      const introText = (ctx as any).replies[0].text;
      const linkText = (ctx as any).replies[1].text;

      if (
        typeof introText === 'string' && 
        introText.includes('Invite a friend') &&
        introText.includes(`Referrals: ${TEST_REFERRALS_COUNT}`) &&
        typeof linkText === 'string' &&
        linkText.includes(`https://t.me/${TEST_BOT_USERNAME}?start=${TEST_USER_ID}`)
      ) {
        return { 
          name: 'Вход в сцену inviteScene (английский)',
          category: TestCategory.All,
          success: true,
          message: 'inviteScene правильно показывает информацию о приглашениях на английском языке' 
        };
      } else {
        return {
          name: 'Вход в сцену inviteScene (английский)',
          category: TestCategory.All,
          success: false,
          message: `Неправильный текст ответа: ${introText}, ${linkText}`
        };
      }
    } else {
      return {
        name: 'Вход в сцену inviteScene (английский)',
        category: TestCategory.All,
        success: false,
        message: 'inviteScene не отвечает на английском языке'
      };
    }
  } catch (error) {
    console.error('Ошибка в testInviteSceneEnterEnglish:', error);
    return { 
      name: 'Вход в сцену inviteScene (английский)',
      category: TestCategory.All,
      success: false, 
      message: 'Ошибка при выполнении теста',
      error: error instanceof Error ? error.message : String(error) 
    };
  }
};

/**
 * Test redirect to menu scene after showing invite info
 */
const testInviteSceneRedirectToMenuScene = async (): Promise<TestResult> => {
  try {
    // Arrange
    setupTest();
    const ctx = createTestContext('ru');
    
    // Act - invoke the enter handler
    await invokeHandler(inviteScene.enterMiddleware(), ctx);
    
    // Assert
    // Check if scene.enter was called with 'menuScene'
    const sceneEnterCalled = ((ctx.scene.enter as any).mock?.calls?.length || 0) > 0;
    const sceneEnterCalledWithMenuScene = 
      ((ctx.scene.enter as any).mock?.calls[0]?.[0] === 'menuScene') || false;
    
    if (sceneEnterCalled && sceneEnterCalledWithMenuScene) {
      return { 
        name: 'Переход в главное меню из inviteScene',
        category: TestCategory.All,
        success: true,
        message: 'inviteScene правильно перенаправляет в главное меню после показа информации' 
      };
    } else {
      return {
        name: 'Переход в главное меню из inviteScene',
        category: TestCategory.All,
        success: false,
        message: `Неправильный переход в меню. enter вызван: ${sceneEnterCalled}, с menuScene: ${sceneEnterCalledWithMenuScene}`
      };
    }
  } catch (error) {
    console.error('Ошибка в testInviteSceneRedirectToMenuScene:', error);
    return { 
      name: 'Переход в главное меню из inviteScene',
      category: TestCategory.All,
      success: false, 
      message: 'Ошибка при выполнении теста перехода в меню',
      error: error instanceof Error ? error.message : String(error) 
    };
  }
};

/**
 * Test error handling when fetching referral data fails
 */
const testInviteSceneErrorHandling = async (): Promise<TestResult> => {
  try {
    // Arrange
    setupTest();
    const ctx = createTestContext('ru');
    
    // Mock failure of getReferalsCountAndUserData
    getReferalsCountAndUserDataMock.mockRejectedValue(new Error('Test error'));
    
    // Act - invoke the enter handler
    await invokeHandler(inviteScene.enterMiddleware(), ctx);
    
    // Assert
    if ((ctx as any).replies && (ctx as any).replies.length > 0) {
      const errorText = (ctx as any).replies[0].text;
      
      if (
        typeof errorText === 'string' && 
        errorText.includes('Произошла ошибка при получении данных о рефералах')
      ) {
        return { 
          name: 'Обработка ошибок в inviteScene',
          category: TestCategory.All,
          success: true,
          message: 'inviteScene правильно обрабатывает ошибки при получении данных о рефералах' 
        };
      } else {
        return {
          name: 'Обработка ошибок в inviteScene',
          category: TestCategory.All,
          success: false,
          message: `Неправильное сообщение об ошибке: ${errorText}`
        };
      }
    } else {
      return {
        name: 'Обработка ошибок в inviteScene',
        category: TestCategory.All,
        success: false,
        message: 'inviteScene не отображает ошибку при сбое'
      };
    }
  } catch (error) {
    console.error('Ошибка в testInviteSceneErrorHandling:', error);
    return { 
      name: 'Обработка ошибок в inviteScene',
      category: TestCategory.All,
      success: false, 
      message: 'Ошибка при выполнении теста обработки ошибок',
      error: error instanceof Error ? error.message : String(error) 
    };
  }
};

/**
 * Run all invite scene tests
 */
export async function runInviteSceneTests(): Promise<TestResult[]> {
  console.log('Running inviteScene tests...');
  
  const results: TestResult[] = [];
  
  try {
    // Run all tests
    results.push(await testInviteSceneEnterRussian());
    results.push(await testInviteSceneEnterEnglish());
    results.push(await testInviteSceneRedirectToMenuScene());
    results.push(await testInviteSceneErrorHandling());
    
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
    
    console.log(`✅ Тесты сцены приглашений: ${passCount}/${results.length} успешно`);
    return results;
  } catch (error: any) {
    console.error('❌ Тесты сцены приглашений завершились с ошибкой:', error);
    results.push({
      name: 'Тесты сцены приглашений',
      category: TestCategory.All,
      success: false,
      message: `Неожиданная ошибка: ${error.message}`
    });
    return results;
  }
}

// Export default function to run tests
export default runInviteSceneTests; 