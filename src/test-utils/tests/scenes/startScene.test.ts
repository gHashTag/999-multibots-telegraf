import { MyContext } from '@/interfaces';
import { TestResult } from '../../core/types';
import { TestCategory } from '../../core/categories';
import mockApi from '../../core/mock';
import * as supabaseModule from '@/core/supabase';
import { ModeEnum } from '@/price/helpers/modelsCost';
import { createMockContext } from '@/test-utils/helpers/createMockContext';
import { startScene } from '@/scenes/startScene';
import { logger } from '@/utils/logger';

// Создаем моки для функций из supabase
const mockGetTranslation = mockApi.create({
  name: 'getTranslation',
  implementation: async (_key: string, _ctx: any) => ({
    translation: 'Test translation',
    url: 'https://example.com/test-image.jpg'
  })
});

const mockGetReferalsCountAndUserData = mockApi.create({
  name: 'getReferalsCountAndUserData',
  implementation: async (_telegram_id: string) => ({
    count: 5,
    subscription: 'stars',
    level: 1,
    isExist: true
  })
});

const mockCheckPaymentStatus = mockApi.create({
  name: 'checkPaymentStatus',
  implementation: async (_ctx: any, _subscription: string) => true
});

/**
 * Настройка тестового окружения
 */
const setupTest = () => {
  // Переопределяем функции для тестов
  (supabaseModule as any).getTranslation = mockGetTranslation;
  (supabaseModule as any).getReferalsCountAndUserData = mockGetReferalsCountAndUserData;
  (supabaseModule as any).checkPaymentStatus = mockCheckPaymentStatus;
  
  // Сбрасываем историю вызовов моков
  mockGetTranslation.mock.clear();
  mockGetReferalsCountAndUserData.mock.clear();
  mockCheckPaymentStatus.mock.clear();
};

/**
 * Создание тестового контекста
 */
const createTestContext = (options: { language?: string, isExistingUser?: boolean } = {}) => {
  // Создаем тестового пользователя
  const testUser = {
    id: 123456789,
    telegram_id: '123456789',
    username: 'testuser',
    language_code: options.language || 'en'
  };

  // Создаем мок контекста с тестовым пользователем
  const ctx = createMockContext({
    user: testUser
  }) as unknown as MyContext;

  // Имитируем botInfo
  Object.defineProperty(ctx, 'botInfo', {
    get: () => ({
      id: 987654321,
      first_name: 'Test Bot',
      username: 'neuro_blogger_bot',
      is_bot: true
    })
  });

  // Добавляем функциональность сцены в контекст
  ctx.session = {
    __scenes: {
      current: 'startScene',
      state: {}
    }
  } as any;

  // Создаем моки для методов сцены
  const enterMock = mockApi.create({
    name: 'scene.enter',
    implementation: async () => true
  });
  
  const leaveMock = mockApi.create({
    name: 'scene.leave',
    implementation: async () => true
  });

  // Добавляем методы для работы со сценой
  ctx.scene = {
    enter: enterMock,
    leave: leaveMock
  } as any;

  // Мокируем методы Telegraf для проверки отправленных сообщений
  const replyMock = mockApi.create({
    name: 'reply',
    implementation: async () => true
  });
  
  ctx.reply = replyMock as any;
  
  const replyWithPhotoMock = mockApi.create({
    name: 'replyWithPhoto',
    implementation: async () => true
  });
  
  ctx.replyWithPhoto = replyWithPhotoMock as any;

  // Добавляем методы для работы с wizard
  ctx.wizard = {
    next: jest.fn(),
    state: {}
  } as any;

  // Переопределяем мок getReferalsCountAndUserData для тестирования различных сценариев
  if (options.isExistingUser === false) {
    mockGetReferalsCountAndUserData.mock.implementation = async () => ({
      count: 0,
      subscription: null,
      level: 0,
      isExist: false
    });
  }

  return { 
    ctx, 
    replyMock, 
    replyWithPhotoMock, 
    enterMock, 
    leaveMock 
  };
};

/**
 * Проверка наличия определенного текста в сообщении
 */
const assertReplyContains = (ctx: any, expectedText: string, errorMessage: string) => {
  const replyMock = ctx.reply;
  
  // Проверяем все вызовы метода reply
  const calls = replyMock?.mock?.calls || [];
  const replyCall = calls.find(
    (call: any[]) => call && Array.isArray(call) && call[0] && typeof call[0] === 'string' && call[0].includes(expectedText)
  );
  
  if (!replyCall) {
    throw new Error(errorMessage);
  }
};

/**
 * Тест входа в стартовую сцену
 */
export async function testStartScene_EnterScene(): Promise<TestResult> {
  const testName = 'startScene: Enter Scene';
  
  try {
    logger.info(`[TEST] Начало теста: ${testName}`);
    setupTest();
    
    // Создаем тестовый контекст
    const { ctx, replyWithPhotoMock } = createTestContext();
    
    // Запускаем первый хэндлер сцены
    const handler = startScene.steps[0];
    await handler(ctx);
    
    // Проверяем, что был вызван метод replyWithPhoto
    if (replyWithPhotoMock.mock.calls.length === 0) {
      throw new Error('Метод replyWithPhoto не был вызван');
    }
    
    // Проверяем, что wizard.next был вызван
    if (!ctx.wizard.next.mock.calls.length) {
      throw new Error('Метод wizard.next не был вызван');
    }
    
    logger.info(`[TEST] Тест успешно завершен: ${testName}`);
    return {
      name: testName,
      category: TestCategory.All,
      success: true,
      message: 'Тест входа в стартовую сцену успешно выполнен',
    };
  } catch (error) {
    logger.error(`[TEST] Ошибка в тесте ${testName}:`, error);
    return {
      name: testName,
      category: TestCategory.All,
      success: false,
      message: `Ошибка в тесте: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Тест приветственного сообщения
 */
export async function testStartScene_WelcomeMessage(): Promise<TestResult> {
  const testName = 'startScene: Welcome Message';
  
  try {
    logger.info(`[TEST] Начало теста: ${testName}`);
    setupTest();
    
    // Создаем тестовый контекст для русскоязычного пользователя
    const { ctx, replyMock } = createTestContext({ language: 'ru' });
    
    // Запускаем первый хэндлер сцены
    const handler = startScene.steps[0];
    await handler(ctx);
    
    // Проверяем, что в вызове reply есть параметр с разметкой клавиатуры
    const hasKeyboard = replyMock.mock.calls.some(call => 
      call[1] && call[1].reply_markup && call[1].reply_markup.keyboard
    );
    
    if (!hasKeyboard) {
      throw new Error('В сообщении отсутствует клавиатура');
    }
    
    logger.info(`[TEST] Тест успешно завершен: ${testName}`);
    return {
      name: testName,
      category: TestCategory.All,
      success: true,
      message: 'Тест приветственного сообщения успешно выполнен',
    };
  } catch (error) {
    logger.error(`[TEST] Ошибка в тесте ${testName}:`, error);
    return {
      name: testName,
      category: TestCategory.All,
      success: false,
      message: `Ошибка в тесте: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Тест регистрации нового пользователя
 */
export async function testStartScene_NewUserRegistration(): Promise<TestResult> {
  const testName = 'startScene: New User Registration';
  
  try {
    logger.info(`[TEST] Начало теста: ${testName}`);
    setupTest();
    
    // Создаем тестовый контекст для нового пользователя
    const { ctx, enterMock } = createTestContext({ isExistingUser: false });
    
    // Запускаем второй хэндлер сцены (проверка регистрации)
    const handler = startScene.steps[1];
    await handler(ctx);
    
    // Проверяем, что был вызван метод scene.enter с CreateUserScene
    const enterCalls = enterMock.mock.calls;
    if (!enterCalls.some(call => call[0] === ModeEnum.CreateUserScene)) {
      throw new Error('Не выполнен переход на сцену создания пользователя');
    }
    
    logger.info(`[TEST] Тест успешно завершен: ${testName}`);
    return {
      name: testName,
      category: TestCategory.All,
      success: true,
      message: 'Тест регистрации нового пользователя успешно выполнен',
    };
  } catch (error) {
    logger.error(`[TEST] Ошибка в тесте ${testName}:`, error);
    return {
      name: testName,
      category: TestCategory.All,
      success: false,
      message: `Ошибка в тесте: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Тест перехода в главное меню
 */
export async function testStartScene_GoToMainMenu(): Promise<TestResult> {
  const testName = 'startScene: Go To Main Menu';
  
  try {
    logger.info(`[TEST] Начало теста: ${testName}`);
    setupTest();
    
    // Настраиваем мок для успешной проверки статуса оплаты
    mockCheckPaymentStatus.mock.implementation = async () => true;
    
    // Создаем тестовый контекст для существующего пользователя
    const { ctx, enterMock } = createTestContext();
    
    // Запускаем второй хэндлер сцены (переход в меню)
    const handler = startScene.steps[1];
    await handler(ctx);
    
    // Проверяем, что был вызван метод scene.enter с menuScene
    const enterCalls = enterMock.mock.calls;
    if (!enterCalls.some(call => call[0] === 'menuScene')) {
      throw new Error('Не выполнен переход на сцену главного меню');
    }
    
    logger.info(`[TEST] Тест успешно завершен: ${testName}`);
    return {
      name: testName,
      category: TestCategory.All,
      success: true,
      message: 'Тест перехода в главное меню успешно выполнен',
    };
  } catch (error) {
    logger.error(`[TEST] Ошибка в тесте ${testName}:`, error);
    return {
      name: testName,
      category: TestCategory.All,
      success: false,
      message: `Ошибка в тесте: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Тест перехода на сцену оформления подписки при отсутствии подписки
 */
export async function testStartScene_GoToSubscriptionScene(): Promise<TestResult> {
  const testName = 'startScene: Go To Subscription Scene';
  
  try {
    logger.info(`[TEST] Начало теста: ${testName}`);
    setupTest();
    
    // Настраиваем мок для возврата данных без подписки
    mockGetReferalsCountAndUserData.mock.implementation = async () => ({
      count: 0,
      subscription: null,
      level: 0,
      isExist: true
    });
    
    // Создаем тестовый контекст
    const { ctx, enterMock } = createTestContext();
    
    // Запускаем второй хэндлер сцены
    const handler = startScene.steps[1];
    await handler(ctx);
    
    // Проверяем, что был вызван метод scene.enter с subscriptionScene
    const enterCalls = enterMock.mock.calls;
    if (!enterCalls.some(call => call[0] === 'subscriptionScene')) {
      throw new Error('Не выполнен переход на сцену оформления подписки');
    }
    
    logger.info(`[TEST] Тест успешно завершен: ${testName}`);
    return {
      name: testName,
      category: TestCategory.All,
      success: true,
      message: 'Тест перехода на сцену оформления подписки успешно выполнен',
    };
  } catch (error) {
    logger.error(`[TEST] Ошибка в тесте ${testName}:`, error);
    return {
      name: testName,
      category: TestCategory.All,
      success: false,
      message: `Ошибка в тесте: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Тест обработки ошибки при отсутствии ID пользователя
 */
export async function testStartScene_HandleMissingUserId(): Promise<TestResult> {
  const testName = 'startScene: Handle Missing User ID';
  
  try {
    logger.info(`[TEST] Начало теста: ${testName}`);
    setupTest();
    
    // Создаем тестовый контекст без ID пользователя
    const ctx = createMockContext({}) as unknown as MyContext;
    
    // Добавляем функциональность сцены в контекст
    ctx.session = {
      __scenes: {
        current: 'startScene',
        state: {}
      }
    } as any;
    
    // Создаем моки для методов сцены
    const leaveMock = mockApi.create({
      name: 'scene.leave',
      implementation: async () => true
    });
    
    ctx.scene = {
      leave: leaveMock
    } as any;
    
    // Мокируем метод reply
    const replyMock = mockApi.create({
      name: 'reply',
      implementation: async () => true
    });
    
    ctx.reply = replyMock as any;
    
    // Запускаем второй хэндлер сцены
    const handler = startScene.steps[1];
    await handler(ctx);
    
    // Проверяем, что был вызван метод scene.leave
    if (leaveMock.mock.calls.length === 0) {
      throw new Error('Метод scene.leave не был вызван');
    }
    
    // Проверяем, что было отправлено сообщение об ошибке
    const replyWithErrorCalled = replyMock.mock.calls.some(call => 
      call[0] && typeof call[0] === 'string' && 
      (call[0].includes('Error') || call[0].includes('Ошибка'))
    );
    
    if (!replyWithErrorCalled) {
      throw new Error('Не было отправлено сообщение об ошибке');
    }
    
    logger.info(`[TEST] Тест успешно завершен: ${testName}`);
    return {
      name: testName,
      category: TestCategory.All,
      success: true,
      message: 'Тест обработки ошибки при отсутствии ID пользователя успешно выполнен',
    };
  } catch (error) {
    logger.error(`[TEST] Ошибка в тесте ${testName}:`, error);
    return {
      name: testName,
      category: TestCategory.All,
      success: false,
      message: `Ошибка в тесте: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
} 