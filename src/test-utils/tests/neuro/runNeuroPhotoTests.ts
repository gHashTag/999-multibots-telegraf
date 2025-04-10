import { config } from 'dotenv';
import path from 'path';
import { logger } from '@/utils/logger';
import { exec } from 'child_process';
import { promisify } from 'util';

// Превращаем колбэк-функцию exec в функцию, возвращающую Promise
const execAsync = promisify(exec);

// Загружаем переменные окружения
config({ path: path.resolve('.env.test') });

/**
 * Запускает тест и возвращает результат
 */
async function runTest(testPath: string, name: string): Promise<{
  success: boolean;
  output: string;
  error?: string;
}> {
  try {
    logger.info({
      message: `🚀 Запуск теста ${name}`,
      description: `Running ${name} test`,
      testPath,
    });

    const { stdout, stderr } = await execAsync(
      `npx ts-node -r tsconfig-paths/register ${testPath}`
    );

    if (stderr) {
      logger.warn({
        message: `⚠️ Тест ${name} завершился с предупреждениями`,
        description: `${name} test completed with warnings`,
        warnings: stderr,
      });
    }

    logger.info({
      message: `✅ Тест ${name} завершен успешно`,
      description: `${name} test completed successfully`,
    });

    return {
      success: true,
      output: stdout,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error({
      message: `❌ Ошибка при запуске теста ${name}`,
      description: `Error running ${name} test`,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Безопасно извлекаем stdout из ошибки
    let stdout = '';
    try {
      // @ts-ignore - Обойдем проверку типов здесь
      if (error && typeof error === 'object' && error.stdout) {
        // @ts-ignore
        stdout = error.stdout;
      }
    } catch (e) {
      // Игнорируем любые ошибки при извлечении stdout
    }

    return {
      success: false,
      output: stdout,
      error: errorMessage,
    };
  }
}

/**
 * Запускает все тесты нейрофото
 */
async function runAllTests() {
  const testResults: { [key: string]: { success: boolean; output: string; error?: string } } = {};
  
  // Запускаем тест нейрофото
  testResults['neuroPhoto'] = await runTest(
    'test-utils/neuroPhotoTest.ts',
    'НейроФото'
  );
  
  // Запускаем тест нейрофото V2
  testResults['neuroPhotoV2'] = await runTest(
    'test-utils/neuroPhotoV2Test.ts',
    'НейроФото V2'
  );
  
  // Подводим итоги
  const allSuccess = Object.values(testResults).every((result) => result.success);
  
  logger.info({
    message: '📊 Результаты всех тестов',
    description: 'Results of all tests',
    allSuccess,
    individualResults: Object.keys(testResults).map((testName) => ({
      test: testName,
      success: testResults[testName].success,
      hasError: !!testResults[testName].error,
    })),
  });
  
  // Выводим подробный отчет
  console.log('\n======== РЕЗУЛЬТАТЫ ТЕСТОВ ========\n');
  
  for (const [testName, result] of Object.entries(testResults)) {
    console.log(`Тест: ${testName}`);
    console.log(`Статус: ${result.success ? '✅ УСПЕШНО' : '❌ ОШИБКА'}`);
    
    if (result.error) {
      console.log(`Ошибка: ${result.error}`);
    }
    
    console.log('\n-----------------------------------\n');
  }
  
  console.log(`Общий результат: ${allSuccess ? '✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ' : '❌ ЕСТЬ ОШИБКИ'}\n`);
  
  // Завершаем процесс с соответствующим кодом
  process.exit(allSuccess ? 0 : 1);
}

// Запускаем все тесты
runAllTests(); 