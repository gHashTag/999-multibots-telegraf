#!/usr/bin/env node
/**
 * Запуск тестов для телеграм-сцен
 * Улучшенная версия с поддержкой ES модулей и улучшенными типами
 */
import { loggerTest as logger } from '@/utils/logger';
import { TestResult } from './core/types';
import { TestCategory } from './core/categories';
import mockApi from './core/mock';
import * as database from '@/libs/database';
import * as supabaseModule from '@/supabase';
import { inngest } from '@/inngest-functions/clients';
import { setupTestEnvironment } from './core/setupTests';
import { safelyLoadTestFile } from './core/esmCompat';
import path from 'path';

// Имена тестовых файлов для сцен
const TEST_FILES = [
  'languageScene.test',
  'createUserScene.test',
  'textToVideoWizard.test',
  'textToImageWizard.test',
  'neuroPhotoWizard.test',
  'textToSpeechWizard.test',
  'subscriptionScene.test',
  'neuroPhotoWizardV2.test',
  'checkBalanceScene.test',
  'paymentScene.test',
  'imageToVideoWizard.test',
  'audioToTextScene.test',
  'startScene.test',
  'balanceScene.test',
  'selectModelScene.test',
  'imageToPromptWizard.test',
  'voiceAvatarWizard.test',
  'helpScene.test',
  'ideasGeneratorScene.test',  // Обратите внимание: множественное число
  'menuScene.test',
  'lipSyncWizard.test',
  'errorScene.test',
  'botStartScene.test',
  'broadcastSendMessageScene.test',
  'mergeVideoAndAudioScene.test',
  'registerScene.test',
  'autopaySuccessScene.test',
  'autopayFailureScene.test',
  'successPayLinkScene.test',
  'successPayQRScene.test',
  'joinPromoScene.test',
  'selectNeuroPhotoScene.test',
  'imageGeneratorScene.test',
  'personalCabinetScene.test',
  'selectLanguageScene.test',
  'managePromocodesScene.test',
  'showPromocodesScene.test',
  'statisticsScene.test'
];

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
 * Запускает тесты указанного модуля и добавляет результаты в массив
 * @param testName Название теста
 * @param testModule Модуль с тестами
 * @param results Массив результатов
 */
async function runTestModule(testName: string, testModule: any, results: TestResult[]): Promise<void> {
  if (!testModule) {
    results.push({
      success: false,
      name: testName,
      category: TestCategory.All,
      message: `Модуль теста не найден или не может быть загружен: ${testName}`
    });
    return;
  }
  
  // Если модуль имеет функцию runTests - вызываем ее
  if (typeof testModule.runTests === 'function') {
    try {
      const moduleResults = await testModule.runTests();
      if (Array.isArray(moduleResults)) {
        moduleResults.forEach(result => results.push(result));
      } else {
        results.push({
          success: true,
          name: testName,
          category: TestCategory.All,
          message: `Тест успешно выполнен: ${testName}`
        });
      }
    } catch (error) {
      logger.error(`Ошибка при выполнении теста ${testName}:`, error);
      results.push({
        success: false,
        name: testName,
        category: TestCategory.All,
        message: `Ошибка: ${error instanceof Error ? error.message : String(error)}`
      });
    }
    return;
  }
  
  // Если это массив тестовых функций, запускаем каждую
  if (Array.isArray(testModule)) {
    for (const test of testModule) {
      if (typeof test === 'function') {
        try {
          const result = await test();
          results.push(result);
        } catch (error) {
          logger.error(`Ошибка при выполнении теста из массива ${testName}:`, error);
          results.push({
            success: false,
            name: `${testName} (функция теста)`,
            category: TestCategory.All,
            message: `Ошибка: ${error instanceof Error ? error.message : String(error)}`
          });
        }
      }
    }
    return;
  }
  
  // Если это объект с тестовыми функциями, запускаем каждую
  const testFunctions = Object.entries(testModule)
    .filter(([key, value]) => typeof value === 'function' && key.startsWith('test'));
  
  if (testFunctions.length > 0) {
    for (const [name, func] of testFunctions) {
      try {
        const result = await (func as Function)();
        if (result) {
          results.push(result);
        }
      } catch (error) {
        logger.error(`Ошибка при выполнении функции ${name} из модуля ${testName}:`, error);
        results.push({
          success: false,
          name: name,
          category: TestCategory.All,
          message: `Ошибка: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    }
    return;
  }
  
  // Если ничего не сработало, пытаемся вызвать сам модуль как функцию
  if (typeof testModule === 'function') {
    try {
      const result = await testModule();
      if (Array.isArray(result)) {
        result.forEach(r => results.push(r));
      } else if (result) {
        results.push(result);
      }
    } catch (error) {
      logger.error(`Ошибка при вызове модуля ${testName} как функции:`, error);
      results.push({
        success: false,
        name: testName,
        category: TestCategory.All,
        message: `Ошибка: ${error instanceof Error ? error.message : String(error)}`
      });
    }
    return;
  }
  
  // Если не удалось запустить тесты ни одним способом
  results.push({
    success: false,
    name: testName,
    category: TestCategory.All,
    message: `Не удалось найти тестовые функции в модуле: ${testName}`
  });
}

/**
 * Запускает все тесты для сцен Telegram
 */
export async function runScenesTests(): Promise<TestResult[]> {
  console.log('🤖 Запуск тестов Telegram сцен (версия 2.0)...');
  logger.info('🤖 Запуск тестов Telegram сцен (версия 2.0)...');
  
  // Инициализируем тестовое окружение
  setupTestEnvironment();
  
  const results: TestResult[] = [];
  
  // Путь к директории с тестами
  const testsDir = path.resolve(__dirname, 'tests/scenes');
  
  // Загружаем и запускаем каждый тестовый модуль
  for (const testFile of TEST_FILES) {
    const testPath = path.join(testsDir, testFile);
    console.log(`\n🧪 Загрузка и запуск тестов из: ${testFile}`);
    
    try {
      // Динамически импортируем тестовый модуль с поддержкой ES модулей
      const testModule = await safelyLoadTestFile(testPath);
      
      // Запускаем тесты из модуля
      await runTestModule(testFile, testModule, results);
      
    } catch (error) {
      logger.error(`Ошибка при загрузке или выполнении тестового файла ${testFile}:`, error);
      results.push({
        success: false,
        name: testFile,
        category: TestCategory.All,
        message: `Ошибка загрузки/выполнения: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }
  
  // Выводим статистику
  console.log('\n📊 Результаты тестов:');
  
  const totalTests = results.length;
  const successTests = results.filter(r => r.success).length;
  const failedTests = totalTests - successTests;
  
  console.log(`✅ Успешно: ${successTests}`);
  console.log(`❌ Не пройдено: ${failedTests}`);
  console.log(`📝 Всего: ${totalTests}`);
  console.log(`📊 Процент успешных: ${Math.round((successTests / totalTests) * 100)}%`);
  
  // Вывод подробных результатов
  console.log('\n📋 Подробный отчет:');
  
  results.forEach(result => {
    const icon = result.success ? '✅' : '❌';
    console.log(`${icon} ${result.name}`);
    if (!result.success) {
      console.log(`   📌 ${result.message}`);
    }
  });
  
  return results;
}

// Если скрипт запущен напрямую, выполняем тесты
if (require.main === module) {
  runScenesTests()
    .then(() => {
      console.log('✨ Тесты завершены');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Ошибка при выполнении тестов:', error);
      process.exit(1);
    });
} 