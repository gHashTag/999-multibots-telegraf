import { MyContext } from '@/interfaces';
import { checkBalanceScene } from '@/scenes/checkBalanceScene';
import { createMockContext } from '@/test-utils/helpers/createMockContext';
import { TestResult } from '@/test-utils/core/types';
import { TestCategory } from '@/test-utils/core/categories';
import { logger } from '@/utils/logger';
import * as supabaseModule from '@/core/supabase';
import { getUserInfo } from '@/handlers/getUserInfo';
import { ModeEnum } from '@/price/helpers/modelsCost';
import mockApi from '@/test-utils/core/mock';

// Создаем моки вместо использования jest.mock
const mockGetUserInfo = mockApi.create({
  name: 'getUserInfo',
  implementation: () => ({
    telegramId: '123456789',
    userId: 'test-user-id'
  })
});

// Сохраняем оригинальную функцию
const originalGetUserBalance = supabaseModule.getUserBalance;

// Текущее значение баланса для использования в тестах
let currentBalance = 100.5;

// Создаем мок для getUserBalance
const mockGetUserBalance = mockApi.create({
  name: 'getUserBalance',
  implementation: async (_telegram_id: string, _bot_name?: string) => currentBalance
});

const setupTest = () => {
  // Переопределяем функцию для тестов
  (supabaseModule as any).getUserBalance = mockGetUserBalance;
  
  // Мокируем данные пользователя
  (getUserInfo as any) = mockGetUserInfo;
  
  // Сбрасываем историю вызовов мока получения баланса
  mockGetUserBalance.mock.clear();
};

/**
 * Вспомогательная функция для создания тестового контекста
 */
const createTestContext = (options: { language?: string, callbackData?: string, mode?: ModeEnum } = {}) => {
  // Создаем тестового пользователя
  const testUser = {
    telegram_id: '123456789',
    username: 'testuser'
  };

  // Создаем мок контекста с тестовым пользователем
  const ctx = createMockContext({
    user: testUser,
    callbackData: options.callbackData,
  }) as unknown as MyContext;

  // Имитируем botInfo, создавая mocked version
  Object.defineProperty(ctx, 'botInfo', {
    get: () => ({
      id: 123456789,
      first_name: 'Test Bot',
      username: 'test_bot',
      is_bot: true
    })
  });
  
  // Имитируем telegram для отправки сообщений
  // Так как это read-only свойство, мы используем defineProperty
  const sendMessageMock = mockApi.create({
    name: 'sendMessage',
    implementation: async () => true
  });
  
  Object.defineProperty(ctx, 'telegram', {
    get: () => ({
      sendMessage: sendMessageMock
    })
  });

  // Добавляем функциональность сцены в контекст
  ctx.session = {
    __scenes: {
      current: 'checkBalanceScene',
      state: {}
    },
    language: options.language || 'en',
    mode: options.mode
  } as any;

  // Создаем моки для методов сцены
  const enterMock = mockApi.create({
    name: 'scene.enter',
    implementation: async () => true
  });
  
  const reenterMock = mockApi.create({
    name: 'scene.reenter',
    implementation: async () => true
  });
  
  const leaveMock = mockApi.create({
    name: 'scene.leave',
    implementation: async () => true
  });

  // Добавляем методы для работы со сценой
  ctx.scene = {
    enter: enterMock,
    reenter: reenterMock,
    leave: leaveMock
  } as any;

  // Добавляем методы для колбэков
  const answerCbQueryMock = mockApi.create({
    name: 'answerCbQuery',
    implementation: async () => true
  });
  
  ctx.answerCbQuery = answerCbQueryMock as any;
  
  const editMessageTextMock = mockApi.create({
    name: 'editMessageText',
    implementation: async () => true
  });
  
  ctx.editMessageText = editMessageTextMock as any;
  
  const editMessageReplyMarkupMock = mockApi.create({
    name: 'editMessageReplyMarkup',
    implementation: async () => true
  });
  
  ctx.editMessageReplyMarkup = editMessageReplyMarkupMock as any;

  // Мокируем методы Telegraf для проверки отправленных сообщений
  const replyMock = mockApi.create({
    name: 'reply',
    implementation: async () => true
  });
  
  ctx.reply = replyMock as any;
  
  return { ctx, replyMock, answerCbQueryMock, enterMock, leaveMock };
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
 * Проверка наличия кнопок в инлайн-клавиатуре сообщения
 */
const assertInlineKeyboardContains = (ctx: any, expectedButtons: string[], errorMessage: string) => {
  const replyMock = ctx.reply;
  
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
 * Тест для проверки входа в сцену проверки баланса
 */
export async function testCheckBalanceScene_EnterScene(): Promise<TestResult> {
  const testName = 'checkBalanceScene: Enter Scene';
  
  try {
    setupTest();
    
    // Создаем тестовый контекст
    const { ctx, enterMock } = createTestContext();
    
    // Вызываем обработчик входа в сцену
    await checkBalanceScene.enter(ctx as any);
    
    return {
      name: testName,
      success: true,
      message: 'Test passed successfully'
    };
  } catch (error) {
    console.error(`Error in ${testName}:`, error);
    return {
      name: testName,
      success: false,
      message: `Test failed: ${error}`
    };
  }
}
testCheckBalanceScene_EnterScene.meta = { category: TestCategory.All };

/**
 * Тест для проверки отображения баланса
 */
export async function testCheckBalanceScene_DisplayBalance(): Promise<TestResult> {
  const testName = 'checkBalanceScene: Display Balance';
  
  try {
    setupTest();
    
    // Создаем тестовый контекст
    const { ctx } = createTestContext();
    
    // Задаем баланс для теста
    currentBalance = 10;
    
    // Вызываем функцию входа в сцену
    // @ts-ignore: Игнорируем ошибку типизации для вызова метода
    await checkBalanceScene._handlers.enter[0](ctx);
    
    // Проверяем, что пользователю отправлено сообщение с балансом
    assertReplyContains(ctx, 'balance: 10', 'Баланс не отображен в сообщении');
    
    // Должны быть кнопки для пополнения и возврата в меню
    assertInlineKeyboardContains(ctx, ['Top Up', 'Back to Menu'], 'Кнопки не найдены');
    
    return {
      name: testName,
      success: true,
      message: 'Test passed successfully'
    };
  } catch (error) {
    console.error(`Error in ${testName}:`, error);
    return {
      name: testName,
      success: false,
      message: `Test failed: ${error}`
    };
  }
}
testCheckBalanceScene_DisplayBalance.meta = { category: TestCategory.All };

/**
 * Тест для проверки сценария пополнения баланса
 */
export async function testCheckBalanceScene_TopUp(): Promise<TestResult> {
  const testName = 'checkBalanceScene: Top Up';
  
  try {
    setupTest();
    
    // Создаем тестовый контекст с колбэком для пополнения
    const { ctx, answerCbQueryMock } = createTestContext({ callbackData: 'topUp' });
    
    // Вызываем обработчик колбэка
    // @ts-ignore: Игнорируем ошибку типизации для вызова метода
    await checkBalanceScene._handlers.callback_query[0](ctx);
    
    // Проверяем, что вызван answerCbQuery
    const answerCalls = answerCbQueryMock.mock.calls;
    if (answerCalls.length === 0) {
      throw new Error('answerCbQuery не был вызван');
    }
    
    // Проверяем, что пользователю отправлено сообщение о пополнении
    assertReplyContains(ctx, 'payment', 'Сообщение о пополнении не найдено');
    
    return {
      name: testName,
      success: true,
      message: 'Test passed successfully'
    };
  } catch (error) {
    console.error(`Error in ${testName}:`, error);
    return {
      name: testName,
      success: false,
      message: `Test failed: ${error}`
    };
  }
}
testCheckBalanceScene_TopUp.meta = { category: TestCategory.All };

/**
 * Тест для проверки возврата в меню
 */
export async function testCheckBalanceScene_BackToMenu(): Promise<TestResult> {
  const testName = 'checkBalanceScene: Back To Menu';
  
  try {
    setupTest();
    
    // Создаем тестовый контекст с колбэком для возврата в меню
    const { ctx, leaveMock } = createTestContext({ callbackData: 'back' });
    
    // Вызываем обработчик колбэка
    // @ts-ignore: Игнорируем ошибку типизации для вызова метода
    await checkBalanceScene._handlers.callback_query[0](ctx);
    
    // Проверяем, что был вызван метод leave для выхода из сцены
    const leaveCalls = leaveMock.mock.calls;
    if (leaveCalls.length === 0) {
      throw new Error('scene.leave не был вызван');
    }
    
    return {
      name: testName,
      success: true,
      message: 'Test passed successfully'
    };
  } catch (error) {
    console.error(`Error in ${testName}:`, error);
    return {
      name: testName,
      success: false,
      message: `Test failed: ${error}`
    };
  }
}
testCheckBalanceScene_BackToMenu.meta = { category: TestCategory.All };

/**
 * Тест для проверки обработки ошибок
 */
export async function testCheckBalanceScene_HandlingErrors(): Promise<TestResult> {
  const testName = 'checkBalanceScene: Handling Errors';
  
  try {
    setupTest();
    
    // Создаем тестовый контекст
    const { ctx } = createTestContext();
    
    // Имитируем ошибку при получении баланса
    // Сохраняем оригинальную функцию
    const originalImplementation = (supabaseModule as any).getUserBalance;
    
    // Временно переопределяем функцию на функцию, которая бросает ошибку
    (supabaseModule as any).getUserBalance = async () => {
      throw new Error('Test error');
    };
    
    // Вызываем функцию для проверки баланса
    // @ts-ignore: Игнорируем ошибку типизации для вызова метода
    await checkBalanceScene._handlers.enter[0](ctx);
    
    // Восстанавливаем оригинальную функцию
    (supabaseModule as any).getUserBalance = originalImplementation;
    
    // Проверяем, что пользователю отправлено сообщение об ошибке
    assertReplyContains(ctx, 'error', 'Сообщение об ошибке не найдено');
    
    return {
      name: testName,
      success: true,
      message: 'Test passed successfully'
    };
  } catch (error) {
    console.error(`Error in ${testName}:`, error);
    return {
      name: testName,
      success: false,
      message: `Test failed: ${error}`
    };
  }
}
testCheckBalanceScene_HandlingErrors.meta = { category: TestCategory.All };

/**
 * Тест для проверки входа в сцену со специфическим режимом
 */
export async function testCheckBalanceScene_EnterWithVoiceToTextMode(): Promise<TestResult> {
  const testName = 'checkBalanceScene: Enter With VoiceToText Mode';
  
  try {
    setupTest();
    
    // Создаем тестовый контекст с режимом VoiceToText
    const { ctx } = createTestContext({ mode: ModeEnum.VoiceToText });
    
    // Задаем баланс для теста
    currentBalance = 5;
    
    // Вызываем функцию входа в сцену
    // @ts-ignore: Игнорируем ошибку типизации для вызова метода
    await checkBalanceScene._handlers.enter[0](ctx);
    
    // Проверяем, что пользователю отправлено сообщение с балансом и упоминанием режима
    assertReplyContains(ctx, 'balance: 5', 'Баланс не отображен в сообщении');
    
    // Должны быть кнопки для пополнения и возврата в меню
    assertInlineKeyboardContains(ctx, ['Top Up', 'Back to Menu'], 'Кнопки не найдены');
    
    return {
      name: testName,
      success: true,
      message: 'Test passed successfully'
    };
  } catch (error) {
    console.error(`Error in ${testName}:`, error);
    return {
      name: testName,
      success: false,
      message: `Test failed: ${error}`
    };
  }
}
testCheckBalanceScene_EnterWithVoiceToTextMode.meta = { category: TestCategory.All };

/**
 * Тест для проверки сценария с недостаточным балансом
 */
export async function testCheckBalanceScene_InsufficientBalance(): Promise<TestResult> {
  const testName = 'checkBalanceScene: Insufficient Balance';
  
  try {
    setupTest();
    
    // Создаем тестовый контекст
    const { ctx } = createTestContext({ mode: ModeEnum.TextToImage });
    
    // Задаем недостаточный баланс для теста
    currentBalance = 0.5;
    
    // Вызываем функцию входа в сцену
    // @ts-ignore: Игнорируем ошибку типизации для вызова метода
    await checkBalanceScene._handlers.enter[0](ctx);
    
    // Проверяем, что пользователю отправлено сообщение с предупреждением о недостаточном балансе
    assertReplyContains(ctx, 'insufficient', 'Сообщение о недостаточном балансе не найдено');
    
    return {
      name: testName,
      success: true,
      message: 'Test passed successfully'
    };
  } catch (error) {
    console.error(`Error in ${testName}:`, error);
    return {
      name: testName,
      success: false,
      message: `Test failed: ${error}`
    };
  }
}
testCheckBalanceScene_InsufficientBalance.meta = { category: TestCategory.All };

/**
 * Тест для проверки обработки колбэк-запросов
 */
export async function testCheckBalanceScene_CallbackQueryHandling(): Promise<TestResult> {
  const testName = 'checkBalanceScene: Callback Query Handling';
  
  try {
    setupTest();
    
    // Создаем тестовый контекст с неизвестным колбэком
    const { ctx, answerCbQueryMock } = createTestContext({ callbackData: 'unknown' });
    
    // Вызываем обработчик колбэка
    // @ts-ignore: Игнорируем ошибку типизации для вызова метода
    await checkBalanceScene._handlers.callback_query[0](ctx);
    
    // Проверяем, что вызван answerCbQuery с сообщением об ошибке
    const answerCalls = answerCbQueryMock.mock.calls;
    if (answerCalls.length === 0) {
      throw new Error('answerCbQuery не был вызван');
    }
    
    // Safely check the first call and its first argument
    const firstCall = answerCalls[0] as any[] | undefined;
    if (!firstCall || !firstCall[0] || typeof firstCall[0] !== 'string' || !firstCall[0].includes('error')) {
      throw new Error('answerCbQuery не был вызван с сообщением об ошибке');
    }
    
    return {
      name: testName,
      success: true,
      message: 'Test passed successfully'
    };
  } catch (error) {
    console.error(`Error in ${testName}:`, error);
    return {
      name: testName,
      success: false,
      message: `Test failed: ${error}`
    };
  }
}
testCheckBalanceScene_CallbackQueryHandling.meta = { category: TestCategory.All }; 