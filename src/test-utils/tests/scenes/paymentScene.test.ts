import { MyContext } from '@/interfaces';
import { createMockContext } from '../../core/mockContext';
import { TestResult } from '../../core/types';
import { assertReplyContains, assertReplyMarkupContains } from '../../core/assertions';
import { create as mockFunction } from '../../core/mock';
import { TestCategory } from '../../core/categories';
import { logger } from '@/utils/logger';
import { createPendingPayment } from '@/core/supabase/createPendingPayment';
import { handleSelectStars } from '@/handlers/handleSelectStars';
import { handleBuySubscription } from '@/handlers/handleBuySubscription';
import { generateUniqueShortInvId } from '@/scenes/getRuBillWizard/helper';

// Мокированные функции
const mockedCreatePendingPayment = mockFunction<typeof createPendingPayment>();
const mockedHandleSelectStars = mockFunction<typeof handleSelectStars>();
const mockedHandleBuySubscription = mockFunction<typeof handleBuySubscription>();
const mockedGenerateUniqueShortInvId = mockFunction<typeof generateUniqueShortInvId>();

// Константы для тестирования
const TEST_USER_ID = 123456789;
const TEST_USERNAME = 'test_user';
const TEST_AMOUNT = 100;
const TEST_STARS = 50;
const TEST_INVOICE_URL = 'https://test-payment-url.com/invoice/12345';
const TEST_INV_ID = '12345';

/**
 * Настройка тестовой среды
 */
function setupTest() {
  // Настройка моков
  mockedCreatePendingPayment.mockReturnValue(Promise.resolve());
  mockedHandleSelectStars.mockReturnValue(Promise.resolve());
  mockedHandleBuySubscription.mockReturnValue(Promise.resolve());
  mockedGenerateUniqueShortInvId.mockReturnValue(Promise.resolve(TEST_INV_ID));
  
  // Сброс моков между тестами
  mockedCreatePendingPayment.mockClear();
  mockedHandleSelectStars.mockClear();
  mockedHandleBuySubscription.mockClear();
  mockedGenerateUniqueShortInvId.mockClear();
  
  // Мокируем env переменные
  process.env.MERCHANT_LOGIN = 'test_merchant';
  process.env.PASSWORD1 = 'test_password';
}

/**
 * Тест для входа в сцену без выбранного платежа
 */
export async function testPaymentSceneEnter(): Promise<TestResult> {
  try {
    setupTest();
    
    // Создаем мок-контекст
    const ctx = createMockContext();
    ctx.from = { 
      id: TEST_USER_ID, 
      is_bot: false, 
      first_name: 'Test', 
      username: TEST_USERNAME, 
      language_code: 'ru' 
    };
    ctx.session = {};
    
    // Запускаем обработчик сцены
    const paymentScene = (await import('@/scenes/paymentScene')).paymentScene;
    await paymentScene.emit('enter', ctx as unknown as MyContext);
    
    // Проверки
    assertReplyContains(ctx, 'Как вы хотите оплатить?');
    assertReplyMarkupContains(ctx, '⭐️ Звездами');
    assertReplyMarkupContains(ctx, '💳 Рублями');
    assertReplyMarkupContains(ctx, '🏠 Главное меню');
    
    return {
      name: 'paymentScene: Enter без выбранного платежа',
      category: TestCategory.All,
      success: true,
      message: 'Тест входа в сцену успешно пройден'
    };
  } catch (error) {
    logger.error('Ошибка в тесте входа в сцену:', error);
    return {
      name: 'paymentScene: Enter без выбранного платежа',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Тест для входа в сцену с выбранным платежом
 */
export async function testPaymentSceneEnterWithSelectedPayment(): Promise<TestResult> {
  try {
    setupTest();
    
    // Создаем мок-контекст
    const ctx = createMockContext();
    ctx.from = { 
      id: TEST_USER_ID, 
      is_bot: false, 
      first_name: 'Test', 
      username: TEST_USERNAME, 
      language_code: 'ru' 
    };
    ctx.botInfo = { username: 'test_bot' } as any;
    ctx.session = {
      selectedPayment: {
        amount: TEST_AMOUNT,
        stars: TEST_STARS,
        subscription: 'stars'
      }
    };
    
    // Патчим md5 и URL для тестирования
    const md5Mock = jest.fn().mockReturnValue('test_hash');
    jest.doMock('md5', () => md5Mock);
    
    // Запускаем обработчик сцены
    const paymentScene = (await import('@/scenes/paymentScene')).paymentScene;
    await paymentScene.emit('enter', ctx as unknown as MyContext);
    
    // Проверки
    assertReplyContains(ctx, 'Оплата');
    assertReplyContains(ctx, TEST_AMOUNT.toString());
    expect(mockedCreatePendingPayment).toHaveBeenCalled();
    
    return {
      name: 'paymentScene: Enter с выбранным платежом',
      category: TestCategory.All,
      success: true,
      message: 'Тест входа в сцену с выбранным платежом успешно пройден'
    };
  } catch (error) {
    logger.error('Ошибка в тесте входа в сцену с выбранным платежом:', error);
    return {
      name: 'paymentScene: Enter с выбранным платежом',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Тест для оплаты звездами
 */
export async function testPaymentScenePayWithStars(): Promise<TestResult> {
  try {
    setupTest();
    
    // Создаем мок-контекст
    const ctx = createMockContext();
    ctx.from = { 
      id: TEST_USER_ID, 
      is_bot: false, 
      first_name: 'Test', 
      username: TEST_USERNAME, 
      language_code: 'ru' 
    };
    ctx.session = {};
    ctx.message = { text: '⭐️ Звездами' } as any;
    
    // Запускаем обработчик сцены
    const paymentScene = (await import('@/scenes/paymentScene')).paymentScene;
    await paymentScene.emit('text', ctx as unknown as MyContext, {}, '⭐️ Звездами');
    
    // Проверки
    expect(mockedHandleSelectStars).toHaveBeenCalled();
    expect(ctx.scene.leave).toHaveBeenCalled();
    
    return {
      name: 'paymentScene: Оплата звездами',
      category: TestCategory.All,
      success: true,
      message: 'Тест оплаты звездами успешно пройден'
    };
  } catch (error) {
    logger.error('Ошибка в тесте оплаты звездами:', error);
    return {
      name: 'paymentScene: Оплата звездами',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Тест для оплаты звездами с подпиской
 */
export async function testPaymentScenePayWithStarsSubscription(): Promise<TestResult> {
  try {
    setupTest();
    
    // Создаем мок-контекст
    const ctx = createMockContext();
    ctx.from = { 
      id: TEST_USER_ID, 
      is_bot: false, 
      first_name: 'Test', 
      username: TEST_USERNAME, 
      language_code: 'ru' 
    };
    ctx.session = {
      subscription: 'neurophoto'
    };
    ctx.message = { text: '⭐️ Звездами' } as any;
    
    // Запускаем обработчик сцены
    const paymentScene = (await import('@/scenes/paymentScene')).paymentScene;
    await paymentScene.emit('text', ctx as unknown as MyContext, {}, '⭐️ Звездами');
    
    // Проверки
    expect(mockedHandleBuySubscription).toHaveBeenCalled();
    expect(ctx.scene.leave).toHaveBeenCalled();
    
    return {
      name: 'paymentScene: Оплата звездами с подпиской',
      category: TestCategory.All,
      success: true,
      message: 'Тест оплаты звездами с подпиской успешно пройден'
    };
  } catch (error) {
    logger.error('Ошибка в тесте оплаты звездами с подпиской:', error);
    return {
      name: 'paymentScene: Оплата звездами с подпиской',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Тест для оплаты рублями
 */
export async function testPaymentScenePayWithRubles(): Promise<TestResult> {
  try {
    setupTest();
    
    // Создаем мок-контекст
    const ctx = createMockContext();
    ctx.from = { 
      id: TEST_USER_ID, 
      is_bot: false, 
      first_name: 'Test', 
      username: TEST_USERNAME, 
      language_code: 'ru' 
    };
    ctx.botInfo = { username: 'test_bot' } as any;
    ctx.session = {
      subscription: 'neurophoto'
    };
    ctx.message = { text: '💳 Рублями' } as any;
    
    // Запускаем обработчик сцены
    const paymentScene = (await import('@/scenes/paymentScene')).paymentScene;
    await paymentScene.emit('text', ctx as unknown as MyContext, {}, '💳 Рублями');
    
    // Проверки
    expect(mockedCreatePendingPayment).toHaveBeenCalled();
    expect(mockedGenerateUniqueShortInvId).toHaveBeenCalled();
    assertReplyContains(ctx, 'Оплата');
    expect(ctx.scene.leave).toHaveBeenCalled();
    
    return {
      name: 'paymentScene: Оплата рублями',
      category: TestCategory.All,
      success: true,
      message: 'Тест оплаты рублями успешно пройден'
    };
  } catch (error) {
    logger.error('Ошибка в тесте оплаты рублями:', error);
    return {
      name: 'paymentScene: Оплата рублями',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Тест для оплаты рублями без выбранной подписки
 */
export async function testPaymentScenePayWithRublesNoSubscription(): Promise<TestResult> {
  try {
    setupTest();
    
    // Создаем мок-контекст
    const ctx = createMockContext();
    ctx.from = { 
      id: TEST_USER_ID, 
      is_bot: false, 
      first_name: 'Test', 
      username: TEST_USERNAME, 
      language_code: 'ru' 
    };
    ctx.botInfo = { username: 'test_bot' } as any;
    ctx.session = {};
    ctx.message = { text: '💳 Рублями' } as any;
    
    // Запускаем обработчик сцены
    const paymentScene = (await import('@/scenes/paymentScene')).paymentScene;
    await paymentScene.emit('text', ctx as unknown as MyContext, {}, '💳 Рублями');
    
    // Проверки
    assertReplyContains(ctx, 'Пожалуйста, сначала выберите тариф');
    expect(ctx.scene.enter).toHaveBeenCalledWith('menuScene');
    
    return {
      name: 'paymentScene: Оплата рублями без подписки',
      category: TestCategory.All,
      success: true,
      message: 'Тест оплаты рублями без подписки успешно пройден'
    };
  } catch (error) {
    logger.error('Ошибка в тесте оплаты рублями без подписки:', error);
    return {
      name: 'paymentScene: Оплата рублями без подписки',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Тест для возврата в главное меню
 */
export async function testPaymentSceneBackToMainMenu(): Promise<TestResult> {
  try {
    setupTest();
    
    // Создаем мок-контекст
    const ctx = createMockContext();
    ctx.from = { 
      id: TEST_USER_ID, 
      is_bot: false, 
      first_name: 'Test', 
      username: TEST_USERNAME, 
      language_code: 'ru' 
    };
    ctx.session = {};
    ctx.message = { text: '🏠 Главное меню' } as any;
    
    // Запускаем обработчик сцены
    const paymentScene = (await import('@/scenes/paymentScene')).paymentScene;
    await paymentScene.emit('text', ctx as unknown as MyContext, {}, '🏠 Главное меню');
    
    // Проверки
    expect(ctx.scene.enter).toHaveBeenCalledWith('menuScene');
    
    return {
      name: 'paymentScene: Возврат в главное меню',
      category: TestCategory.All,
      success: true,
      message: 'Тест возврата в главное меню успешно пройден'
    };
  } catch (error) {
    logger.error('Ошибка в тесте возврата в главное меню:', error);
    return {
      name: 'paymentScene: Возврат в главное меню',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Запуск всех тестов для paymentScene
 */
export async function runPaymentSceneTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  try {
    results.push(await testPaymentSceneEnter());
    results.push(await testPaymentSceneEnterWithSelectedPayment());
    results.push(await testPaymentScenePayWithStars());
    results.push(await testPaymentScenePayWithStarsSubscription());
    results.push(await testPaymentScenePayWithRubles());
    results.push(await testPaymentScenePayWithRublesNoSubscription());
    results.push(await testPaymentSceneBackToMainMenu());
  } catch (error) {
    logger.error('Ошибка при запуске тестов paymentScene:', error);
    results.push({
      name: 'paymentScene: Общая ошибка',
      category: TestCategory.All,
      success: false,
      message: String(error)
    });
  }
  
  return results;
}

export default runPaymentSceneTests; 