import { Middleware } from 'telegraf';
import { createMockContext } from '../../core/mockContext';
import { TestResult } from '../../core/types';
import { assertReplyContains, assertScene } from '../../core/assertions';
import { create as mockFunction, MockedFunction } from '../../core/mock';
import { TestCategory } from '../../core/categories';
import { logger } from '../../../utils/logger';
import type { MyContext } from '../../../interfaces';

// Константы для тестирования
const TEST_USER_ID = 123456789;
const TEST_USERNAME = 'test_user';

// Мокируем inngest клиент
const mockInngestSend = mockFunction<any, any>();

// Моки для вспомогательных функций
const mockIsRussian = mockFunction<any, boolean>();
const mockHandleHelpCancel = mockFunction<any, boolean>();

/**
 * Настройка тестового контекста для сцены генератора идей
 */
function setupContext(language: 'ru' | 'en' = 'ru') {
  // Создаем мок-контекст
  const ctx = createMockContext();
  
  // Настраиваем данные пользователя
  ctx.from = { 
    id: TEST_USER_ID, 
    username: TEST_USERNAME, 
    language_code: language 
  } as any;
  
  // Настраиваем сессию
  ctx.session = { 
    language: language
  } as any;

  // Устанавливаем язык для определения русского языка
  mockIsRussian.mockImplementation(() => language === 'ru');
  
  // По умолчанию отключаем отмену действия
  mockHandleHelpCancel.mockReturnValue(false);

  return ctx;
}

/**
 * Тест для проверки входа в сцену генератора идей (русский язык)
 */
export async function testIdeasGeneratorScene_Enter(): Promise<TestResult> {
  logger.info('🧪 Запуск теста: вход в сцену генератора идей (русский язык)');
  
  try {
    // Настраиваем контекст
    const ctx = setupContext('ru');
    
    // Импортируем сцену
    const { ideasGeneratorScene } = await import('../../../scenes/ideasGeneratorScene');
    
    // Вызываем первый шаг сцены напрямую
    if (ideasGeneratorScene.steps && ideasGeneratorScene.steps.length > 0) {
      const enterHandler = ideasGeneratorScene.steps[0];
      if (typeof enterHandler === 'function') {
        await enterHandler(ctx as any);
      }
    }
    
    // Проверки
    assertReplyContains(ctx, 'Генератор идей: введите тему', 'message');
    
    // Проверяем кнопку отмены
    assertReplyContains(ctx, 'Отмена', 'message');
    
    logger.info('✅ Тест успешно пройден: вход в сцену генератора идей (русский язык)');
    
    return {
      name: 'IdeasGeneratorScene: Enter Scene (RU)',
      category: TestCategory.All,
      success: true,
      message: 'Тест входа в сцену генератора идей (русский язык) успешно пройден'
    };
  } catch (error) {
    logger.error('❌ Ошибка в тесте входа в сцену генератора идей (русский язык):', error);
    
    return {
      name: 'IdeasGeneratorScene: Enter Scene (RU)',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Тест для проверки входа в сцену генератора идей (английский язык)
 */
export async function testIdeasGeneratorScene_EnterEnglish(): Promise<TestResult> {
  logger.info('🧪 Запуск теста: вход в сцену генератора идей (английский язык)');
  
  try {
    // Настраиваем контекст
    const ctx = setupContext('en');
    
    // Импортируем сцену
    const { ideasGeneratorScene } = await import('../../../scenes/ideasGeneratorScene');
    
    // Вызываем первый шаг сцены напрямую
    if (ideasGeneratorScene.steps && ideasGeneratorScene.steps.length > 0) {
      const enterHandler = ideasGeneratorScene.steps[0];
      if (typeof enterHandler === 'function') {
        await enterHandler(ctx as any);
      }
    }
    
    // Проверки
    assertReplyContains(ctx, 'Ideas Generator: enter a topic', 'message');
    
    // Проверяем кнопку отмены
    assertReplyContains(ctx, 'Cancel', 'message');
    
    logger.info('✅ Тест успешно пройден: вход в сцену генератора идей (английский язык)');
    
    return {
      name: 'IdeasGeneratorScene: Enter Scene (EN)',
      category: TestCategory.All,
      success: true,
      message: 'Тест входа в сцену генератора идей (английский язык) успешно пройден'
    };
  } catch (error) {
    logger.error('❌ Ошибка в тесте входа в сцену генератора идей (английский язык):', error);
    
    return {
      name: 'IdeasGeneratorScene: Enter Scene (EN)',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Тест для проверки обработки текстового запроса на генерацию идей
 */
export async function testIdeasGeneratorScene_GenerateIdeas(): Promise<TestResult> {
  logger.info('🧪 Запуск теста: обработка запроса на генерацию идей');
  
  try {
    // Настраиваем контекст
    const ctx = setupContext('ru');
    
    // Устанавливаем сообщение пользователя
    const testPrompt = 'идеи для блога о технологиях';
    ctx.message = {
      text: testPrompt,
      message_id: 123,
    } as any;
    
    // Сбрасываем мок для отправки Inngest-события
    mockInngestSend.mockClear().mockResolvedValue({});
    
    // Импортируем сцену и подменяем inngest клиент
    const inngestModule = await import('../../../inngest-functions/clients');
    Object.defineProperty(inngestModule, 'inngest', {
      value: { send: mockInngestSend },
      writable: true
    });
    
    const { ideasGeneratorScene } = await import('../../../scenes/ideasGeneratorScene');
    
    // Вызываем второй шаг сцены напрямую (обработка запроса)
    if (ideasGeneratorScene.steps && ideasGeneratorScene.steps.length > 1) {
      const promptHandler = ideasGeneratorScene.steps[1];
      if (typeof promptHandler === 'function') {
        await promptHandler(ctx as any);
      }
    }
    
    // Проверяем, что было отправлено сообщение о генерации
    assertReplyContains(ctx, 'Генерирую идеи по вашему запросу', 'message');
    
    // Проверяем вызов функции inngest с правильными параметрами
    expect(mockInngestSend).toHaveBeenCalledWith({
      name: 'generate.ideas.requested',
      data: {
        userId: TEST_USER_ID,
        prompt: testPrompt,
        language: 'ru'
      }
    });
    
    logger.info('✅ Тест успешно пройден: обработка запроса на генерацию идей');
    
    return {
      name: 'IdeasGeneratorScene: Generate Ideas',
      category: TestCategory.All,
      success: true,
      message: 'Тест обработки запроса на генерацию идей успешно пройден'
    };
  } catch (error) {
    logger.error('❌ Ошибка в тесте обработки запроса на генерацию идей:', error);
    
    return {
      name: 'IdeasGeneratorScene: Generate Ideas',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Тест для проверки обработки отмены в сцене генератора идей
 */
export async function testIdeasGeneratorScene_Cancel(): Promise<TestResult> {
  logger.info('🧪 Запуск теста: отмена генерации идей');
  
  try {
    // Настраиваем контекст
    const ctx = setupContext('ru');
    
    // Устанавливаем сообщение пользователя (кнопка отмены)
    ctx.message = {
      text: 'Отмена',
      message_id: 123
    } as any;
    
    // Подменяем функцию handleHelpCancel, чтобы она возвращала true (отмена)
    mockHandleHelpCancel.mockReturnValue(true);
    
    // Импортируем модуль с функцией handleHelpCancel и подменяем ее
    const handlersModule = await import('../../../handlers');
    Object.defineProperty(handlersModule, 'handleHelpCancel', {
      value: mockHandleHelpCancel,
      writable: true
    });
    
    // Импортируем сцену
    const { ideasGeneratorScene } = await import('../../../scenes/ideasGeneratorScene');
    
    // Вызываем второй шаг сцены напрямую
    if (ideasGeneratorScene.steps && ideasGeneratorScene.steps.length > 1) {
      const promptHandler = ideasGeneratorScene.steps[1];
      if (typeof promptHandler === 'function') {
        await promptHandler(ctx as any);
      }
    }
    
    // Проверяем, что был вызван handleHelpCancel
    expect(mockHandleHelpCancel).toHaveBeenCalled();
    
    logger.info('✅ Тест успешно пройден: отмена генерации идей');
    
    return {
      name: 'IdeasGeneratorScene: Cancel',
      category: TestCategory.All,
      success: true,
      message: 'Тест отмены генерации идей успешно пройден'
    };
  } catch (error) {
    logger.error('❌ Ошибка в тесте отмены генерации идей:', error);
    
    return {
      name: 'IdeasGeneratorScene: Cancel',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Тест для проверки обработки ошибки при отсутствии текста сообщения
 */
export async function testIdeasGeneratorScene_NoTextMessage(): Promise<TestResult> {
  logger.info('🧪 Запуск теста: обработка отсутствия текста сообщения');
  
  try {
    // Настраиваем контекст
    const ctx = setupContext('ru');
    
    // Устанавливаем сообщение без текста (например, только с фото)
    ctx.message = {
      message_id: 123,
      photo: [{ file_id: 'test_file_id' }]
    } as any;
    
    // Импортируем сцену
    const { ideasGeneratorScene } = await import('../../../scenes/ideasGeneratorScene');
    
    // Вызываем второй шаг сцены напрямую
    if (ideasGeneratorScene.steps && ideasGeneratorScene.steps.length > 1) {
      const promptHandler = ideasGeneratorScene.steps[1];
      if (typeof promptHandler === 'function') {
        await promptHandler(ctx as any);
      }
    }
    
    // Проверяем сообщение об ошибке
    assertReplyContains(ctx, 'Пожалуйста, введите текстовый запрос', 'message');
    
    logger.info('✅ Тест успешно пройден: обработка отсутствия текста сообщения');
    
    return {
      name: 'IdeasGeneratorScene: No Text Message',
      category: TestCategory.All,
      success: true,
      message: 'Тест обработки отсутствия текста сообщения успешно пройден'
    };
  } catch (error) {
    logger.error('❌ Ошибка в тесте обработки отсутствия текста сообщения:', error);
    
    return {
      name: 'IdeasGeneratorScene: No Text Message',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Запускает все тесты для сцены генератора идей
 */
export async function runIdeasGeneratorSceneTests(): Promise<TestResult[]> {
  logger.info('🚀 Запуск всех тестов для сцены генератора идей...');
  
  const results = await Promise.all([
    testIdeasGeneratorScene_Enter(),
    testIdeasGeneratorScene_EnterEnglish(),
    testIdeasGeneratorScene_GenerateIdeas(),
    testIdeasGeneratorScene_Cancel(),
    testIdeasGeneratorScene_NoTextMessage()
  ]);
  
  // Подсчет успешных и неуспешных тестов
  const successCount = results.filter(r => r.success).length;
  const failCount = results.length - successCount;
  
  logger.info(`📊 Результаты тестов: ${successCount}/${results.length} успешно, ${failCount} неудачно`);
  
  return results;
}

// Хелпер для проверки вызова моков
function expect<T = any, R = any>(mockFn: MockedFunction<T, R>) {
  return {
    toHaveBeenCalled: () => {
      if (mockFn.mock.calls.length === 0) {
        throw new Error('Ожидалось, что функция будет вызвана');
      }
    },
    toHaveBeenCalledWith: (expectedArg: any) => {
      const wasCalled = mockFn.mock.calls.some((call: any[]) => {
        // Простая проверка на соответствие переданного аргумента
        if (typeof call[0] === 'object' && call[0] !== null && typeof expectedArg === 'object' && expectedArg !== null) {
          // Проверяем все свойства, которые ожидаем увидеть
          return Object.keys(expectedArg).every(key => 
            JSON.stringify(call[0][key]) === JSON.stringify(expectedArg[key])
          );
        }
        
        return JSON.stringify(call[0]) === JSON.stringify(expectedArg);
      });
      
      if (!wasCalled) {
        throw new Error(`Ожидался вызов функции с аргументом: ${JSON.stringify(expectedArg)}`);
      }
    }
  };
} 