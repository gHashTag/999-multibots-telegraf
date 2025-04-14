import { Scenes } from 'telegraf';
import { Update } from 'telegraf/typings/core/types/typegram';
import { MyContext } from '@/interfaces';
import { createMockContext } from '@/test-utils/telegraf-mocks';
import { MockFunction, invokeHandler } from '@/test-utils/mocks';
import { TestResult, TestCategory } from '@/test-utils/types';
import { ideasGeneratorScene } from '@/scenes/ideasGeneratorScene';
import * as languageModule from '@/helpers/language';
import * as generateIdeaModule from '@/services/generateIdea';

interface TestContext extends MyContext {
  scene: {
    enter: MockFunction;
    leave: MockFunction;
    reenter: MockFunction;
  };
  reply: MockFunction;
  replyWithMarkdown: MockFunction;
  replies?: Array<{ text: string; extra?: any }>;
  session: {
    promptInfo?: {
      category?: string;
      count?: number;
    };
    [key: string]: any;
  };
  from?: {
    id: number;
    language_code?: string;
  };
  message?: {
    text?: string;
    message_id?: number;
  };
  wizard?: {
    next: MockFunction;
    selectStep: MockFunction;
    cursor: number;
  };
}

// Константы для тестирования
const TEST_USER_ID = 12345678;
const TEST_CATEGORIES = ['Здоровье', 'Бизнес', 'Образование'];
const TEST_IDEAS = [
  'Идея 1: Описание идеи 1',
  'Идея 2: Описание идеи 2',
  'Идея 3: Описание идеи 3',
];

/**
 * Настраивает контекст для тестирования
 * @param params Параметры для настройки контекста
 */
function setupContext(params: {
  language?: string;
  messageText?: string;
  step?: number;
  category?: string;
  count?: number;
}): TestContext {
  // Настройка языка
  const isRussian = params.language !== 'en';
  jest.spyOn(languageModule, 'isRussian').mockReturnValue(isRussian);
  
  // Создание мок-контекста
  const ctx = createMockContext() as TestContext;
  
  // Настройка методов сцены
  ctx.scene.enter = jest.fn().mockResolvedValue(true);
  ctx.scene.leave = jest.fn().mockResolvedValue(true);
  ctx.scene.reenter = jest.fn().mockResolvedValue(true);
  
  // Настройка reply и хранение ответов
  ctx.reply = jest.fn().mockImplementation((text: string, extra?: any) => {
    console.log(`[Мок] reply вызван с текстом: ${text}`);
    if (!ctx.replies) {
      ctx.replies = [];
    }
    ctx.replies.push({ text, extra });
    return true;
  });
  
  ctx.replyWithMarkdown = jest.fn().mockImplementation((text: string, extra?: any) => {
    console.log(`[Мок] replyWithMarkdown вызван с текстом: ${text}`);
    if (!ctx.replies) {
      ctx.replies = [];
    }
    ctx.replies.push({ text, extra });
    return true;
  });
  
  // Настройка session
  ctx.session = {};
  if (params.category) {
    if (!ctx.session.promptInfo) {
      ctx.session.promptInfo = {};
    }
    ctx.session.promptInfo.category = params.category;
  }
  
  if (params.count) {
    if (!ctx.session.promptInfo) {
      ctx.session.promptInfo = {};
    }
    ctx.session.promptInfo.count = params.count;
  }
  
  // Настройка from
  ctx.from = {
    id: TEST_USER_ID,
    language_code: params.language === 'en' ? 'en' : 'ru',
  };
  
  // Настройка message
  if (params.messageText) {
    ctx.message = {
      text: params.messageText,
      message_id: 1,
    };
  }
  
  // Настройка wizard
  if (params.step !== undefined) {
    ctx.wizard = {
      next: jest.fn().mockReturnValue(undefined),
      selectStep: jest.fn().mockReturnValue(undefined),
      cursor: params.step,
    };
  }
  
  // Мок для generateIdea
  jest.spyOn(generateIdeaModule, 'generateIdea').mockResolvedValue(TEST_IDEAS);
  
  return ctx;
}

/**
 * Тест входа в сцену генератора идей (русский язык)
 */
async function testIdeasGeneratorScene_Enter(): Promise<TestResult> {
  console.log('🧪 Запуск теста: testIdeasGeneratorScene_Enter');
  
  try {
    // Настройка контекста
    const ctx = setupContext({ language: 'ru' });
    
    // Вызов обработчика входа
    await invokeHandler(ideasGeneratorScene.enterHandler, ctx as any);
    
    // Проверки
    if (ctx.reply.mock.calls.length === 0) {
      return {
        name: 'Вход в сцену генератора идей (RU)',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод reply не был вызван',
      };
    }
    
    const replyText = ctx.replies?.[0]?.text;
    if (!replyText || !replyText.includes('Выберите категорию')) {
      return {
        name: 'Вход в сцену генератора идей (RU)',
        category: TestCategory.SCENE,
        success: false,
        message: `Неверное сообщение: ${replyText}`,
      };
    }
    
    // Проверяем клавиатуру с категориями
    const keyboard = ctx.replies?.[0]?.extra?.reply_markup?.keyboard;
    if (!keyboard || !Array.isArray(keyboard) || keyboard.length === 0) {
      return {
        name: 'Вход в сцену генератора идей (RU)',
        category: TestCategory.SCENE,
        success: false,
        message: 'Клавиатура категорий не была отправлена',
      };
    }
    
    return {
      name: 'Вход в сцену генератора идей (RU)',
      category: TestCategory.SCENE,
      success: true,
      message: 'Сцена корректно отображает выбор категорий на русском языке',
    };
  } catch (error) {
    console.error('Ошибка в testIdeasGeneratorScene_Enter:', error);
    return {
      name: 'Вход в сцену генератора идей (RU)',
      category: TestCategory.SCENE,
      success: false,
      message: 'Ошибка при тестировании входа в сцену',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Тест входа в сцену генератора идей (английский язык)
 */
async function testIdeasGeneratorScene_EnterEnglish(): Promise<TestResult> {
  console.log('🧪 Запуск теста: testIdeasGeneratorScene_EnterEnglish');
  
  try {
    // Настройка контекста
    const ctx = setupContext({ language: 'en' });
    
    // Вызов обработчика входа
    await invokeHandler(ideasGeneratorScene.enterHandler, ctx as any);
    
    // Проверки
    if (ctx.reply.mock.calls.length === 0) {
      return {
        name: 'Вход в сцену генератора идей (EN)',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод reply не был вызван',
      };
    }
    
    const replyText = ctx.replies?.[0]?.text;
    if (!replyText || !replyText.includes('Choose a category')) {
      return {
        name: 'Вход в сцену генератора идей (EN)',
        category: TestCategory.SCENE,
        success: false,
        message: `Неверное сообщение: ${replyText}`,
      };
    }
    
    // Проверяем клавиатуру с категориями
    const keyboard = ctx.replies?.[0]?.extra?.reply_markup?.keyboard;
    if (!keyboard || !Array.isArray(keyboard) || keyboard.length === 0) {
      return {
        name: 'Вход в сцену генератора идей (EN)',
        category: TestCategory.SCENE,
        success: false,
        message: 'Клавиатура категорий не была отправлена',
      };
    }
    
    return {
      name: 'Вход в сцену генератора идей (EN)',
      category: TestCategory.SCENE,
      success: true,
      message: 'Сцена корректно отображает выбор категорий на английском языке',
    };
  } catch (error) {
    console.error('Ошибка в testIdeasGeneratorScene_EnterEnglish:', error);
    return {
      name: 'Вход в сцену генератора идей (EN)',
      category: TestCategory.SCENE,
      success: false,
      message: 'Ошибка при тестировании входа в сцену на английском',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Тест выбора категории идей
 */
async function testIdeasGeneratorScene_SelectCategory(): Promise<TestResult> {
  console.log('🧪 Запуск теста: testIdeasGeneratorScene_SelectCategory');
  
  try {
    // Настройка контекста
    const ctx = setupContext({
      language: 'ru',
      messageText: 'Бизнес',
      step: 0,
    });
    
    // Первый шаг - выбор категории
    await invokeHandler(ideasGeneratorScene.stepHandlers[0], ctx as any);
    
    // Проверки
    if (!ctx.session.promptInfo?.category) {
      return {
        name: 'Выбор категории идей',
        category: TestCategory.SCENE,
        success: false,
        message: 'Категория не была сохранена в сессии',
      };
    }
    
    if (ctx.session.promptInfo.category !== 'Бизнес') {
      return {
        name: 'Выбор категории идей',
        category: TestCategory.SCENE,
        success: false,
        message: `Сохранена неверная категория: ${ctx.session.promptInfo.category}`,
      };
    }
    
    if (ctx.reply.mock.calls.length === 0) {
      return {
        name: 'Выбор категории идей',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод reply не был вызван',
      };
    }
    
    const replyText = ctx.replies?.[0]?.text;
    if (!replyText || !replyText.includes('количество')) {
      return {
        name: 'Выбор категории идей',
        category: TestCategory.SCENE,
        success: false,
        message: `Неверное сообщение: ${replyText}`,
      };
    }
    
    if (!ctx.wizard?.next.mock.calls.length) {
      return {
        name: 'Выбор категории идей',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод wizard.next не был вызван',
      };
    }
    
    return {
      name: 'Выбор категории идей',
      category: TestCategory.SCENE,
      success: true,
      message: 'Сцена корректно обрабатывает выбор категории',
    };
  } catch (error) {
    console.error('Ошибка в testIdeasGeneratorScene_SelectCategory:', error);
    return {
      name: 'Выбор категории идей',
      category: TestCategory.SCENE,
      success: false,
      message: 'Ошибка при тестировании выбора категории',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Тест выбора количества идей
 */
async function testIdeasGeneratorScene_SelectCount(): Promise<TestResult> {
  console.log('🧪 Запуск теста: testIdeasGeneratorScene_SelectCount');
  
  try {
    // Настройка контекста
    const ctx = setupContext({
      language: 'ru',
      messageText: '3',
      step: 1,
      category: 'Бизнес',
    });
    
    // Второй шаг - выбор количества идей
    await invokeHandler(ideasGeneratorScene.stepHandlers[1], ctx as any);
    
    // Проверки
    if (!ctx.session.promptInfo?.count) {
      return {
        name: 'Выбор количества идей',
        category: TestCategory.SCENE,
        success: false,
        message: 'Количество идей не было сохранено в сессии',
      };
    }
    
    if (ctx.session.promptInfo.count !== 3) {
      return {
        name: 'Выбор количества идей',
        category: TestCategory.SCENE,
        success: false,
        message: `Сохранено неверное количество: ${ctx.session.promptInfo.count}`,
      };
    }
    
    if (ctx.reply.mock.calls.length === 0 && ctx.replyWithMarkdown.mock.calls.length === 0) {
      return {
        name: 'Выбор количества идей',
        category: TestCategory.SCENE,
        success: false,
        message: 'Ни один из методов reply/replyWithMarkdown не был вызван',
      };
    }
    
    if (generateIdeaModule.generateIdea.mock.calls.length === 0) {
      return {
        name: 'Выбор количества идей',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод generateIdea не был вызван',
      };
    }
    
    const generateArgs = generateIdeaModule.generateIdea.mock.calls[0];
    if (!generateArgs || generateArgs[0] !== 'Бизнес' || generateArgs[1] !== 3) {
      return {
        name: 'Выбор количества идей',
        category: TestCategory.SCENE,
        success: false,
        message: `Неверные аргументы вызова generateIdea: ${JSON.stringify(generateArgs)}`,
      };
    }
    
    if (!ctx.scene.leave.mock.calls.length) {
      return {
        name: 'Выбор количества идей',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод scene.leave не был вызван',
      };
    }
    
    return {
      name: 'Выбор количества идей',
      category: TestCategory.SCENE,
      success: true,
      message: 'Сцена корректно обрабатывает выбор количества идей и генерирует идеи',
    };
  } catch (error) {
    console.error('Ошибка в testIdeasGeneratorScene_SelectCount:', error);
    return {
      name: 'Выбор количества идей',
      category: TestCategory.SCENE,
      success: false,
      message: 'Ошибка при тестировании выбора количества идей',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Тест обработки неверного количества идей
 */
async function testIdeasGeneratorScene_InvalidCount(): Promise<TestResult> {
  console.log('🧪 Запуск теста: testIdeasGeneratorScene_InvalidCount');
  
  try {
    // Настройка контекста
    const ctx = setupContext({
      language: 'ru',
      messageText: 'много',
      step: 1,
      category: 'Бизнес',
    });
    
    // Второй шаг - попытка ввести текст вместо числа
    await invokeHandler(ideasGeneratorScene.stepHandlers[1], ctx as any);
    
    // Проверки
    if (ctx.reply.mock.calls.length === 0) {
      return {
        name: 'Обработка неверного количества идей',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод reply не был вызван',
      };
    }
    
    const replyText = ctx.replies?.[0]?.text;
    if (!replyText || !replyText.includes('число')) {
      return {
        name: 'Обработка неверного количества идей',
        category: TestCategory.SCENE,
        success: false,
        message: `Неверное сообщение: ${replyText}`,
      };
    }
    
    if (generateIdeaModule.generateIdea.mock.calls.length > 0) {
      return {
        name: 'Обработка неверного количества идей',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод generateIdea был вызван несмотря на неверное количество',
      };
    }
    
    if (ctx.scene.leave.mock.calls.length > 0) {
      return {
        name: 'Обработка неверного количества идей',
        category: TestCategory.SCENE,
        success: false,
        message: 'Сцена была завершена несмотря на ошибку',
      };
    }
    
    return {
      name: 'Обработка неверного количества идей',
      category: TestCategory.SCENE,
      success: true,
      message: 'Сцена корректно обрабатывает неверное количество идей',
    };
  } catch (error) {
    console.error('Ошибка в testIdeasGeneratorScene_InvalidCount:', error);
    return {
      name: 'Обработка неверного количества идей',
      category: TestCategory.SCENE,
      success: false,
      message: 'Ошибка при тестировании обработки неверного количества',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Тест обработки ошибки генерации идей
 */
async function testIdeasGeneratorScene_GenerationError(): Promise<TestResult> {
  console.log('🧪 Запуск теста: testIdeasGeneratorScene_GenerationError');
  
  try {
    // Настройка контекста
    const ctx = setupContext({
      language: 'ru',
      messageText: '3',
      step: 1,
      category: 'Бизнес',
    });
    
    // Мок ошибки при генерации
    jest.spyOn(generateIdeaModule, 'generateIdea').mockRejectedValue(new Error('API Error'));
    
    // Второй шаг - выбор количества с ошибкой генерации
    await invokeHandler(ideasGeneratorScene.stepHandlers[1], ctx as any);
    
    // Проверки
    if (ctx.reply.mock.calls.length === 0) {
      return {
        name: 'Обработка ошибки генерации идей',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод reply не был вызван',
      };
    }
    
    let foundErrorMessage = false;
    for (const reply of ctx.replies || []) {
      if (reply.text && (reply.text.includes('ошибка') || reply.text.includes('Ошибка'))) {
        foundErrorMessage = true;
        break;
      }
    }
    
    if (!foundErrorMessage) {
      return {
        name: 'Обработка ошибки генерации идей',
        category: TestCategory.SCENE,
        success: false,
        message: 'Сообщение об ошибке не было отправлено',
      };
    }
    
    if (!ctx.scene.leave.mock.calls.length) {
      return {
        name: 'Обработка ошибки генерации идей',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод scene.leave не был вызван',
      };
    }
    
    return {
      name: 'Обработка ошибки генерации идей',
      category: TestCategory.SCENE,
      success: true,
      message: 'Сцена корректно обрабатывает ошибку при генерации идей',
    };
  } catch (error) {
    console.error('Ошибка в testIdeasGeneratorScene_GenerationError:', error);
    return {
      name: 'Обработка ошибки генерации идей',
      category: TestCategory.SCENE,
      success: false,
      message: 'Ошибка при тестировании обработки ошибки генерации',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Выполнение всех тестов сцены ideasGeneratorScene
 */
export async function runIdeasGeneratorSceneTests(): Promise<TestResult[]> {
  console.log('🚀 Запуск всех тестов для ideasGeneratorScene');
  
  const results: TestResult[] = [];
  
  try {
    // Запуск всех тестов
    results.push(await testIdeasGeneratorScene_Enter());
    results.push(await testIdeasGeneratorScene_EnterEnglish());
    results.push(await testIdeasGeneratorScene_SelectCategory());
    results.push(await testIdeasGeneratorScene_SelectCount());
    results.push(await testIdeasGeneratorScene_InvalidCount());
    results.push(await testIdeasGeneratorScene_GenerationError());
    
    // Вывод статистики
    const successCount = results.filter(r => r.success).length;
    console.log(`✅ Успешно: ${successCount}/${results.length} тестов`);
    
    results.filter(r => !r.success).forEach(r => {
      console.error(`❌ Тест "${r.name}" не прошел: ${r.message}`);
      if (r.error) console.error(`   Ошибка: ${r.error}`);
    });
    
    return results;
  } catch (error) {
    console.error('❌ Критическая ошибка при выполнении тестов:', error);
    results.push({
      name: 'Выполнение всех тестов ideasGeneratorScene',
      category: TestCategory.SCENE,
      success: false,
      message: 'Критическая ошибка при выполнении тестов',
      error: error instanceof Error ? error.message : String(error),
    });
    
    return results;
  }
}

// Экспорт функции запуска тестов и отдельных тестов для возможности индивидуального запуска
export default runIdeasGeneratorSceneTests; 