#!/usr/bin/env node
/**
 * Запуск тестов для телеграм-сцен
 */
import { loggerTest as logger } from '@/utils/logger';
import { TestResult } from './core/types';
import * as sceneTests from './tests/scenes/subscriptionCheckScene.test';
import * as balanceNotifierTests from './tests/scenes/balanceNotifierScene.test';
import * as checkBalanceTests from './tests/scenes/checkBalanceScene.test';
import * as menuSceneTests from './tests/scenes/menuScene.test';
import * as startSceneTests from './tests/scenes/startScene.test';  // Раскомментировано
import * as helpSceneTests from './tests/scenes/helpScene.test';    // Раскомментировано
import * as selectNeuroPhotoTests from './tests/scenes/selectNeuroPhotoScene.test';
import mockApi from './core/mock';
import * as database from '@/libs/database';
import * as supabaseModule from '@/supabase';

// Импорт специфичных тестов из selectNeuroPhotoScene.test.ts
import {
  runSelectNeuroPhotoSceneTests,
  testSelectNeuroPhotoScene_EmptyString,
  testSelectNeuroPhotoScene_SpecialCharacters,
  testSelectNeuroPhotoScene_VeryLongInput,
  testSelectNeuroPhotoScene_StatePersistence
} from './tests/scenes/selectNeuroPhotoScene.test';

// Import our new payment scene tests
import * as paymentSceneTests from './tests/scenes/paymentScene.test';

// Mock Supabase to avoid credentials error - проверяем, не был ли уже определен объект
if (!Object.getOwnPropertyDescriptor(supabaseModule, 'supabase')?.configurable === false) {
  try {
    Object.defineProperty(supabaseModule, 'supabase', {
      value: mockApi.mockSupabase(),
      configurable: true,
    });
  } catch (error) {
    console.log('Supabase mock already defined, skipping redefinition');
  }
}

// Переопределяем функцию getUserSub для тестов, чтобы избежать обращения к Supabase
try {
  Object.defineProperty(database, 'getUserSub', {
    value: mockApi.create(),
    configurable: true,
  });
} catch (error) {
  console.log('getUserSub mock already defined, skipping redefinition');
}

// Переопределяем функцию getUserBalance для тестов
try {
  Object.defineProperty(database, 'getUserBalance', {
    value: mockApi.create(),
    configurable: true,
  });
} catch (error) {
  console.log('getUserBalance mock already defined, skipping redefinition');
}

// Переопределяем функцию getUserByTelegramId для тестов
try {
  Object.defineProperty(database, 'getUserByTelegramId', {
    value: mockApi.create(),
    configurable: true,
  });
} catch (error) {
  console.log('getUserByTelegramId mock already defined, skipping redefinition');
}

export async function runScenesTests(): Promise<TestResult[]> {
  console.log('📱 Запуск тестов Telegram сцен...');
  logger.info('📱 Запуск тестов Telegram сцен...');
  
  const results: TestResult[] = [];
  
  // Запускаем тест проверки подписки - активная подписка
  try {
    console.log('Тест: Проверка активной подписки...');
    const activeSubscriptionResult = await sceneTests.testSubscriptionCheckScene_ActiveSubscription();
    results.push(activeSubscriptionResult);
    console.log(`✅ ${activeSubscriptionResult.name}: ${activeSubscriptionResult.success ? 'УСПЕХ' : 'ОШИБКА'}`);
    console.log(`   Сообщение: ${activeSubscriptionResult.message}`);
  } catch (error) {
    logger.error('❌ Ошибка при тестировании активной подписки:', error);
    console.log('❌ Ошибка при тестировании активной подписки:', error);
    results.push({
      name: 'subscriptionCheckScene: Active Subscription',
      success: false,
      message: String(error)
    });
  }
  
  // Запускаем тест проверки подписки - нет подписки
  try {
    console.log('Тест: Проверка отсутствия подписки...');
    const noSubscriptionResult = await sceneTests.testSubscriptionCheckScene_NoSubscription();
    results.push(noSubscriptionResult);
    console.log(`✅ ${noSubscriptionResult.name}: ${noSubscriptionResult.success ? 'УСПЕХ' : 'ОШИБКА'}`);
    console.log(`   Сообщение: ${noSubscriptionResult.message}`);
  } catch (error) {
    logger.error('❌ Ошибка при тестировании отсутствия подписки:', error);
    console.log('❌ Ошибка при тестировании отсутствия подписки:', error);
    results.push({
      name: 'subscriptionCheckScene: No Subscription',
      success: false,
      message: String(error)
    });
  }
  
  // Запускаем тест проверки подписки - истекшая подписка
  try {
    console.log('Тест: Проверка истекшей подписки...');
    const expiredSubscriptionResult = await sceneTests.testSubscriptionCheckScene_ExpiredSubscription();
    results.push(expiredSubscriptionResult);
    console.log(`✅ ${expiredSubscriptionResult.name}: ${expiredSubscriptionResult.success ? 'УСПЕХ' : 'ОШИБКА'}`);
    console.log(`   Сообщение: ${expiredSubscriptionResult.message}`);
  } catch (error) {
    logger.error('❌ Ошибка при тестировании истекшей подписки:', error);
    console.log('❌ Ошибка при тестировании истекшей подписки:', error);
    results.push({
      name: 'subscriptionCheckScene: Expired Subscription',
      success: false,
      message: String(error)
    });
  }
  
  // Запускаем тест уведомлений о балансе - вход в сцену
  try {
    console.log('Тест: Вход в сцену уведомлений о балансе...');
    const enterBalanceNotifierResult = await balanceNotifierTests.testBalanceNotifierScene_EnterScene();
    results.push(enterBalanceNotifierResult);
    console.log(`✅ ${enterBalanceNotifierResult.name}: ${enterBalanceNotifierResult.success ? 'УСПЕХ' : 'ОШИБКА'}`);
    console.log(`   Сообщение: ${enterBalanceNotifierResult.message}`);
  } catch (error) {
    logger.error('❌ Ошибка при тестировании входа в сцену уведомлений о балансе:', error);
    console.log('❌ Ошибка при тестировании входа в сцену уведомлений о балансе:', error);
    results.push({
      name: 'balanceNotifierScene: Enter Scene',
      success: false,
      message: String(error)
    });
  }
  
  // Запускаем тест уведомлений о балансе - включение/выключение уведомлений
  try {
    console.log('Тест: Переключение уведомлений о балансе...');
    const toggleNotificationsResult = await balanceNotifierTests.testBalanceNotifierScene_ToggleNotifications();
    results.push(toggleNotificationsResult);
    console.log(`✅ ${toggleNotificationsResult.name}: ${toggleNotificationsResult.success ? 'УСПЕХ' : 'ОШИБКА'}`);
    console.log(`   Сообщение: ${toggleNotificationsResult.message}`);
  } catch (error) {
    logger.error('❌ Ошибка при тестировании переключения уведомлений о балансе:', error);
    console.log('❌ Ошибка при тестировании переключения уведомлений о балансе:', error);
    results.push({
      name: 'balanceNotifierScene: Toggle Notifications',
      success: false,
      message: String(error)
    });
  }
  
  // Запускаем тест уведомлений о балансе - изменение порога
  try {
    console.log('Тест: Изменение порога уведомлений о балансе...');
    const changeThresholdResult = await balanceNotifierTests.testBalanceNotifierScene_ChangeThreshold();
    results.push(changeThresholdResult);
    console.log(`✅ ${changeThresholdResult.name}: ${changeThresholdResult.success ? 'УСПЕХ' : 'ОШИБКА'}`);
    console.log(`   Сообщение: ${changeThresholdResult.message}`);
  } catch (error) {
    logger.error('❌ Ошибка при тестировании изменения порога уведомлений о балансе:', error);
    console.log('❌ Ошибка при тестировании изменения порога уведомлений о балансе:', error);
    results.push({
      name: 'balanceNotifierScene: Change Threshold',
      success: false,
      message: String(error)
    });
  }
  
  // Остальные тесты временно закомментированы для исправления ошибок
  // Вместо этого добавляем заглушки для проверки работоспособности

  try {
    console.log('Тест: Проверка ввода порога уведомлений...');
    const thresholdInputResult = await balanceNotifierTests.testBalanceNotifierScene_ThresholdInput();
    results.push(thresholdInputResult);
    console.log(`✅ ${thresholdInputResult.name}: ${thresholdInputResult.success ? 'УСПЕХ' : 'ОШИБКА'}`);
    console.log(`   Сообщение: ${thresholdInputResult.message}`);
  } catch (error) {
    console.log('❌ Ошибка при тестировании ввода порога уведомлений:', error);
    results.push({
      name: 'balanceNotifierScene: Threshold Input',
      success: false,
      message: String(error)
    });
  }

  try {
    console.log('Тест: Возврат в меню из сцены уведомлений...');
    const backToMenuResult = await balanceNotifierTests.testBalanceNotifierScene_BackToMenu();
    results.push(backToMenuResult);
    console.log(`✅ ${backToMenuResult.name}: ${backToMenuResult.success ? 'УСПЕХ' : 'ОШИБКА'}`);
    console.log(`   Сообщение: ${backToMenuResult.message}`);
  } catch (error) {
    console.log('❌ Ошибка при тестировании возврата в меню:', error);
    results.push({
      name: 'balanceNotifierScene: Back To Menu',
      success: false,
      message: String(error)
    });
  }

  try {
    console.log('Тест: Команды выхода из сцены уведомлений...');
    const exitCommandsResult = await balanceNotifierTests.testBalanceNotifierScene_ExitCommands();
    results.push(exitCommandsResult);
    console.log(`✅ ${exitCommandsResult.name}: ${exitCommandsResult.success ? 'УСПЕХ' : 'ОШИБКА'}`);
    console.log(`   Сообщение: ${exitCommandsResult.message}`);
  } catch (error) {
    console.log('❌ Ошибка при тестировании команд выхода:', error);
    results.push({
      name: 'balanceNotifierScene: Exit Commands',
      success: false,
      message: String(error)
    });
  }

  // Тесты меню сцены
  try {
    console.log('Тест: Вход в меню...');
    const enterMenuResult = await menuSceneTests.testMenuScene_EnterScene();
    results.push(enterMenuResult);
    console.log(`✅ ${enterMenuResult.name}: ${enterMenuResult.success ? 'УСПЕХ' : 'ОШИБКА'}`);
    console.log(`   Сообщение: ${enterMenuResult.message}`);
  } catch (error) {
    console.log('❌ Ошибка при тестировании входа в меню:', error);
    results.push({
      name: 'menuScene: Enter Scene',
      success: false,
      message: String(error)
    });
  }

  try {
    console.log('Тест: Проверка баланса...');
    const checkBalanceResult = await checkBalanceTests.testCheckBalanceScene_EnterScene();
    results.push(checkBalanceResult);
    console.log(`✅ ${checkBalanceResult.name}: ${checkBalanceResult.success ? 'УСПЕХ' : 'ОШИБКА'}`);
    console.log(`   Сообщение: ${checkBalanceResult.message}`);
  } catch (error) {
    console.log('❌ Ошибка при тестировании проверки баланса:', error);
    results.push({
      name: 'checkBalanceScene: Enter Scene',
      success: false,
      message: String(error)
    });
  }

  // Payment Scene Tests
  try {
    console.log('Тест: Вход в сцену оплаты...');
    const enterPaymentResult = await paymentSceneTests.testPaymentScene_Enter();
    results.push(enterPaymentResult);
    console.log(`✅ ${enterPaymentResult.name}: ${enterPaymentResult.success ? 'УСПЕХ' : 'ОШИБКА'}`);
    console.log(`   Сообщение: ${enterPaymentResult.message}`);
  } catch (error) {
    console.log('❌ Ошибка при тестировании входа в сцену оплаты:', error);
    results.push({
      name: 'paymentScene: Enter Scene',
      success: false,
      message: String(error)
    });
  }

  try {
    console.log('Тест: Оплата сцены с выбранным платежом...');
    const withSelectedPaymentResult = await paymentSceneTests.testPaymentScene_WithSelectedPayment();
    results.push(withSelectedPaymentResult);
    console.log(`✅ ${withSelectedPaymentResult.name}: ${withSelectedPaymentResult.success ? 'УСПЕХ' : 'ОШИБКА'}`);
    console.log(`   Сообщение: ${withSelectedPaymentResult.message}`);
  } catch (error) {
    console.log('❌ Ошибка при тестировании оплаты с выбранным платежом:', error);
    results.push({
      name: 'paymentScene: With Selected Payment',
      success: false,
      message: String(error)
    });
  }

  try {
    console.log('Тест: Оплата звездами...');
    const payWithStarsResult = await paymentSceneTests.testPaymentScene_PayWithStars();
    results.push(payWithStarsResult);
    console.log(`✅ ${payWithStarsResult.name}: ${payWithStarsResult.success ? 'УСПЕХ' : 'ОШИБКА'}`);
    console.log(`   Сообщение: ${payWithStarsResult.message}`);
  } catch (error) {
    console.log('❌ Ошибка при тестировании оплаты звездами:', error);
    results.push({
      name: 'paymentScene: Pay With Stars',
      success: false,
      message: String(error)
    });
  }

  try {
    console.log('Тест: Оплата по подписке...');
    const payWithSubscriptionResult = await paymentSceneTests.testPaymentScene_PayWithSubscription();
    results.push(payWithSubscriptionResult);
    console.log(`✅ ${payWithSubscriptionResult.name}: ${payWithSubscriptionResult.success ? 'УСПЕХ' : 'ОШИБКА'}`);
    console.log(`   Сообщение: ${payWithSubscriptionResult.message}`);
  } catch (error) {
    console.log('❌ Ошибка при тестировании оплаты по подписке:', error);
    results.push({
      name: 'paymentScene: Pay With Subscription',
      success: false,
      message: String(error)
    });
  }

  try {
    console.log('Тест: Оплата рублями...');
    const payWithRublesResult = await paymentSceneTests.testPaymentScene_PayWithRubles();
    results.push(payWithRublesResult);
    console.log(`✅ ${payWithRublesResult.name}: ${payWithRublesResult.success ? 'УСПЕХ' : 'ОШИБКА'}`);
    console.log(`   Сообщение: ${payWithRublesResult.message}`);
  } catch (error) {
    console.log('❌ Ошибка при тестировании оплаты рублями:', error);
    results.push({
      name: 'paymentScene: Pay With Rubles',
      success: false,
      message: String(error)
    });
  }

  try {
    console.log('Тест: Возврат в главное меню из сцены оплаты...');
    const returnToMainMenuResult = await paymentSceneTests.testPaymentScene_ReturnToMainMenu();
    results.push(returnToMainMenuResult);
    console.log(`✅ ${returnToMainMenuResult.name}: ${returnToMainMenuResult.success ? 'УСПЕХ' : 'ОШИБКА'}`);
    console.log(`   Сообщение: ${returnToMainMenuResult.message}`);
  } catch (error) {
    console.log('❌ Ошибка при тестировании возврата в главное меню из сцены оплаты:', error);
    results.push({
      name: 'paymentScene: Return To Main Menu',
      success: false,
      message: String(error)
    });
  }

  // Добавляем запуск тестов для startScene
  // Тест входа в стартовую сцену
  try {
    console.log('Тест: Вход в стартовую сцену...');
    const enterStartSceneResult = await startSceneTests.testStartScene_EnterScene();
    results.push(enterStartSceneResult);
    console.log(`✅ ${enterStartSceneResult.name}: ${enterStartSceneResult.success ? 'УСПЕХ' : 'ОШИБКА'}`);
    console.log(`   Сообщение: ${enterStartSceneResult.message}`);
  } catch (error) {
    logger.error('❌ Ошибка при тестировании входа в стартовую сцену:', error);
    console.log('❌ Ошибка при тестировании входа в стартовую сцену:', error);
    results.push({
      name: 'startScene: Enter Scene',
      success: false,
      message: String(error)
    });
  }

  // Тест приветственного сообщения
  try {
    console.log('Тест: Приветственное сообщение...');
    const welcomeMessageResult = await startSceneTests.testStartScene_WelcomeMessage();
    results.push(welcomeMessageResult);
    console.log(`✅ ${welcomeMessageResult.name}: ${welcomeMessageResult.success ? 'УСПЕХ' : 'ОШИБКА'}`);
    console.log(`   Сообщение: ${welcomeMessageResult.message}`);
  } catch (error) {
    logger.error('❌ Ошибка при тестировании приветственного сообщения:', error);
    console.log('❌ Ошибка при тестировании приветственного сообщения:', error);
    results.push({
      name: 'startScene: Welcome Message',
      success: false,
      message: String(error)
    });
  }

  // Тест регистрации нового пользователя
  try {
    console.log('Тест: Регистрация нового пользователя...');
    const newUserRegistrationResult = await startSceneTests.testStartScene_NewUserRegistration();
    results.push(newUserRegistrationResult);
    console.log(`✅ ${newUserRegistrationResult.name}: ${newUserRegistrationResult.success ? 'УСПЕХ' : 'ОШИБКА'}`);
    console.log(`   Сообщение: ${newUserRegistrationResult.message}`);
  } catch (error) {
    logger.error('❌ Ошибка при тестировании регистрации нового пользователя:', error);
    console.log('❌ Ошибка при тестировании регистрации нового пользователя:', error);
    results.push({
      name: 'startScene: New User Registration',
      success: false,
      message: String(error)
    });
  }

  // Тест перехода в главное меню
  try {
    console.log('Тест: Переход в главное меню...');
    const goToMainMenuResult = await startSceneTests.testStartScene_GoToMainMenu();
    results.push(goToMainMenuResult);
    console.log(`✅ ${goToMainMenuResult.name}: ${goToMainMenuResult.success ? 'УСПЕХ' : 'ОШИБКА'}`);
    console.log(`   Сообщение: ${goToMainMenuResult.message}`);
  } catch (error) {
    logger.error('❌ Ошибка при тестировании перехода в главное меню:', error);
    console.log('❌ Ошибка при тестировании перехода в главное меню:', error);
    results.push({
      name: 'startScene: Go To Main Menu',
      success: false,
      message: String(error)
    });
  }

  // Тест перехода на сцену оформления подписки
  try {
    console.log('Тест: Переход на сцену оформления подписки...');
    const goToSubscriptionSceneResult = await startSceneTests.testStartScene_GoToSubscriptionScene();
    results.push(goToSubscriptionSceneResult);
    console.log(`✅ ${goToSubscriptionSceneResult.name}: ${goToSubscriptionSceneResult.success ? 'УСПЕХ' : 'ОШИБКА'}`);
    console.log(`   Сообщение: ${goToSubscriptionSceneResult.message}`);
  } catch (error) {
    logger.error('❌ Ошибка при тестировании перехода на сцену оформления подписки:', error);
    console.log('❌ Ошибка при тестировании перехода на сцену оформления подписки:', error);
    results.push({
      name: 'startScene: Go To Subscription Scene',
      success: false,
      message: String(error)
    });
  }

  // Тест обработки ошибки при отсутствии ID пользователя
  try {
    console.log('Тест: Обработка ошибки при отсутствии ID пользователя...');
    const handleMissingUserIdResult = await startSceneTests.testStartScene_HandleMissingUserId();
    results.push(handleMissingUserIdResult);
    console.log(`✅ ${handleMissingUserIdResult.name}: ${handleMissingUserIdResult.success ? 'УСПЕХ' : 'ОШИБКА'}`);
    console.log(`   Сообщение: ${handleMissingUserIdResult.message}`);
  } catch (error) {
    logger.error('❌ Ошибка при тестировании обработки ошибки при отсутствии ID пользователя:', error);
    console.log('❌ Ошибка при тестировании обработки ошибки при отсутствии ID пользователя:', error);
    results.push({
      name: 'startScene: Handle Missing User ID',
      success: false,
      message: String(error)
    });
  }

  // Добавляем запуск тестов для helpScene
  // Тест входа в сцену помощи
  try {
    console.log('Тест: Вход в сцену помощи...');
    const enterHelpSceneResult = await helpSceneTests.testHelpScene_EnterScene();
    results.push(enterHelpSceneResult);
    console.log(`✅ ${enterHelpSceneResult.name}: ${enterHelpSceneResult.success ? 'УСПЕХ' : 'ОШИБКА'}`);
    console.log(`   Сообщение: ${enterHelpSceneResult.message}`);
  } catch (error) {
    logger.error('❌ Ошибка при тестировании входа в сцену помощи:', error);
    console.log('❌ Ошибка при тестировании входа в сцену помощи:', error);
    results.push({
      name: 'helpScene: Enter Scene',
      success: false,
      message: String(error)
    });
  }

  // Тест отображения справочной информации
  try {
    console.log('Тест: Отображение справочной информации...');
    const displayHelpResult = await helpSceneTests.testHelpScene_DisplayHelp();
    results.push(displayHelpResult);
    console.log(`✅ ${displayHelpResult.name}: ${displayHelpResult.success ? 'УСПЕХ' : 'ОШИБКА'}`);
    console.log(`   Сообщение: ${displayHelpResult.message}`);
  } catch (error) {
    logger.error('❌ Ошибка при тестировании отображения справочной информации:', error);
    console.log('❌ Ошибка при тестировании отображения справочной информации:', error);
    results.push({
      name: 'helpScene: Display Help',
      success: false,
      message: String(error)
    });
  }

  // Тест навигации по разделам справки
  try {
    console.log('Тест: Навигация по разделам справки...');
    const navigationResult = await helpSceneTests.testHelpScene_Navigation();
    results.push(navigationResult);
    console.log(`✅ ${navigationResult.name}: ${navigationResult.success ? 'УСПЕХ' : 'ОШИБКА'}`);
    console.log(`   Сообщение: ${navigationResult.message}`);
  } catch (error) {
    logger.error('❌ Ошибка при тестировании навигации по разделам справки:', error);
    console.log('❌ Ошибка при тестировании навигации по разделам справки:', error);
    results.push({
      name: 'helpScene: Navigation',
      success: false,
      message: String(error)
    });
  }

  // Тест возврата в меню
  try {
    console.log('Тест: Возврат в меню из сцены помощи...');
    const backToMenuFromHelpResult = await helpSceneTests.testHelpScene_BackToMenu();
    results.push(backToMenuFromHelpResult);
    console.log(`✅ ${backToMenuFromHelpResult.name}: ${backToMenuFromHelpResult.success ? 'УСПЕХ' : 'ОШИБКА'}`);
    console.log(`   Сообщение: ${backToMenuFromHelpResult.message}`);
  } catch (error) {
    logger.error('❌ Ошибка при тестировании возврата в меню из сцены помощи:', error);
    console.log('❌ Ошибка при тестировании возврата в меню из сцены помощи:', error);
    results.push({
      name: 'helpScene: Back To Menu',
      success: false,
      message: String(error)
    });
  }

  // Тест обработки неизвестного режима
  try {
    console.log('Тест: Обработка неизвестного режима в сцене помощи...');
    const handlesUnknownModeResult = await helpSceneTests.testHelpScene_HandlesUnknownMode();
    results.push(handlesUnknownModeResult);
    console.log(`✅ ${handlesUnknownModeResult.name}: ${handlesUnknownModeResult.success ? 'УСПЕХ' : 'ОШИБКА'}`);
    console.log(`   Сообщение: ${handlesUnknownModeResult.message}`);
  } catch (error) {
    logger.error('❌ Ошибка при тестировании обработки неизвестного режима в сцене помощи:', error);
    console.log('❌ Ошибка при тестировании обработки неизвестного режима в сцене помощи:', error);
    results.push({
      name: 'helpScene: Handles Unknown Mode',
      success: false,
      message: String(error)
    });
  }

  // Тест обработки ошибок
  try {
    console.log('Тест: Обработка ошибок в сцене помощи...');
    const handlesErrorsResult = await helpSceneTests.testHelpScene_HandlesErrors();
    results.push(handlesErrorsResult);
    console.log(`✅ ${handlesErrorsResult.name}: ${handlesErrorsResult.success ? 'УСПЕХ' : 'ОШИБКА'}`);
    console.log(`   Сообщение: ${handlesErrorsResult.message}`);
  } catch (error) {
    logger.error('❌ Ошибка при тестировании обработки ошибок в сцене помощи:', error);
    console.log('❌ Ошибка при тестировании обработки ошибок в сцене помощи:', error);
    results.push({
      name: 'helpScene: Handles Errors',
      success: false,
      message: String(error)
    });
  }

  logger.info('📱 Тесты Telegram сцен завершены');
  console.log('📱 Тесты Telegram сцен завершены');

  return results;
}

// Запускаем тесты если файл выполняется напрямую
if (require.main === module) {
  runScenesTests().catch(error => {
    console.error('Ошибка при запуске тестов:', error);
    process.exit(1);
  });
} 