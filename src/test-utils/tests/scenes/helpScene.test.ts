import { MyContext } from '@/interfaces';
import { TestResult } from '../../core/types';
import { TestCategory } from '../../core/categories';
import mockApi from '../../core/mock';
import * as supabaseModule from '@/core/supabase';
import { helpScene } from '@/scenes/helpScene';
import { createMockContext } from '@/test-utils/helpers/createMockContext';
import { logger } from '@/utils/logger';
import { ModeEnum } from '@/price/helpers/modelsCost';
import * as levelHandlers from '@/scenes/levelQuestWizard/handlers';

// Создаем моки для функций из supabase
const mockGetReferalsCountAndUserData = mockApi.create({
  name: 'getReferalsCountAndUserData',
  implementation: async (_telegram_id: string) => ({
    count: 5,
    subscription: 'stars',
    level: 1,
    isExist: true
  })
});

// Создаем моки для обработчиков уровней
const mockHandleLevels = {};

Object.keys(levelHandlers).forEach(key => {
  if (key.startsWith('handleLevel')) {
    mockHandleLevels[key] = mockApi.create({
      name: key,
      implementation: async (_ctx: any) => true
    });
    (levelHandlers as any)[key] = mockHandleLevels[key];
  }
});

/**
 * Настройка тестового окружения
 */
const setupTest = () => {
  // Переопределяем функции для тестов
  (supabaseModule as any).getReferalsCountAndUserData = mockGetReferalsCountAndUserData;
  
  // Сбрасываем историю вызовов моков
  mockGetReferalsCountAndUserData.mock.clear();
  
  // Сбрасываем моки обработчиков уровней
  Object.values(mockHandleLevels).forEach((mock: any) => {
    mock.mock.clear();
  });
};

/**
 * Создание тестового контекста
 */
const createTestContext = (options: { language?: string, mode?: ModeEnum } = {}) => {
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

  // Добавляем функциональность сцены в контекст
  ctx.session = {
    __scenes: {
      current: 'helpScene',
      state: {}
    },
    mode: options.mode
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

  return { 
    ctx, 
    replyMock, 
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
 * Тест входа в сцену помощи
 */
export async function testHelpScene_EnterScene(): Promise<TestResult> {
  const testName = 'helpScene: Enter Scene';
  
  try {
    logger.info(`[TEST] Начало теста: ${testName}`);
    setupTest();
    
    // Создаем тестовый контекст с режимом DigitalAvatarBody
    const { ctx, replyMock } = createTestContext({ mode: ModeEnum.DigitalAvatarBody });
    
    // Получаем обработчик входа в сцену
    const enterHandler = helpScene.enterHandler;
    if (!enterHandler) {
      throw new Error('Не найден обработчик входа в сцену');
    }
    
    // Вызываем обработчик входа
    await enterHandler(ctx);
    
    // Проверяем, что был вызван обработчик первого уровня
    const handleLevel1Mock = mockHandleLevels['handleLevel1'] as any;
    if (handleLevel1Mock.mock.calls.length === 0) {
      throw new Error('Метод handleLevel1 не был вызван');
    }
    
    // Проверяем, что был вызван метод reply
    if (replyMock.mock.calls.length === 0) {
      throw new Error('Метод reply не был вызван');
    }
    
    logger.info(`[TEST] Тест успешно завершен: ${testName}`);
    return {
      name: testName,
      category: TestCategory.All,
      success: true,
      message: 'Тест входа в сцену помощи успешно выполнен',
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
 * Тест отображения справочной информации для различных режимов
 */
export async function testHelpScene_DisplayHelp(): Promise<TestResult> {
  const testName = 'helpScene: Display Help';
  
  try {
    logger.info(`[TEST] Начало теста: ${testName}`);
    setupTest();
    
    // Список режимов для проверки
    const modes = [
      ModeEnum.NeuroPhoto,
      ModeEnum.ImageToPrompt,
      ModeEnum.Avatar,
      ModeEnum.ChatWithAvatar,
      ModeEnum.Voice
    ];
    
    // Проверяем обработку разных режимов
    for (const mode of modes) {
      // Создаем тестовый контекст для текущего режима
      const { ctx, replyMock } = createTestContext({ mode });
      
      // Получаем обработчик входа в сцену
      const enterHandler = helpScene.enterHandler;
      if (!enterHandler) {
        throw new Error('Не найден обработчик входа в сцену');
      }
      
      // Сбрасываем историю вызовов моков перед каждым тестом
      replyMock.mock.clear();
      Object.values(mockHandleLevels).forEach((mock: any) => {
        mock.mock.clear();
      });
      
      // Вызываем обработчик входа
      await enterHandler(ctx);
      
      // Проверяем, что был вызван метод reply
      if (replyMock.mock.calls.length === 0) {
        throw new Error(`Метод reply не был вызван для режима ${mode}`);
      }
      
      // Проверяем, что был вызван соответствующий обработчик уровня
      const handlers = Object.entries(mockHandleLevels);
      const calledHandler = handlers.find(([_, mock]) => (mock as any).mock.calls.length > 0);
      
      if (!calledHandler) {
        throw new Error(`Не вызван ни один обработчик уровня для режима ${mode}`);
      }
    }
    
    logger.info(`[TEST] Тест успешно завершен: ${testName}`);
    return {
      name: testName,
      category: TestCategory.All,
      success: true,
      message: 'Тест отображения справочной информации успешно выполнен',
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
 * Тест навигации по разделам справки (вызов разных обработчиков в зависимости от режима)
 */
export async function testHelpScene_Navigation(): Promise<TestResult> {
  const testName = 'helpScene: Navigation';
  
  try {
    logger.info(`[TEST] Начало теста: ${testName}`);
    setupTest();
    
    // Проверяем обработку режима DigitalAvatarBody
    const { ctx: ctx1 } = createTestContext({ mode: ModeEnum.DigitalAvatarBody });
    const enterHandler = helpScene.enterHandler;
    if (!enterHandler) {
      throw new Error('Не найден обработчик входа в сцену');
    }
    await enterHandler(ctx1);
    
    // Проверяем, что был вызван handleLevel1
    const handleLevel1Mock = mockHandleLevels['handleLevel1'] as any;
    if (handleLevel1Mock.mock.calls.length === 0) {
      throw new Error('Метод handleLevel1 не был вызван');
    }
    
    // Сбрасываем историю вызовов моков
    Object.values(mockHandleLevels).forEach((mock: any) => {
      mock.mock.clear();
    });
    
    // Проверяем обработку режима NeuroPhoto
    const { ctx: ctx2 } = createTestContext({ mode: ModeEnum.NeuroPhoto });
    await enterHandler(ctx2);
    
    // Проверяем, что был вызван handleLevel2
    const handleLevel2Mock = mockHandleLevels['handleLevel2'] as any;
    if (handleLevel2Mock.mock.calls.length === 0) {
      throw new Error('Метод handleLevel2 не был вызван');
    }
    
    // Сбрасываем историю вызовов моков
    Object.values(mockHandleLevels).forEach((mock: any) => {
      mock.mock.clear();
    });
    
    // Проверяем обработку режима ImageToPrompt
    const { ctx: ctx3 } = createTestContext({ mode: ModeEnum.ImageToPrompt });
    await enterHandler(ctx3);
    
    // Проверяем, что был вызван handleLevel3
    const handleLevel3Mock = mockHandleLevels['handleLevel3'] as any;
    if (handleLevel3Mock.mock.calls.length === 0) {
      throw new Error('Метод handleLevel3 не был вызван');
    }
    
    logger.info(`[TEST] Тест успешно завершен: ${testName}`);
    return {
      name: testName,
      category: TestCategory.All,
      success: true,
      message: 'Тест навигации по разделам справки успешно выполнен',
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
 * Тест возврата в меню (переход в step0 для режима Help)
 */
export async function testHelpScene_BackToMenu(): Promise<TestResult> {
  const testName = 'helpScene: Back To Menu';
  
  try {
    logger.info(`[TEST] Начало теста: ${testName}`);
    setupTest();
    
    // Создаем тестовый контекст с режимом Help
    const { ctx, enterMock } = createTestContext({ mode: ModeEnum.Help });
    
    // Получаем обработчик входа в сцену
    const enterHandler = helpScene.enterHandler;
    if (!enterHandler) {
      throw new Error('Не найден обработчик входа в сцену');
    }
    
    // Вызываем обработчик входа
    await enterHandler(ctx);
    
    // Проверяем, что был вызван метод scene.enter с 'step0'
    const enterCalls = enterMock.mock.calls;
    if (!enterCalls.some(call => call[0] === 'step0')) {
      throw new Error('Не выполнен переход на сцену step0');
    }
    
    logger.info(`[TEST] Тест успешно завершен: ${testName}`);
    return {
      name: testName,
      category: TestCategory.All,
      success: true,
      message: 'Тест возврата в меню успешно выполнен',
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
 * Тест обработки неизвестного режима
 */
export async function testHelpScene_HandlesUnknownMode(): Promise<TestResult> {
  const testName = 'helpScene: Handles Unknown Mode';
  
  try {
    logger.info(`[TEST] Начало теста: ${testName}`);
    setupTest();
    
    // Создаем тестовый контекст с несуществующим режимом
    const { ctx, enterMock } = createTestContext({ mode: 'unknownMode' as any });
    
    // Получаем обработчик входа в сцену
    const enterHandler = helpScene.enterHandler;
    if (!enterHandler) {
      throw new Error('Не найден обработчик входа в сцену');
    }
    
    // Вызываем обработчик входа
    await enterHandler(ctx);
    
    // Проверяем, что был вызван метод scene.enter с 'step0'
    const enterCalls = enterMock.mock.calls;
    if (!enterCalls.some(call => call[0] === 'step0')) {
      throw new Error('Не выполнен переход на сцену step0 для неизвестного режима');
    }
    
    logger.info(`[TEST] Тест успешно завершен: ${testName}`);
    return {
      name: testName,
      category: TestCategory.All,
      success: true,
      message: 'Тест обработки неизвестного режима успешно выполнен',
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
 * Тест обработки ошибок
 */
export async function testHelpScene_HandlesErrors(): Promise<TestResult> {
  const testName = 'helpScene: Handles Errors';
  
  try {
    logger.info(`[TEST] Начало теста: ${testName}`);
    setupTest();
    
    // Создаем тестовый контекст
    const { ctx, replyMock } = createTestContext({ mode: ModeEnum.DigitalAvatarBody });
    
    // Получаем обработчик входа в сцену
    const enterHandler = helpScene.enterHandler;
    if (!enterHandler) {
      throw new Error('Не найден обработчик входа в сцену');
    }
    
    // Имитируем ошибку в обработчике уровня
    const mockHandleLevel1 = mockHandleLevels['handleLevel1'] as any;
    mockHandleLevel1.mock.implementation = async () => {
      throw new Error('Тестовая ошибка в обработчике уровня');
    };
    
    // Вызываем обработчик входа
    await enterHandler(ctx);
    
    // Проверяем, что было отправлено сообщение об ошибке
    const replyWithErrorCalled = replyMock.mock.calls.some(call => 
      call[0] && typeof call[0] === 'string' && 
      call[0].includes('ошибка')
    );
    
    if (!replyWithErrorCalled) {
      throw new Error('Не было отправлено сообщение об ошибке');
    }
    
    logger.info(`[TEST] Тест успешно завершен: ${testName}`);
    return {
      name: testName,
      category: TestCategory.All,
      success: true,
      message: 'Тест обработки ошибок успешно выполнен',
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