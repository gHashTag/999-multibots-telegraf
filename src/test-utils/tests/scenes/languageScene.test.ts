import { MyContext } from '@/interfaces';
import { TestResult } from '@/test-utils/core/types';
import { TestCategory } from '@/test-utils/core/categories';
import mockApi from '@/test-utils/core/mock';
import { createMockContext } from '@/test-utils/helpers/createMockContext';
import { languageScene } from '@/scenes/languageScene';
import { logger } from '@/utils/logger';
import * as languageHelpers from '@/helpers/language';

// Создаем моки для функций из helpers/language
const mockGetUserLanguage = mockApi.create({
  name: 'getUserLanguage',
  implementation: (ctx: any) => ctx.session?.language || 'en'
});

const mockSetUserLanguage = mockApi.create({
  name: 'setUserLanguage',
  implementation: (ctx: any, language: string) => {
    if (ctx.session) {
      ctx.session.language = language;
    }
    return true;
  }
});

const mockGetSupportedLanguages = mockApi.create({
  name: 'getSupportedLanguages',
  implementation: () => ['en', 'ru']
});

/**
 * Настройка тестового окружения
 */
const setupTest = () => {
  // Переопределяем функции для тестов
  (languageHelpers as any).getUserLanguage = mockGetUserLanguage;
  (languageHelpers as any).setUserLanguage = mockSetUserLanguage;
  (languageHelpers as any).getSupportedLanguages = mockGetSupportedLanguages;
  
  // Сбрасываем историю вызовов моков
  mockGetUserLanguage.mock.clear();
  mockSetUserLanguage.mock.clear();
  mockGetSupportedLanguages.mock.clear();
};

/**
 * Создание тестового контекста
 */
const createTestContext = (options: { language?: string, callbackData?: string } = {}) => {
  // Создаем тестового пользователя
  const testUser = {
    id: 123456789,
    telegram_id: '123456789',
    username: 'testuser',
    language_code: options.language || 'en'
  };

  // Создаем мок контекста с тестовым пользователем
  const ctx = createMockContext({
    user: testUser,
    callbackData: options.callbackData,
  }) as unknown as MyContext;

  // Добавляем функциональность сцены в контекст
  ctx.session = {
    __scenes: {
      current: 'languageScene',
      state: {}
    },
    language: options.language || 'en'
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
  
  const editMessageTextMock = mockApi.create({
    name: 'editMessageText',
    implementation: async () => true
  });
  
  ctx.editMessageText = editMessageTextMock as any;
  
  const answerCbQueryMock = mockApi.create({
    name: 'answerCbQuery',
    implementation: async () => true
  });
  
  ctx.answerCbQuery = answerCbQueryMock as any;

  // Если есть callbackData, создаем callbackQuery
  if (options.callbackData) {
    ctx.callbackQuery = {
      data: options.callbackData
    } as any;
    
    // Для regexp match в обработчиках actions
    ctx.match = options.callbackData.match(/^language:(.+)$/);
  }

  return { 
    ctx, 
    replyMock, 
    editMessageTextMock,
    answerCbQueryMock,
    enterMock, 
    leaveMock 
  };
};

/**
 * Проверка наличия определенного текста в сообщении
 */
const assertReplyContains = (replyMock: any, expectedText: string, errorMessage: string) => {
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
 * Проверка наличия кнопок в инлайн-клавиатуре сообщения
 */
const assertInlineKeyboardContains = (replyMock: any, expectedButtons: string[], errorMessage: string) => {
  // Проверяем все вызовы метода reply с клавиатурой
  const calls = replyMock?.mock?.calls || [];
  const replyCall = calls.find(
    (call: any[]) => call && Array.isArray(call) && call[1] && call[1].reply_markup && call[1].reply_markup.inline_keyboard
  );
  
  if (!replyCall) {
    throw new Error(errorMessage);
  }
  
  const keyboard = replyCall[1].reply_markup.inline_keyboard;
  const allButtons = keyboard.flat().map((button: any) => button.text);
  
  expectedButtons.forEach(expectedButton => {
    if (!allButtons.some((button: string) => button.includes(expectedButton))) {
      throw new Error(`${errorMessage}: Кнопка "${expectedButton}" не найдена в клавиатуре`);
    }
  });
};

/**
 * Тест входа в сцену выбора языка
 */
export async function testLanguageScene_EnterScene(): Promise<TestResult> {
  const testName = 'languageScene: Enter Scene';
  
  try {
    logger.info(`[TEST] Начало теста: ${testName}`);
    setupTest();
    
    // Создаем тестовый контекст с английским языком
    const { ctx, replyMock } = createTestContext({ language: 'en' });
    
    // Получаем обработчик входа в сцену
    const enterHandler = languageScene.enterHandler;
    if (!enterHandler) {
      throw new Error('Не найден обработчик входа в сцену');
    }
    
    // Вызываем обработчик входа
    await enterHandler(ctx);
    
    // Проверяем, что был вызван метод getUserLanguage
    if (mockGetUserLanguage.mock.calls.length === 0) {
      throw new Error('Метод getUserLanguage не был вызван');
    }
    
    // Проверяем, что был вызван метод reply
    if (replyMock.mock.calls.length === 0) {
      throw new Error('Метод reply не был вызван');
    }
    
    // Проверяем наличие заголовка на английском
    assertReplyContains(replyMock, 'Language Selection', 'Заголовок выбора языка не найден в сообщении');
    
    // Проверяем наличие кнопок языка
    assertInlineKeyboardContains(replyMock, ['English', 'Русский'], 'Кнопки выбора языка не найдены');
    
    logger.info(`[TEST] Тест успешно завершен: ${testName}`);
    return {
      name: testName,
      category: TestCategory.All,
      success: true,
      message: 'Тест входа в сцену выбора языка успешно выполнен',
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
 * Тест смены языка на русский
 */
export async function testLanguageScene_ChangeToRussian(): Promise<TestResult> {
  const testName = 'languageScene: Change To Russian';
  
  try {
    logger.info(`[TEST] Начало теста: ${testName}`);
    setupTest();
    
    // Создаем тестовый контекст с английским языком и callbackData для смены на русский
    const { ctx, editMessageTextMock, answerCbQueryMock } = createTestContext({ 
      language: 'en',
      callbackData: 'language:ru'
    });
    
    // Найдем обработчик для action language
    const actionHandlers = languageScene.actions;
    const languageActionHandler = actionHandlers.find(handler => 
      handler.value instanceof RegExp && handler.value.toString() === '/^language:(.+)$/'
    );
    
    if (!languageActionHandler || !languageActionHandler.callback) {
      throw new Error('Обработчик действия language не найден');
    }
    
    // Вызываем обработчик действия
    await languageActionHandler.callback(ctx);
    
    // Проверяем, что был вызван метод setUserLanguage с правильными параметрами
    const setUserLanguageCalls = mockSetUserLanguage.mock.calls;
    if (setUserLanguageCalls.length === 0) {
      throw new Error('Метод setUserLanguage не был вызван');
    }
    
    if (setUserLanguageCalls[0][1] !== 'ru') {
      throw new Error(`Неверный язык: ожидался 'ru', получен '${setUserLanguageCalls[0][1]}'`);
    }
    
    // Проверяем, что был вызван метод answerCbQuery с сообщением на русском
    const answerCbQueryCalls = answerCbQueryMock.mock.calls;
    if (answerCbQueryCalls.length === 0) {
      throw new Error('Метод answerCbQuery не был вызван');
    }
    
    if (!answerCbQueryCalls[0][0].includes('Русский')) {
      throw new Error('Сообщение о смене языка не содержит упоминания русского языка');
    }
    
    // Проверяем, что был вызван метод editMessageText для обновления меню
    if (editMessageTextMock.mock.calls.length === 0) {
      throw new Error('Метод editMessageText не был вызван');
    }
    
    logger.info(`[TEST] Тест успешно завершен: ${testName}`);
    return {
      name: testName,
      category: TestCategory.All,
      success: true,
      message: 'Тест смены языка на русский успешно выполнен',
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
 * Тест смены языка на английский
 */
export async function testLanguageScene_ChangeToEnglish(): Promise<TestResult> {
  const testName = 'languageScene: Change To English';
  
  try {
    logger.info(`[TEST] Начало теста: ${testName}`);
    setupTest();
    
    // Создаем тестовый контекст с русским языком и callbackData для смены на английский
    const { ctx, editMessageTextMock, answerCbQueryMock } = createTestContext({ 
      language: 'ru',
      callbackData: 'language:en'
    });
    
    // Найдем обработчик для action language
    const actionHandlers = languageScene.actions;
    const languageActionHandler = actionHandlers.find(handler => 
      handler.value instanceof RegExp && handler.value.toString() === '/^language:(.+)$/'
    );
    
    if (!languageActionHandler || !languageActionHandler.callback) {
      throw new Error('Обработчик действия language не найден');
    }
    
    // Вызываем обработчик действия
    await languageActionHandler.callback(ctx);
    
    // Проверяем, что был вызван метод setUserLanguage с правильными параметрами
    const setUserLanguageCalls = mockSetUserLanguage.mock.calls;
    if (setUserLanguageCalls.length === 0) {
      throw new Error('Метод setUserLanguage не был вызван');
    }
    
    if (setUserLanguageCalls[0][1] !== 'en') {
      throw new Error(`Неверный язык: ожидался 'en', получен '${setUserLanguageCalls[0][1]}'`);
    }
    
    // Проверяем, что был вызван метод answerCbQuery с сообщением на английском
    const answerCbQueryCalls = answerCbQueryMock.mock.calls;
    if (answerCbQueryCalls.length === 0) {
      throw new Error('Метод answerCbQuery не был вызван');
    }
    
    if (!answerCbQueryCalls[0][0].includes('English')) {
      throw new Error('Сообщение о смене языка не содержит упоминания английского языка');
    }
    
    // Проверяем, что был вызван метод editMessageText для обновления меню
    if (editMessageTextMock.mock.calls.length === 0) {
      throw new Error('Метод editMessageText не был вызван');
    }
    
    logger.info(`[TEST] Тест успешно завершен: ${testName}`);
    return {
      name: testName,
      category: TestCategory.All,
      success: true,
      message: 'Тест смены языка на английский успешно выполнен',
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
 * Тест для неподдерживаемого языка
 */
export async function testLanguageScene_UnsupportedLanguage(): Promise<TestResult> {
  const testName = 'languageScene: Unsupported Language';
  
  try {
    logger.info(`[TEST] Начало теста: ${testName}`);
    setupTest();
    
    // Создаем тестовый контекст с callbackData для неподдерживаемого языка
    const { ctx, answerCbQueryMock, editMessageTextMock } = createTestContext({ 
      callbackData: 'language:fr'
    });
    
    // Имитируем match для неподдерживаемого языка
    ctx.match = ['language:fr', 'fr'];
    
    // Найдем обработчик для action language
    const actionHandlers = languageScene.actions;
    const languageActionHandler = actionHandlers.find(handler => 
      handler.value instanceof RegExp && handler.value.toString() === '/^language:(.+)$/'
    );
    
    if (!languageActionHandler || !languageActionHandler.callback) {
      throw new Error('Обработчик действия language не найден');
    }
    
    // Вызываем обработчик действия
    await languageActionHandler.callback(ctx);
    
    // Проверяем, что метод setUserLanguage не был вызван
    if (mockSetUserLanguage.mock.calls.length > 0) {
      throw new Error('Метод setUserLanguage был вызван для неподдерживаемого языка');
    }
    
    // Проверяем, что был вызван метод answerCbQuery с сообщением об ошибке
    const answerCbQueryCalls = answerCbQueryMock.mock.calls;
    if (answerCbQueryCalls.length === 0) {
      throw new Error('Метод answerCbQuery не был вызван');
    }
    
    if (!answerCbQueryCalls[0][0].includes('Unsupported')) {
      throw new Error('Сообщение не содержит информации о неподдерживаемом языке');
    }
    
    // Проверяем, что метод editMessageText не был вызван
    if (editMessageTextMock.mock.calls.length > 0) {
      throw new Error('Метод editMessageText был вызван для неподдерживаемого языка');
    }
    
    logger.info(`[TEST] Тест успешно завершен: ${testName}`);
    return {
      name: testName,
      category: TestCategory.All,
      success: true,
      message: 'Тест обработки неподдерживаемого языка успешно выполнен',
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
 * Тест возврата в меню
 */
export async function testLanguageScene_BackToMenu(): Promise<TestResult> {
  const testName = 'languageScene: Back To Menu';
  
  try {
    logger.info(`[TEST] Начало теста: ${testName}`);
    setupTest();
    
    // Создаем тестовый контекст с callbackData для возврата в меню
    const { ctx, enterMock, answerCbQueryMock } = createTestContext({ 
      callbackData: 'back_to_menu'
    });
    
    // Найдем обработчик для action back_to_menu
    const actionHandlers = languageScene.actions;
    const backToMenuHandler = actionHandlers.find(handler => 
      handler.value === 'back_to_menu'
    );
    
    if (!backToMenuHandler || !backToMenuHandler.callback) {
      throw new Error('Обработчик действия back_to_menu не найден');
    }
    
    // Вызываем обработчик действия
    await backToMenuHandler.callback(ctx);
    
    // Проверяем, что был вызван метод answerCbQuery
    if (answerCbQueryMock.mock.calls.length === 0) {
      throw new Error('Метод answerCbQuery не был вызван');
    }
    
    // Проверяем, что был вызван метод scene.enter с menuScene
    const enterCalls = enterMock.mock.calls;
    if (enterCalls.length === 0) {
      throw new Error('Метод scene.enter не был вызван');
    }
    
    if (enterCalls[0][0] !== 'menuScene') {
      throw new Error(`Неверная сцена: ожидалась 'menuScene', получена '${enterCalls[0][0]}'`);
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
 * Тест для проверки корректности отображения текущего языка
 */
export async function testLanguageScene_CurrentLanguageIndicator(): Promise<TestResult> {
  const testName = 'languageScene: Current Language Indicator';
  
  try {
    logger.info(`[TEST] Начало теста: ${testName}`);
    setupTest();
    
    // Создаем тестовый контекст с русским языком
    const { ctx, replyMock } = createTestContext({ language: 'ru' });
    
    // Получаем обработчик входа в сцену
    const enterHandler = languageScene.enterHandler;
    if (!enterHandler) {
      throw new Error('Не найден обработчик входа в сцену');
    }
    
    // Вызываем обработчик входа
    await enterHandler(ctx);
    
    // Проверяем, что у кнопки русского языка есть индикатор выбора
    const calls = replyMock.mock.calls;
    if (calls.length === 0) {
      throw new Error('Метод reply не был вызван');
    }
    
    // Находим вызов с клавиатурой
    const replyCall = calls.find(
      call => call && Array.isArray(call) && call[1] && call[1].reply_markup && call[1].reply_markup.inline_keyboard
    );
    
    if (!replyCall) {
      throw new Error('Вызов метода reply с клавиатурой не найден');
    }
    
    // Проверяем, что кнопка русского языка содержит индикатор выбора
    const keyboard = replyCall[1].reply_markup.inline_keyboard;
    const allButtons = keyboard.flat().map((button: any) => button.text);
    
    const russianButton = allButtons.find((button: string) => button.includes('Русский'));
    const englishButton = allButtons.find((button: string) => button.includes('English'));
    
    if (!russianButton) {
      throw new Error('Кнопка русского языка не найдена');
    }
    
    if (!englishButton) {
      throw new Error('Кнопка английского языка не найдена');
    }
    
    // Русский язык должен быть отмечен, английский - нет
    if (!russianButton.includes('✓')) {
      throw new Error('Кнопка русского языка не содержит индикатор выбора');
    }
    
    if (englishButton.includes('✓')) {
      throw new Error('Кнопка английского языка содержит индикатор выбора, хотя не должна');
    }
    
    logger.info(`[TEST] Тест успешно завершен: ${testName}`);
    return {
      name: testName,
      category: TestCategory.All,
      success: true,
      message: 'Тест индикатора текущего языка успешно выполнен',
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