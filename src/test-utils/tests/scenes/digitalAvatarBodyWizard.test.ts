import { MyContext } from '@/interfaces';
import { createMockContext, createMockWizardContext } from '../../core/mockContext';
import { ModeEnum } from '@/price/helpers/modelsCost';
import { TestResult } from '../../core/types';
import { assertContains, assertReplyContains, assertReplyMarkupContains, assertScene } from '../../core/assertions';
import { TEXTS as RU } from '@/locales/ru';
import { TEXTS as EN } from '@/locales/en';
import { SCENES } from '@/constants';
import { digitalAvatarBodyWizard } from '@/scenes/digitalAvatarBodyWizard';

/**
 * Тестирует вход в сцену создания цифрового тела
 */
export async function testDigitalAvatarBodyWizard_EnterScene(): Promise<TestResult> {
  try {
    // Создаем мок контекста
    const ctx = createMockWizardContext();
    ctx.from = { id: 123456789, is_bot: false, first_name: 'Test', language_code: 'ru' };
    
    // Запускаем первый шаг сцены
    await digitalAvatarBodyWizard.steps[0](ctx as unknown as MyContext);
    
    // Проверяем, что бот отправил правильное сообщение
    assertReplyContains(ctx, 'шагов');
    assertReplyContains(ctx, 'стоимость');
    
    // Проверяем, что разметка клавиатуры содержит кнопки выбора шагов
    assertReplyMarkupContains(ctx, '1000');
    assertReplyMarkupContains(ctx, '2000');
    
    // Проверяем, что сцена перешла на следующий шаг
    assertScene(ctx, ModeEnum.DigitalAvatarBody, 1);
    
    return {
      name: 'digitalAvatarBodyWizard: Enter Scene',
      success: true,
      message: 'Успешно отображены варианты количества шагов и стоимости'
    };
  } catch (error) {
    return {
      name: 'digitalAvatarBodyWizard: Enter Scene',
      success: false,
      message: String(error)
    };
  }
}

/**
 * Тестирует выбор количества шагов (1000)
 */
export async function testDigitalAvatarBodyWizard_SelectSteps1000(): Promise<TestResult> {
  try {
    // Создаем мок контекста со всеми необходимыми данными
    const ctx = createMockWizardContext(1);
    ctx.from = { id: 123456789, is_bot: false, first_name: 'Test', language_code: 'ru' };
    ctx.message = { text: '1000 шагов', message_id: 1 } as any;
    ctx.session = { ...ctx.session, balance: 1000 };
    
    // Симулируем функцию проверки баланса
    (ctx as any).scene.enter = async (sceneName: string) => {
      ctx.wizard.scene.current = sceneName;
      return Promise.resolve();
    };
    
    // Запускаем второй шаг сцены
    await digitalAvatarBodyWizard.steps[1](ctx as unknown as MyContext);
    
    // Проверяем, что сцена перешла к тренировке модели
    assertContains(ctx.wizard.scene.current, 'trainFluxModelWizard');
    
    return {
      name: 'digitalAvatarBodyWizard: Select 1000 Steps',
      success: true,
      message: 'Успешно выбрано 1000 шагов и перенаправлено на следующую сцену'
    };
  } catch (error) {
    return {
      name: 'digitalAvatarBodyWizard: Select 1000 Steps',
      success: false,
      message: String(error)
    };
  }
}

/**
 * Тестирует выбор количества шагов (3000)
 */
export async function testDigitalAvatarBodyWizard_SelectSteps3000(): Promise<TestResult> {
  try {
    // Создаем мок контекста со всеми необходимыми данными
    const ctx = createMockWizardContext(1);
    ctx.from = { id: 123456789, is_bot: false, first_name: 'Test', language_code: 'ru' };
    ctx.message = { text: '3000 шагов', message_id: 1 } as any;
    ctx.session = { ...ctx.session, balance: 3000 };
    
    // Симулируем функцию проверки баланса
    (ctx as any).scene.enter = async (sceneName: string) => {
      ctx.wizard.scene.current = sceneName;
      return Promise.resolve();
    };
    
    // Запускаем второй шаг сцены
    await digitalAvatarBodyWizard.steps[1](ctx as unknown as MyContext);
    
    // Проверяем, что сцена перешла к тренировке модели
    assertContains(ctx.wizard.scene.current, 'trainFluxModelWizard');
    
    return {
      name: 'digitalAvatarBodyWizard: Select 3000 Steps',
      success: true,
      message: 'Успешно выбрано 3000 шагов и перенаправлено на следующую сцену'
    };
  } catch (error) {
    return {
      name: 'digitalAvatarBodyWizard: Select 3000 Steps',
      success: false,
      message: String(error)
    };
  }
}

/**
 * Тестирует сценарий с недостаточным балансом
 */
export async function testDigitalAvatarBodyWizard_InsufficientBalance(): Promise<TestResult> {
  try {
    // Создаем мок контекста со всеми необходимыми данными
    const ctx = createMockWizardContext(1);
    ctx.from = { id: 123456789, is_bot: false, first_name: 'Test', language_code: 'ru' };
    ctx.message = { text: '5000 шагов', message_id: 1 } as any;
    ctx.session = { ...ctx.session, balance: 100 }; // Недостаточно средств
    
    // Заглушка для сцены оплаты
    (ctx as any).scene.leave = () => {
      ctx.wizard.scene.current = null;
      return Promise.resolve();
    };
    
    // Запускаем второй шаг сцены
    await digitalAvatarBodyWizard.steps[1](ctx as unknown as MyContext);
    
    // Проверяем, что сцена выйдет при недостаточном балансе
    assertContains(ctx.wizard.scene.current, null);
    
    return {
      name: 'digitalAvatarBodyWizard: Insufficient Balance',
      success: true,
      message: 'Корректно обработана ситуация с недостаточным балансом'
    };
  } catch (error) {
    return {
      name: 'digitalAvatarBodyWizard: Insufficient Balance',
      success: false,
      message: String(error)
    };
  }
}

/**
 * Тестирует обработку команды отмены
 */
export async function testDigitalAvatarBodyWizard_CancelCommand(): Promise<TestResult> {
  try {
    // Создаем мок контекста со всеми необходимыми данными
    const ctx = createMockWizardContext(1);
    ctx.from = { id: 123456789, is_bot: false, first_name: 'Test', language_code: 'ru' };
    ctx.message = { text: 'Отмена', message_id: 1 } as any;
    
    // Заглушка для выхода из сцены
    (ctx as any).scene.leave = () => {
      ctx.wizard.scene.current = null;
      return Promise.resolve();
    };
    
    // Запускаем второй шаг сцены
    await digitalAvatarBodyWizard.steps[1](ctx as unknown as MyContext);
    
    // Проверяем, что сцена завершилась при команде отмены
    assertContains(ctx.wizard.scene.current, null);
    
    return {
      name: 'digitalAvatarBodyWizard: Cancel Command',
      success: true,
      message: 'Успешно обработана команда отмены'
    };
  } catch (error) {
    return {
      name: 'digitalAvatarBodyWizard: Cancel Command',
      success: false,
      message: String(error)
    };
  }
}

/**
 * Тестирует обработку невалидного ввода
 */
export async function testDigitalAvatarBodyWizard_InvalidInput(): Promise<TestResult> {
  try {
    // Создаем мок контекста со всеми необходимыми данными
    const ctx = createMockWizardContext(1);
    ctx.from = { id: 123456789, is_bot: false, first_name: 'Test', language_code: 'ru' };
    ctx.message = { text: 'невалидный ввод', message_id: 1 } as any;
    
    // Запускаем второй шаг сцены
    await digitalAvatarBodyWizard.steps[1](ctx as unknown as MyContext);
    
    // Проверяем, что бот отправил сообщение с просьбой выбрать число шагов
    assertReplyContains(ctx, 'выберите количество');
    
    // Проверяем, что сцена не вышла
    assertScene(ctx, ModeEnum.DigitalAvatarBody, 1);
    
    return {
      name: 'digitalAvatarBodyWizard: Invalid Input',
      success: true,
      message: 'Корректно обработан невалидный ввод'
    };
  } catch (error) {
    return {
      name: 'digitalAvatarBodyWizard: Invalid Input',
      success: false,
      message: String(error)
    };
  }
}

/**
 * Тестирует локализацию сцены
 */
export async function testDigitalAvatarBodyWizard_Localization(): Promise<TestResult> {
  try {
    // Тестируем русскую локализацию
    const ruCtx = createMockWizardContext();
    ruCtx.from = { id: 123456789, is_bot: false, first_name: 'Test', language_code: 'ru' };
    
    await digitalAvatarBodyWizard.steps[0](ruCtx as unknown as MyContext);
    assertReplyContains(ruCtx, 'шагов');
    
    // Тестируем английскую локализацию
    const enCtx = createMockWizardContext();
    enCtx.from = { id: 123456789, is_bot: false, first_name: 'Test', language_code: 'en' };
    
    await digitalAvatarBodyWizard.steps[0](enCtx as unknown as MyContext);
    assertReplyContains(enCtx, 'steps');
    
    return {
      name: 'digitalAvatarBodyWizard: Localization',
      success: true,
      message: 'Корректно обрабатывается локализация для русского и английского языков'
    };
  } catch (error) {
    return {
      name: 'digitalAvatarBodyWizard: Localization',
      success: false,
      message: String(error)
    };
  }
}

/**
 * Запускает все тесты для сцены digitalAvatarBodyWizard
 */
export async function runDigitalAvatarBodyWizardTests(): Promise<TestResult[]> {
  console.log('🧪 Запуск тестов сцены digitalAvatarBodyWizard (Цифровое тело 1)...');
  
  const results: TestResult[] = [];
  
  try {
    results.push(await testDigitalAvatarBodyWizard_EnterScene());
    results.push(await testDigitalAvatarBodyWizard_SelectSteps1000());
    results.push(await testDigitalAvatarBodyWizard_SelectSteps3000());
    results.push(await testDigitalAvatarBodyWizard_InsufficientBalance());
    results.push(await testDigitalAvatarBodyWizard_CancelCommand());
    results.push(await testDigitalAvatarBodyWizard_InvalidInput());
    results.push(await testDigitalAvatarBodyWizard_Localization());
  } catch (error) {
    console.error('❌ Ошибка при запуске тестов digitalAvatarBodyWizard:', error);
  }
  
  // Выводим сводку результатов
  const totalTests = results.length;
  const passedTests = results.filter(r => r.success).length;
  const failedTests = totalTests - passedTests;
  
  console.log(`\n📊 Результаты тестов digitalAvatarBodyWizard (${passedTests}/${totalTests}):`);
  results.forEach(result => {
    console.log(`${result.success ? '✅' : '❌'} ${result.name}: ${result.success ? 'УСПЕХ' : 'ОШИБКА'}`);
    if (!result.success) {
      console.log(`   Сообщение: ${result.message}`);
    }
  });
  
  return results;
}

export default runDigitalAvatarBodyWizardTests; 