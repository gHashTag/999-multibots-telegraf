import { sizeWizard } from '../../../scenes/sizeWizard';
import { TestResult, TestCategory } from '../../core/types';
import { MyContext } from '@/interfaces';
import { createMockContext } from '../../mocks/context-mock';
import mockApi from '../../core/mock';

// Гибкая типизация для мок-функций
type AnyFunction = (...args: any[]) => any;
type MockedFunction = AnyFunction & { 
  mock: { 
    calls: any[][] 
  } 
};

// Мок-функции для тестирования
const isRussianMock = mockApi.create(ctx => ctx.session?.language === 'ru');
const handleSizeSelectionMock = mockApi.create().mockResolvedValue(undefined);
const setAspectRatioMock = mockApi.create().mockResolvedValue(undefined);

// Интерфейс контекста для тестирования
interface TestContext extends Partial<MyContext> {
  wizard: {
    next: MockedFunction;
    back: MockedFunction;
    selectStep: MockedFunction;
  };
  scene: {
    enter: MockedFunction;
    reenter: MockedFunction;
    leave: MockedFunction;
  };
  reply: MockedFunction;
  replyWithMarkdown: MockedFunction;
  editMessageText: MockedFunction;
  editMessageReplyMarkup: MockedFunction;
}

/**
 * Настройка контекста для тестирования
 */
async function setupContext(language: string = 'ru'): Promise<TestContext> {
  const ctx = createMockContext() as any;
  
  // Настраиваем объект session
  ctx.session = {
    language,
    mode: 'user',
    // другие поля сессии...
  };
  
  // Настраиваем объект wizard
  ctx.wizard = {
    next: mockApi.create(),
    back: mockApi.create(),
    selectStep: mockApi.create(),
  };
  
  // Настраиваем объект scene
  ctx.scene = {
    enter: mockApi.create(),
    reenter: mockApi.create(),
    leave: mockApi.create(),
  };
  
  // Настраиваем методы ответа
  ctx.reply = mockApi.create();
  ctx.replyWithMarkdown = mockApi.create();
  ctx.editMessageText = mockApi.create();
  ctx.editMessageReplyMarkup = mockApi.create();
  
  return ctx;
}

/**
 * Безопасно вызывает обработчик middleware
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
 * Безопасное получение шага визарда по индексу
 */
function getWizardStep(index: number) {
  if (Array.isArray(sizeWizard.middleware) && index >= 0 && index < sizeWizard.middleware.length) {
    return sizeWizard.middleware[index];
  }
  return null;
}

/**
 * Тестирование первого шага размерного визарда (русский)
 */
async function testSizeWizardFirstStep(): Promise<TestResult> {
  console.log('Запуск testSizeWizardFirstStep');
  try {
    // Устанавливаем мок-функции
    isRussianMock.mockReturnValue(true);
    
    // Создаем тестовый контекст
    const ctx = await setupContext();
    
    // Получаем обработчик первого шага
    const firstStep = getWizardStep(0);
    if (!firstStep) {
      throw new Error('Не удалось получить первый шаг визарда');
    }
    
    // Вызываем обработчик первого шага
    await invokeHandler(firstStep, ctx);
    
    // Проверяем, что был вызван метод reply с правильным сообщением на русском
    const expectedMessage = 'Выберите размер изображения:';
    if (!ctx.reply.mock.calls.length) {
      throw new Error('Метод reply не был вызван');
    }
    
    const actualMessage = ctx.reply.mock.calls[0][0];
    if (actualMessage !== expectedMessage) {
      throw new Error(`Неправильное сообщение: ${actualMessage}, ожидалось: ${expectedMessage}`);
    }
    
    console.log('testSizeWizardFirstStep успешно завершен');
    return {
      name: 'testSizeWizardFirstStep',
      category: TestCategory.SCENE,
      success: true,
      message: 'Успешная проверка первого шага визарда на русском языке'
    };
  } catch (error: any) {
    console.error('Ошибка в testSizeWizardFirstStep:', error);
    return {
      name: 'testSizeWizardFirstStep',
      category: TestCategory.SCENE,
      success: false,
      message: `Ошибка: ${error.message}`
    };
  }
}

/**
 * Тестирование первого шага размерного визарда (английский)
 */
async function testSizeWizardFirstStepEnglish(): Promise<TestResult> {
  console.log('Запуск testSizeWizardFirstStepEnglish');
  try {
    // Устанавливаем мок-функции
    isRussianMock.mockReturnValue(false);
    
    // Создаем тестовый контекст
    const ctx = await setupContext('en');
    
    // Получаем обработчик первого шага
    const firstStep = getWizardStep(0);
    if (!firstStep) {
      throw new Error('Не удалось получить первый шаг визарда');
    }
    
    // Вызываем обработчик первого шага
    await invokeHandler(firstStep, ctx);
    
    // Проверяем, что был вызван метод reply с правильным сообщением на английском
    const expectedMessage = 'Choose image size:';
    if (!ctx.reply.mock.calls.length) {
      throw new Error('Метод reply не был вызван');
    }
    
    const actualMessage = ctx.reply.mock.calls[0][0];
    if (actualMessage !== expectedMessage) {
      throw new Error(`Неправильное сообщение: ${actualMessage}, ожидалось: ${expectedMessage}`);
    }
    
    console.log('testSizeWizardFirstStepEnglish успешно завершен');
    return {
      name: 'testSizeWizardFirstStepEnglish',
      category: TestCategory.SCENE,
      success: true,
      message: 'Успешная проверка первого шага визарда на английском языке'
    };
  } catch (error: any) {
    console.error('Ошибка в testSizeWizardFirstStepEnglish:', error);
    return {
      name: 'testSizeWizardFirstStepEnglish',
      category: TestCategory.SCENE,
      success: false,
      message: `Ошибка: ${error.message}`
    };
  }
}

/**
 * Тестирование выбора валидного размера
 */
async function testValidSizeSelection(): Promise<TestResult> {
  console.log('Запуск testValidSizeSelection');
  try {
    // Устанавливаем мок-функции
    isRussianMock.mockReturnValue(true);
    handleSizeSelectionMock.mockResolvedValue(undefined);
    
    // Создаем тестовый контекст с колбэком
    const ctx = await setupContext();
    ctx.callbackQuery = {
      data: 'size:512x512'
    } as any;
    
    // Получаем обработчик второго шага
    const secondStep = getWizardStep(1);
    if (!secondStep) {
      throw new Error('Не удалось получить второй шаг визарда');
    }
    
    // Вызываем обработчик второго шага
    await invokeHandler(secondStep, ctx);
    
    // Проверяем, что была вызвана функция handleSizeSelection с правильными параметрами
    if (!handleSizeSelectionMock.mock.calls.length) {
      throw new Error('Функция handleSizeSelection не была вызвана');
    }
    
    const selectedSize = handleSizeSelectionMock.mock.calls[0][1];
    if (selectedSize !== '512x512') {
      throw new Error(`Неправильный размер: ${selectedSize}, ожидалось: 512x512`);
    }
    
    // Проверяем, что был вызван метод wizard.next
    if (!ctx.wizard.next.mock.calls.length) {
      throw new Error('Метод wizard.next не был вызван');
    }
    
    console.log('testValidSizeSelection успешно завершен');
    return {
      name: 'testValidSizeSelection',
      category: TestCategory.SCENE,
      success: true,
      message: 'Успешная проверка выбора валидного размера'
    };
  } catch (error: any) {
    console.error('Ошибка в testValidSizeSelection:', error);
    return {
      name: 'testValidSizeSelection',
      category: TestCategory.SCENE,
      success: false,
      message: `Ошибка: ${error.message}`
    };
  }
}

/**
 * Тестирование выбора невалидного размера
 */
async function testInvalidSizeSelection(): Promise<TestResult> {
  console.log('Запуск testInvalidSizeSelection');
  try {
    // Устанавливаем мок-функции
    isRussianMock.mockReturnValue(true);
    
    // Создаем тестовый контекст с колбэком
    const ctx = await setupContext();
    ctx.callbackQuery = {
      data: 'invalid:data'
    } as any;
    
    // Получаем обработчик второго шага
    const secondStep = getWizardStep(1);
    if (!secondStep) {
      throw new Error('Не удалось получить второй шаг визарда');
    }
    
    // Вызываем обработчик второго шага
    await invokeHandler(secondStep, ctx);
    
    // Проверяем, что была вызвана функция editMessageText с сообщением об ошибке
    const expectedMessage = 'Пожалуйста, выберите размер из предложенных вариантов';
    if (!ctx.editMessageText.mock.calls.length) {
      throw new Error('Метод editMessageText не был вызван');
    }
    
    const actualMessage = ctx.editMessageText.mock.calls[0][0];
    if (actualMessage !== expectedMessage) {
      throw new Error(`Неправильное сообщение: ${actualMessage}, ожидалось: ${expectedMessage}`);
    }
    
    console.log('testInvalidSizeSelection успешно завершен');
    return {
      name: 'testInvalidSizeSelection',
      category: TestCategory.SCENE,
      success: true,
      message: 'Успешная проверка выбора невалидного размера'
    };
  } catch (error: any) {
    console.error('Ошибка в testInvalidSizeSelection:', error);
    return {
      name: 'testInvalidSizeSelection',
      category: TestCategory.SCENE,
      success: false,
      message: `Ошибка: ${error.message}`
    };
  }
}

/**
 * Тестирование отправки текстового сообщения вместо выбора размера
 */
async function testNoTextMessage(): Promise<TestResult> {
  console.log('Запуск testNoTextMessage');
  try {
    // Устанавливаем мок-функции
    isRussianMock.mockReturnValue(true);
    
    // Создаем тестовый контекст без колбэка, но с текстовым сообщением
    const ctx = await setupContext();
    ctx.message = { text: 'Какой-то текст' } as any;
    
    // Получаем обработчик второго шага
    const secondStep = getWizardStep(1);
    if (!secondStep) {
      throw new Error('Не удалось получить второй шаг визарда');
    }
    
    // Вызываем обработчик второго шага
    await invokeHandler(secondStep, ctx);
    
    // Проверяем, что была вызвана функция reply с сообщением об ошибке
    const expectedMessage = 'Пожалуйста, выберите размер из предложенных вариантов';
    if (!ctx.reply.mock.calls.length) {
      throw new Error('Метод reply не был вызван');
    }
    
    const actualMessage = ctx.reply.mock.calls[0][0];
    if (actualMessage !== expectedMessage) {
      throw new Error(`Неправильное сообщение: ${actualMessage}, ожидалось: ${expectedMessage}`);
    }
    
    console.log('testNoTextMessage успешно завершен');
    return {
      name: 'testNoTextMessage',
      category: TestCategory.SCENE,
      success: true,
      message: 'Успешная проверка отправки текстового сообщения вместо выбора размера'
    };
  } catch (error: any) {
    console.error('Ошибка в testNoTextMessage:', error);
    return {
      name: 'testNoTextMessage',
      category: TestCategory.SCENE,
      success: false,
      message: `Ошибка: ${error.message}`
    };
  }
}

/**
 * Запуск всех тестов для размерного визарда
 */
export async function runSizeWizardTests(): Promise<TestResult[]> {
  console.log('Запуск тестов для размерного визарда...');
  
  const results: TestResult[] = [];
  
  // Запускаем все тесты последовательно
  results.push(await testSizeWizardFirstStep());
  results.push(await testSizeWizardFirstStepEnglish());
  results.push(await testValidSizeSelection());
  results.push(await testInvalidSizeSelection());
  results.push(await testNoTextMessage());
  
  // Выводим результаты
  const successCount = results.filter(r => r.success).length;
  console.log(`Тесты для размерного визарда завершены: ${successCount}/${results.length} успешно`);
  
  return results;
}

export default runSizeWizardTests;