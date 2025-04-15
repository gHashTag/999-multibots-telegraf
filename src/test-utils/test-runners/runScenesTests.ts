#!/usr/bin/env node
/**
 * Запуск тестов для телеграм-сцен
 */
import { logger } from '@/utils/logger';
import { TestResult, Test } from '../types';
import { TestCategory as TestCategoryCore } from './core/categories';
import mockApi from './core/mock';
import * as database from '@/libs/database';
import * as supabaseModule from '@/supabase';
import { inngest } from '@/inngest-functions/clients';
import { setupTestEnvironment } from './core/setupTests';
import { TestRunnerConfig } from '../types';
import { createMockFunction } from '../core/mockFunction';
import { setupTests } from '../core/setupTests';

// Импортируем тесты для сцен
import { 
  testLanguageScene_EnterScene,
  testLanguageScene_ChangeToRussian,
  testLanguageScene_ChangeToEnglish,
  testLanguageScene_UnsupportedLanguage,
  testLanguageScene_BackToMenu,
  testLanguageScene_CurrentLanguageIndicator
} from '../tests/scenes/languageScene.test';
import { runCreateUserSceneTests } from '../tests/scenes/createUserScene.test';
import { runTextToVideoWizardTests } from '../tests/scenes/textToVideoWizard.test';
import { runTextToImageWizardTests } from '../tests/scenes/textToImageWizard.test';
import { runNeuroPhotoWizardTests } from '../tests/scenes/neuroPhotoWizard.test';
import { runTextToSpeechWizardTests } from '../tests/scenes/textToSpeechWizard.test';
import { runSubscriptionSceneTests } from './tests/scenes/subscriptionScene.test';
import runNeuroPhotoWizardV2Tests from './tests/scenes/neuroPhotoWizardV2.test';
import runCheckBalanceSceneTests from './tests/scenes/checkBalanceScene.test';
import runPaymentSceneTests from './tests/scenes/paymentScene.test';
import runImageToVideoWizardTests from './tests/scenes/imageToVideoWizard.test';
import runAudioToTextSceneTests from './tests/scenes/audioToTextScene.test';
import runStartSceneTests from './tests/scenes/startScene.test';
import runBalanceSceneTests from './tests/scenes/balanceScene.test';
import runSelectModelSceneTests from './tests/scenes/selectModelScene.test';
import runImageToPromptWizardTests from './tests/scenes/imageToPromptWizard.test';
import runVoiceAvatarWizardTests from './tests/scenes/voiceAvatarWizard.test';
import runHelpSceneTests from './tests/scenes/helpScene.test';
import runIdeasGeneratorTests from './tests/scenes/ideasGeneratorScene.test';
import runMenuSceneTests from './tests/scenes/menuScene.test';
import runLipSyncWizardTests from './tests/scenes/lipSyncWizard.test';
import runErrorSceneTests from './tests/scenes/errorScene.test';
import runBotStartSceneTests from './tests/scenes/botStartScene.test';
import runIdeasGeneratorSceneTests from './tests/scenes/ideasGeneratorScene.test';
import runIdeaGeneratorSceneTests from './tests/scenes/ideaGeneratorScene.test';
import runBroadcastSendMessageSceneTests from './tests/scenes/broadcastSendMessageScene.test';
import runMergeVideoAndAudioSceneTests from './tests/scenes/mergeVideoAndAudioScene.test';
import runRegisterSceneTests from './tests/scenes/registerScene.test';
import runAutopaySuccessSceneTests from './tests/scenes/autopaySuccessScene.test';
import runAutopayFailureSceneTests from './tests/scenes/autopayFailureScene.test';
import runSuccessPayLinkSceneTests from './tests/scenes/successPayLinkScene.test';
import runSuccessPayQRSceneTests from './tests/scenes/successPayQRScene.test';
import runJoinPromoSceneTests from './tests/scenes/joinPromoScene.test';
import runSelectNeuroPhotoSceneTests from './tests/scenes/selectNeuroPhotoScene.test';
import runImageGeneratorSceneTests from './tests/scenes/imageGeneratorScene.test';
import runPersonalCabinetSceneTests from './tests/scenes/personalCabinetScene.test';
import runSelectLanguageSceneTests from './tests/scenes/selectLanguageScene.test';
import runManagePromocodesSceneTests from './tests/scenes/managePromocodesScene.test';
import runShowPromocodesSceneTests from './tests/scenes/showPromocodesScene.test';
import runStatisticsSceneTests from './tests/scenes/statisticsScene.test';

// Мокируем Supabase, чтобы избежать ошибок с учетными данными
try {
  Object.defineProperty(supabaseModule, 'supabase', {
    value: mockApi.mockSupabase(),
    configurable: true,
  });
} catch (error) {
  console.log('Supabase mock уже определен, пропускаем переопределение');
}

// Мокируем функции базы данных
try {
  Object.defineProperty(database, 'getUserSub', {
    value: mockApi.create(),
    configurable: true,
  });
  Object.defineProperty(database, 'getUserBalance', {
    value: mockApi.create(),
    configurable: true,
  });
  Object.defineProperty(database, 'getUserByTelegramId', {
    value: mockApi.create(),
    configurable: true,
  });
} catch (error) {
  console.log('Моки базы данных уже определены, пропускаем переопределение');
}

/**
 * Запускает тесты и возвращает результаты
 */
export async function runScenesTests(): Promise<TestResult[]> {
  console.log('🤖 Запуск тестов Telegram сцен...');
  logger.info('🤖 Запуск тестов Telegram сцен...');
  
  const results: TestResult[] = [];
  
  // Запускаем тесты для языковой сцены
  await runTestsGroup('Тесты языковой сцены', [
    testLanguageScene_EnterScene,
    testLanguageScene_ChangeToRussian,
    testLanguageScene_ChangeToEnglish,
    testLanguageScene_UnsupportedLanguage,
    testLanguageScene_BackToMenu,
    testLanguageScene_CurrentLanguageIndicator
  ], results);
  
  // Запускаем тесты для сцены создания пользователя
  await runTestsGroup('Тесты сцены создания пользователя', [
    runCreateUserSceneTests.testCreateUserScene_CreateUserWithoutReferral,
    runCreateUserSceneTests.testCreateUserScene_CreateUserWithReferral,
    runCreateUserSceneTests.testCreateUserScene_HandleMissingUserData,
    runCreateUserSceneTests.testCreateUserScene_HandleMissingMessageText,
    runCreateUserSceneTests.testCreateUserScene_CreateUserWithFullReferralLink
  ], results);
  
  // Run textToVideoWizard tests
  console.log('\n🧪 Running textToVideoWizard tests...');
  try {
    const textToVideoWizardResults = await runTextToVideoWizardTests();
    textToVideoWizardResults.forEach(result => {
      console.log(`${result.success ? '✅' : '❌'} ${result.name}: ${result.message}`);
      results.push(result);
    });
  } catch (error) {
    console.error('❌ Error running textToVideoWizard tests:', error);
    results.push({
      success: false,
      name: 'textToVideoWizard tests',
      message: String(error)
    });
  }
  
  // Run audioToTextScene tests
  console.log('\n🧪 Running audioToTextScene tests...');
  try {
    const audioToTextSceneResults = await runAudioToTextSceneTests();
    audioToTextSceneResults.forEach(result => {
      console.log(`${result.success ? '✅' : '❌'} ${result.name}: ${result.message}`);
      results.push(result);
    });
  } catch (error) {
    console.error('❌ Error running audioToTextScene tests:', error);
    results.push({
      success: false,
      name: 'audioToTextScene tests',
      message: String(error)
    });
  }
  
  // Run textToImageWizard tests
  console.log('\n🧪 Running textToImageWizard tests...');
  try {
    const textToImageWizardResults = await runTextToImageWizardTests();
    textToImageWizardResults.forEach(result => {
      console.log(`${result.success ? '✅' : '❌'} ${result.name}: ${result.message}`);
      results.push(result);
    });
  } catch (error) {
    console.error('❌ Error running textToImageWizard tests:', error);
    results.push({
      success: false,
      name: 'textToImageWizard tests',
      message: String(error)
    });
  }
  
  // Run neuroPhotoWizard tests
  console.log('\n🧪 Running neuroPhotoWizard tests...');
  try {
    const neuroPhotoWizardResults = await runNeuroPhotoWizardTests();
    neuroPhotoWizardResults.forEach(result => {
      if (result.success) {
        console.log(`✅ ${result.name}: ${result.message}`);
      } else {
        console.error(`❌ ${result.name}: ${result.message}`);
        results.push(result);
      }
    });
  } catch (error) {
    console.error(`❌ Error running neuroPhotoWizard tests: ${error}`);
    results.push({
      name: 'neuroPhotoWizard tests',
      success: false,
      message: String(error)
    });
  }
  
  // Run textToSpeechWizard tests
  console.log('\n🧪 Running textToSpeechWizard tests...');
  try {
    const textToSpeechWizardResults = await runTextToSpeechWizardTests();
    textToSpeechWizardResults.forEach(result => {
      if (result.success) {
        console.log(`✅ ${result.name}: ${result.message}`);
      } else {
        console.error(`❌ ${result.name}: ${result.message}`);
        results.push(result);
      }
    });
  } catch (error) {
    console.error(`❌ Error running textToSpeechWizard tests: ${error}`);
    results.push({
      name: 'textToSpeechWizard tests',
      success: false,
      message: String(error)
    });
  }
  
  // Run subscriptionScene tests
  console.log('\n🧪 Running subscriptionScene tests...');
  try {
    const subscriptionSceneResults = await runSubscriptionSceneTests();
    subscriptionSceneResults.forEach(result => {
      if (result.success) {
        console.log(`✅ ${result.name}: ${result.message}`);
      } else {
        console.error(`❌ ${result.name}: ${result.message}`);
        results.push(result);
      }
    });
  } catch (error) {
    console.error(`❌ Error running subscriptionScene tests: ${error}`);
    results.push({
      name: 'subscriptionScene tests',
      success: false,
      message: String(error)
    });
  }
  
  // Run neuroPhotoWizardV2 tests
  console.log('\n🧪 Running neuroPhotoWizardV2 tests...');
  try {
    const neuroPhotoWizardV2Results = await runNeuroPhotoWizardV2Tests();
    neuroPhotoWizardV2Results.forEach(result => {
      console.log(`${result.success ? '✅' : '❌'} ${result.name}: ${result.message}`);
      results.push(result);
    });
  } catch (error) {
    console.error('❌ Error running neuroPhotoWizardV2 tests:', error);
    results.push({
      success: false,
      name: 'neuroPhotoWizardV2 tests',
      message: String(error)
    });
  }
  
  // Run imageToVideoWizard tests
  console.log('\n🧪 Running imageToVideoWizard tests...');
  try {
    const imageToVideoWizardResults = await runImageToVideoWizardTests();
    imageToVideoWizardResults.forEach(result => {
      console.log(`${result.success ? '✅' : '❌'} ${result.name}: ${result.message}`);
      results.push(result);
    });
  } catch (error) {
    console.error('❌ Error running imageToVideoWizard tests:', error);
    results.push({
      success: false,
      name: 'imageToVideoWizard tests',
      message: String(error)
    });
  }
  
  // Run imageToPromptWizard tests
  console.log('\n🧪 Running imageToPromptWizard tests...');
  try {
    const imageToPromptWizardResults = await runImageToPromptWizardTests();
    imageToPromptWizardResults.forEach(result => {
      console.log(`${result.success ? '✅' : '❌'} ${result.name}: ${result.message}`);
      results.push(result);
    });
  } catch (error) {
    console.error('❌ Error running imageToPromptWizard tests:', error);
    results.push({
      success: false,
      name: 'imageToPromptWizard tests',
      message: String(error)
    });
  }
  
  // Run startScene tests
  console.log('\n🧪 Running startScene tests...');
  try {
    const startSceneResults = await runStartSceneTests();
    startSceneResults.forEach(result => {
      console.log(`${result.success ? '✅' : '❌'} ${result.name}: ${result.message}`);
      results.push(result);
    });
  } catch (error) {
    console.error('❌ Error running startScene tests:', error);
    results.push({
      success: false,
      name: 'startScene tests',
      message: String(error)
    });
  }
  
  // Run payment scene tests
  console.log('\n🧪 Running paymentScene tests...');
  try {
    const paymentSceneResults = await runPaymentSceneTests();
    paymentSceneResults.forEach(result => {
      console.log(`${result.success ? '✅' : '❌'} ${result.name}: ${result.message}`);
      results.push(result);
    });
  } catch (error) {
    console.error('❌ Error running paymentScene tests:', error);
    results.push({
      success: false,
      name: 'paymentScene tests',
      message: String(error)
    });
  }
  
  // Run Text to Video Wizard tests
  console.log('\n🔹 Running Text to Video Wizard tests...');
  try {
    const textToVideoResults = await runTextToVideoWizardTests();
    results.push(...textToVideoResults);
    console.log(`✅ Text to Video Wizard tests completed: ${textToVideoResults.filter(r => r.success).length} passed, ${textToVideoResults.filter(r => !r.success).length} failed`);
  } catch (error) {
    console.error('❌ Error running Text to Video Wizard tests:', error);
    results.push({
      name: 'Text to Video Wizard tests',
      category: TestCategory.All,
      success: false,
      message: String(error)
    });
  }
  
  // Run Image to Video Wizard tests
  console.log('\n🔹 Running Image to Video Wizard tests...');
  try {
    const imageToVideoResults = await runImageToVideoWizardTests();
    results.push(...imageToVideoResults);
    console.log(`✅ Image to Video Wizard tests completed: ${imageToVideoResults.filter(r => r.success).length} passed, ${imageToVideoResults.filter(r => !r.success).length} failed`);
  } catch (error) {
    console.error('❌ Error running Image to Video Wizard tests:', error);
    results.push({
      name: 'Image to Video Wizard tests',
      category: TestCategory.All,
      success: false,
      message: String(error)
    });
  }
  
  // Run Image to Prompt Wizard tests
  console.log('\n🔹 Running Image to Prompt Wizard tests...');
  try {
    const imageToPromptResults = await runImageToPromptWizardTests();
    results.push(...imageToPromptResults);
    console.log(`✅ Image to Prompt Wizard tests completed: ${imageToPromptResults.filter(r => r.success).length} passed, ${imageToPromptResults.filter(r => !r.success).length} failed`);
  } catch (error) {
    console.error('❌ Error running Image to Prompt Wizard tests:', error);
    results.push({
      name: 'Image to Prompt Wizard tests',
      category: TestCategory.All,
      success: false,
      message: String(error)
    });
  }
  
  // Run neuroPhotoWizardV2 tests
  console.log('⏱️ Running neuroPhotoWizardV2 tests...');
  try {
    const neuroPhotoWizardV2Results = await runNeuroPhotoWizardV2Tests();
    results.push(...neuroPhotoWizardV2Results);
    console.log(`✅ NeuroPhoto wizard V2 tests completed: ${neuroPhotoWizardV2Results.filter(r => r.success).length} passed, ${neuroPhotoWizardV2Results.filter(r => !r.success).length} failed`);
  } catch (error) {
    console.error('❌ Error running neuroPhotoWizardV2 tests:', error);
  }
  
  // Run voiceAvatarWizard tests
  console.log('\n🧪 Running voiceAvatarWizard tests...');
  try {
    const voiceAvatarWizardResults = await runVoiceAvatarWizardTests();
    voiceAvatarWizardResults.forEach(result => {
      console.log(`${result.success ? '✅' : '❌'} ${result.name}: ${result.message}`);
      results.push(result);
    });
  } catch (error) {
    console.error('❌ Error running voiceAvatarWizard tests:', error);
    results.push({
      name: 'voiceAvatarWizard tests',
      success: false,
      message: String(error)
    });
  }
  
  // Run helpScene tests
  console.log('\n🧪 Running helpScene tests...');
  try {
    const helpSceneResults = await runHelpSceneTests();
    helpSceneResults.forEach(result => {
      console.log(`${result.success ? '✅' : '❌'} ${result.name}: ${result.message}`);
      results.push(result);
    });
  } catch (error) {
    console.error('❌ Error running helpScene tests:', error);
    results.push({
      name: 'helpScene tests',
      success: false,
      message: String(error)
    });
  }
  
  // Run selectModelScene tests
  console.log('\n🧪 Running selectModelScene tests...');
  try {
    const selectModelSceneResults = await runSelectModelSceneTests();
    selectModelSceneResults.forEach(result => {
      console.log(`${result.success ? '✅' : '❌'} ${result.name}: ${result.message}`);
      results.push(result);
    });
  } catch (error) {
    console.error('❌ Error running selectModelScene tests:', error);
    results.push({
      name: 'selectModelScene tests',
      success: false,
      message: String(error)
    });
  }
  
  // Run Idea Generator tests
  console.log('\n🧪 Running ideasGeneratorScene tests...');
  try {
    const ideasGeneratorResults = await runIdeasGeneratorTests();
    ideasGeneratorResults.forEach(result => {
      console.log(`${result.success ? '✅' : '❌'} ${result.name}: ${result.message}`);
      results.push(result);
    });
  } catch (error) {
    console.error('❌ Error running ideasGeneratorScene tests:', error);
    results.push({
      name: 'ideasGeneratorScene tests',
      success: false,
      message: String(error)
    });
  }
  
  // Run Menu Scene tests
  console.log('\n🧪 Running menuScene tests...');
  try {
    const menuSceneResults = await runMenuSceneTests();
    menuSceneResults.forEach(result => {
      console.log(`${result.success ? '✅' : '❌'} ${result.name}: ${result.message}`);
      results.push(result);
    });
  } catch (error) {
    console.error('❌ Error running menuScene tests:', error);
    results.push({
      name: 'menuScene tests',
      success: false,
      message: String(error)
    });
  }
  
  // Run LipSync Wizard tests
  console.log('\n🔹 Running Lip Sync Wizard tests...');
  try {
    const lipSyncWizardResults = await runLipSyncWizardTests();
    results.push(...lipSyncWizardResults);
    console.log(`✅ Lip Sync Wizard tests completed: ${lipSyncWizardResults.filter(r => r.success).length} passed, ${lipSyncWizardResults.filter(r => !r.success).length} failed`);
  } catch (error) {
    console.error('❌ Error running Lip Sync Wizard tests:', error);
    results.push({
      name: 'Lip Sync Wizard tests',
      category: TestCategory.Scenes,
      success: false,
      message: String(error)
    });
  }
  
  // Run Error Scene tests
  console.log('\n🧪 Running errorScene tests...');
  try {
    const errorSceneResults = await runErrorSceneTests();
    errorSceneResults.forEach(result => {
      console.log(`${result.success ? '✅' : '❌'} ${result.name}: ${result.message}`);
      results.push(result);
    });
  } catch (error) {
    console.error('❌ Error running errorScene tests:', error);
    results.push({
      name: 'errorScene tests',
      category: TestCategory.All,
      success: false,
      message: String(error)
    });
  }
  
  // Run botStartScene tests
  console.log('\n🧪 Running botStartScene tests...');
  try {
    const botStartSceneResults = await runBotStartSceneTests();
    botStartSceneResults.forEach(result => {
      console.log(`${result.success ? '✅' : '❌'} ${result.name}: ${result.message}`);
      results.push(result);
    });
  } catch (error) {
    console.error('❌ Error running botStartScene tests:', error);
    results.push({
      name: 'botStartScene tests',
      category: TestCategory.All,
      success: false,
      message: String(error)
    });
  }
  
  // Run Help Scene tests
  console.log('\n🔹 Running Help Scene tests...');
  try {
    const helpSceneResults = await runHelpSceneTests();
    helpSceneResults.forEach(result => {
      result.category = TestCategory.Scenes;
    });
    results.push(...helpSceneResults);
    console.log(`✅ Help Scene tests completed: ${helpSceneResults.filter(r => r.success).length} passed, ${helpSceneResults.filter(r => !r.success).length} failed`);
  } catch (error) {
    console.error('❌ Error running Help Scene tests:', error);
    results.push({
      name: 'Help Scene tests',
      category: TestCategory.Scenes,
      success: false,
      message: String(error)
    });
  }
  
  // Выводим общую статистику
  const successCount = results.filter(r => r.success).length;
  const failCount = results.length - successCount;
  
  console.log('');
  console.log(`📊 Результаты тестирования: Всего ${results.length}, Успех: ${successCount}, Ошибки: ${failCount}`);
  logger.info(`📊 Результаты тестирования: Всего ${results.length}, Успех: ${successCount}, Ошибки: ${failCount}`);
  
  if (failCount > 0) {
    console.log('❌ Обнаружены ошибки в следующих тестах:');
    results.filter(r => !r.success).forEach(result => {
      console.log(`   - ${result.name}: ${result.message}`);
    });
  } else {
    console.log('✅ Все тесты успешно пройдены!');
  }
  
  return results;
}

/**
 * Вспомогательная функция для запуска группы тестов
 */
export async function runTestsGroup(tests: Test[], config?: TestRunnerConfig): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  for (const test of tests) {
    if (config?.skip?.includes(test.name)) {
      console.log(`⏭️ Skipping test: ${test.name}`);
      continue;
    }
    
    if (config?.only && !config.only.includes(test.name)) {
      continue;
    }

    try {
      const result = await test.run();
      results.push(result);
    } catch (error) {
      results.push({
        name: test.name,
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  return results;
}

// Запускаем тесты, если файл вызван напрямую
if (require.main === module) {
  runScenesTests()
    .then(() => {
      console.log('');
      console.log('🏁 Тестирование завершено');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Ошибка при запуске тестов:', error);
      process.exit(1);
    });
} 