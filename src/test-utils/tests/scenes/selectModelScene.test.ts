import { MyContext } from '@/interfaces';
import { createMockContext, createMockWizardContext } from '../../core/mockContext';
import { TestResult } from '../../core/types';
import { assertReplyContains, assertScene } from '../../core/assertions';
import { create as mockFunction } from '../../core/mock';
import { TestCategory } from '../../core/categories';
import { logger } from '@/utils/logger';
import { ModeEnum } from '@/price/helpers/modelsCost';
import { selectModelScene } from '@/scenes/selectModelScene';

// Мокированные функции
const mockedHandleHelpCancel = mockFunction<typeof import('@/handlers/handleHelpCancel').handleHelpCancel>();

// Константы для тестирования
const TEST_USER_ID = 123456789;
const TEST_USERNAME = 'test_user';

/**
 * Настройка тестовой среды
 */
function setupTest() {
  // Настройка моков для handleHelpCancel
  mockedHandleHelpCancel.mockReturnValue(Promise.resolve(false));
  
  // Сброс моков между тестами
  mockedHandleHelpCancel.mockClear();
}

/**
 * Тест для выбора модели FLUX
 */
export async function testSelectModelScene_ChooseFlux(): Promise<TestResult> {
  try {
    setupTest();
    
    // Создаем мок-контекст
    const ctx = createMockWizardContext(0);
    ctx.from = { id: TEST_USER_ID, username: TEST_USERNAME, language_code: 'ru' } as any;
    ctx.session = { mode: undefined } as any;
    ctx.message = { text: 'flux' } as any;
    
    // Вызываем обработчик сцены (используем текущий шаг)
    await selectModelScene.middleware()(ctx as any, async () => {});
    
    // Проверяем, что режим установлен правильно
    if (ctx.session.mode !== ModeEnum.DigitalAvatarBody) {
      throw new Error(`Ожидалось установление режима ${ModeEnum.DigitalAvatarBody}, но получили ${ctx.session.mode}`);
    }
    
    // Проверяем, что произошел переход в сцену проверки баланса
    if (!ctx.scene.enter.mock.calls.length) {
      throw new Error('Ожидался вызов ctx.scene.enter');
    }
    
    const lastSceneEnterCall = ctx.scene.enter.mock.calls[ctx.scene.enter.mock.calls.length - 1];
    if (lastSceneEnterCall[0] !== ModeEnum.CheckBalanceScene) {
      throw new Error(`Ожидался переход в сцену ${ModeEnum.CheckBalanceScene}, но перешли в ${lastSceneEnterCall[0]}`);
    }
    
    return {
      name: 'SelectModelScene: Choose FLUX',
      category: TestCategory.All,
      success: true,
      message: 'Тест выбора модели FLUX успешно пройден'
    };
  } catch (error) {
    logger.error('Ошибка в тесте выбора модели FLUX:', error);
    return {
      name: 'SelectModelScene: Choose FLUX',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Тест для выбора модели FLUX PRO
 */
export async function testSelectModelScene_ChooseFluxPro(): Promise<TestResult> {
  try {
    setupTest();
    
    // Создаем мок-контекст
    const ctx = createMockWizardContext(0);
    ctx.from = { id: TEST_USER_ID, username: TEST_USERNAME, language_code: 'en' } as any;
    ctx.session = { mode: undefined } as any;
    ctx.message = { text: 'flux pro' } as any;
    
    // Вызываем обработчик сцены (используем текущий шаг)
    await selectModelScene.middleware()(ctx as any, async () => {});
    
    // Проверяем, что режим установлен правильно
    if (ctx.session.mode !== ModeEnum.DigitalAvatarBodyV2) {
      throw new Error(`Ожидалось установление режима ${ModeEnum.DigitalAvatarBodyV2}, но получили ${ctx.session.mode}`);
    }
    
    // Проверяем, что произошел переход в сцену проверки баланса
    if (!ctx.scene.enter.mock.calls.length) {
      throw new Error('Ожидался вызов ctx.scene.enter');
    }
    
    const lastSceneEnterCall = ctx.scene.enter.mock.calls[ctx.scene.enter.mock.calls.length - 1];
    if (lastSceneEnterCall[0] !== ModeEnum.CheckBalanceScene) {
      throw new Error(`Ожидался переход в сцену ${ModeEnum.CheckBalanceScene}, но перешли в ${lastSceneEnterCall[0]}`);
    }
    
    return {
      name: 'SelectModelScene: Choose FLUX PRO',
      category: TestCategory.All,
      success: true,
      message: 'Тест выбора модели FLUX PRO успешно пройден'
    };
  } catch (error) {
    logger.error('Ошибка в тесте выбора модели FLUX PRO:', error);
    return {
      name: 'SelectModelScene: Choose FLUX PRO',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Тест для обработки неверного ввода
 */
export async function testSelectModelScene_InvalidInput(): Promise<TestResult> {
  try {
    setupTest();
    
    // Создаем мок-контекст
    const ctx = createMockWizardContext(0);
    ctx.from = { id: TEST_USER_ID, username: TEST_USERNAME, language_code: 'ru' } as any;
    ctx.session = { mode: undefined } as any;
    ctx.message = { text: 'неправильный выбор' } as any;
    
    // Вызываем обработчик сцены (используем текущий шаг)
    await selectModelScene.middleware()(ctx as any, async () => {});
    
    // Проверяем сообщение об ошибке
    assertReplyContains(ctx, 'Пожалуйста, выберите модель');
    
    // Проверяем, что сцена была завершена
    if (!ctx.scene.leave.mock.calls.length) {
      throw new Error('Ожидалось завершение сцены при неверном вводе');
    }
    
    return {
      name: 'SelectModelScene: Invalid Input',
      category: TestCategory.All,
      success: true,
      message: 'Тест обработки неверного ввода успешно пройден'
    };
  } catch (error) {
    logger.error('Ошибка в тесте обработки неверного ввода:', error);
    return {
      name: 'SelectModelScene: Invalid Input',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Тест для обработки отмены
 */
export async function testSelectModelScene_Cancel(): Promise<TestResult> {
  try {
    setupTest();
    
    // Настраиваем мок для вызова отмены
    mockedHandleHelpCancel.mockReturnValue(Promise.resolve(true));
    
    // Создаем мок-контекст
    const ctx = createMockWizardContext(0);
    ctx.from = { id: TEST_USER_ID, username: TEST_USERNAME, language_code: 'ru' } as any;
    ctx.session = { mode: undefined } as any;
    ctx.message = { text: '/cancel' } as any;
    
    // Вызываем обработчик сцены (используем текущий шаг)
    await selectModelScene.middleware()(ctx as any, async () => {});
    
    // Проверяем, что handleHelpCancel был вызван
    if (mockedHandleHelpCancel.mock.calls.length === 0) {
      throw new Error('Ожидался вызов handleHelpCancel');
    }
    
    // Проверяем, что сцена была завершена
    if (!ctx.scene.leave.mock.calls.length) {
      throw new Error('Ожидалось завершение сцены при отмене');
    }
    
    return {
      name: 'SelectModelScene: Cancel',
      category: TestCategory.All,
      success: true,
      message: 'Тест отмены успешно пройден'
    };
  } catch (error) {
    logger.error('Ошибка в тесте отмены:', error);
    return {
      name: 'SelectModelScene: Cancel',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Тест для проверки локализации ошибки на английском языке
 */
export async function testSelectModelScene_EnglishLocalization(): Promise<TestResult> {
  try {
    setupTest();
    
    // Создаем мок-контекст
    const ctx = createMockWizardContext(0);
    ctx.from = { id: TEST_USER_ID, username: TEST_USERNAME, language_code: 'en' } as any;
    ctx.session = { mode: undefined } as any;
    ctx.message = { text: 'неправильный выбор' } as any;
    
    // Вызываем обработчик сцены (используем текущий шаг)
    await selectModelScene.middleware()(ctx as any, async () => {});
    
    // Проверяем сообщение об ошибке на английском
    assertReplyContains(ctx, 'Please select a model');
    
    return {
      name: 'SelectModelScene: English Localization',
      category: TestCategory.All,
      success: true,
      message: 'Тест локализации сообщения об ошибке на английском успешно пройден'
    };
  } catch (error) {
    logger.error('Ошибка в тесте локализации:', error);
    return {
      name: 'SelectModelScene: English Localization',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Функция для запуска всех тестов
 */
export async function runSelectModelSceneTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  try {
    results.push(await testSelectModelScene_ChooseFlux());
    results.push(await testSelectModelScene_ChooseFluxPro());
    results.push(await testSelectModelScene_InvalidInput());
    results.push(await testSelectModelScene_Cancel());
    results.push(await testSelectModelScene_EnglishLocalization());
  } catch (error) {
    logger.error('Ошибка при запуске тестов selectModelScene:', error);
    results.push({
      name: 'SelectModelScene: Общая ошибка',
      category: TestCategory.All,
      success: false,
      message: String(error)
    });
  }
  
  return results;
}

export default runSelectModelSceneTests; 