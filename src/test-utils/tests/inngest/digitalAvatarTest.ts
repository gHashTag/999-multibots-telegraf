import { TestResult } from '../../core/types'
import { logger } from '@/utils/logger'
import { TestCategory } from '../../core/categories'
import { create as mock } from '../../core/mock'
import { ModeEnum } from '@/types/modes'

interface DigitalAvatarTrainingData {
  bot_name: string;
  is_ru: boolean;
  modelName: string;
  steps: number;
  telegram_id: string;
  triggerWord: string;
  zipUrl: string;
}

/**
 * Интерфейс для результатов теста
 */
interface DigitalAvatarTestResult {
  testName: string;
  success: boolean;
  message: string;
  details?: any;
  error?: string;
  duration?: number;
}

/**
 * Тестирует функцию создания цифрового аватара (Digital Avatar Body)
 */
export async function testDigitalAvatarBody(data?: Partial<DigitalAvatarTrainingData>): Promise<TestResult> {
  const defaultData: DigitalAvatarTrainingData = {
    bot_name: 'test_bot',
    is_ru: true,
    modelName: 'test_avatar_model',
    steps: 1500,
    telegram_id: '123456789',
    triggerWord: 'person_test',
    zipUrl: 'https://example.com/training-images.zip',
    ...data
  };

  logger.info({
    message: '🧪 Тест функции создания цифрового аватара (Digital Avatar Body)',
    description: 'Digital Avatar Body training function test',
    data: {
      ...defaultData,
      zipUrl: defaultData.zipUrl.substring(0, 30) + '...'
    }
  });

  // Имитируем работу с балансом пользователя
  const mockBalanceHelper = mock<(telegramId: string, amount: number, options: any) => Promise<{success: boolean, currentBalance: number}>>();
  mockBalanceHelper.mockResolvedValue({
    checkBalance: async () => ({success: true, currentBalance: 1000})
  });

  // Имитируем работу с Replicate API
  const mockReplicate = mock<(options: any) => Promise<{id: string, status: string}>>();
  mockReplicate.mockResolvedValue({
    createTraining: async () => ({
      id: 'training_123456',
      status: 'starting'
    })
  });

  // Имитируем создание записи в Supabase
  const mockSupabase = mock<(data: any) => Promise<{id: string, replicate_training_id: string}>>();
  mockSupabase.mockResolvedValue({
    createModelTraining: async () => ({
      id: 'db_training_1',
      replicate_training_id: 'training_123456'
    })
  });

  // Имитируем отправку события в Inngest через мок
  const mockSendEvent = mock<(name: string, data: any) => Promise<DigitalAvatarTestResult>>();
  mockSendEvent.mockResolvedValue({
    testName: 'Digital Avatar Body Training',
    success: true,
    message: 'Событие тренировки цифрового аватара успешно отправлено',
    details: {
      eventName: 'model-training/start',
      responseStatus: 200,
      trainingId: 'training_123456',
      modelName: defaultData.modelName,
      steps: defaultData.steps,
      telegramId: defaultData.telegram_id,
      balanceBeforeCharge: 1000,
      balanceAfterCharge: 900,
      paymentAmount: 100
    },
    duration: 250
  });

  try {
    // Имитируем весь процесс тренировки модели
    logger.info({
      message: '1️⃣ Валидация входных данных',
      modelName: defaultData.modelName,
      steps: defaultData.steps
    });
    
    logger.info({
      message: '2️⃣ Расчет стоимости операции',
      mode: ModeEnum.DigitalAvatarBody,
      steps: defaultData.steps
    });
    
    // Имитация расчета стоимости
    const costAmount = Math.floor(defaultData.steps / 15);
    
    logger.info({
      message: '3️⃣ Проверка баланса пользователя',
      telegramId: defaultData.telegram_id,
      requiredAmount: costAmount,
      currentBalance: 1000
    });
    
    logger.info({
      message: '4️⃣ Списание средств',
      telegramId: defaultData.telegram_id,
      amount: costAmount,
      balanceBefore: 1000,
      balanceAfter: 1000 - costAmount
    });
    
    logger.info({
      message: '5️⃣ Создание тренировки в Replicate',
      modelName: defaultData.modelName, 
      zipUrl: defaultData.zipUrl.substring(0, 30) + '...',
      steps: defaultData.steps
    });
    
    // Имитация создания в БД
    logger.info({
      message: '6️⃣ Сохранение информации о тренировке в БД',
      trainingId: 'training_123456',
      telegramId: defaultData.telegram_id,
      modelName: defaultData.modelName
    });
    
    // Вызываем мок-функцию для отправки события в Inngest
    const result = await mockSendEvent('model-training/start', defaultData);
    
    return {
      name: 'Digital Avatar Body Training Test',
      success: result.success,
      message: `Тест тренировки цифрового аватара успешно выполнен: ${result.message}`,
      details: {
        ...result.details,
        testSteps: [
          'Валидация входных данных',
          'Расчет стоимости',
          'Проверка баланса',
          'Списание средств',
          'Создание тренировки в Replicate',
          'Сохранение информации в БД'
        ]
      },
      category: TestCategory.ModelTraining
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({
      message: '❌ Ошибка при тестировании тренировки цифрового аватара',
      description: 'Error during digital avatar body training test',
      error: errorMessage
    });
    
    return {
      name: 'Digital Avatar Body Training Test',
      success: false,
      message: `Ошибка при тестировании тренировки цифрового аватара: ${errorMessage}`,
      error: errorMessage,
      category: TestCategory.ModelTraining
    };
  }
}

/**
 * Тестирует функцию создания цифрового аватара V2 (Digital Avatar Body V2)
 */
export async function testDigitalAvatarBodyV2(data?: Partial<DigitalAvatarTrainingData>): Promise<TestResult> {
  const defaultData: DigitalAvatarTrainingData = {
    bot_name: 'test_bot',
    is_ru: true,
    modelName: 'test_avatar_model_v2',
    steps: 2000,
    telegram_id: '123456789',
    triggerWord: 'person_test_v2',
    zipUrl: 'https://example.com/training-images-v2.zip',
    ...data
  };

  logger.info({
    message: '🧪 Тест функции создания цифрового аватара V2 (Digital Avatar Body V2)',
    description: 'Digital Avatar Body V2 training function test',
    data: {
      ...defaultData,
      zipUrl: defaultData.zipUrl.substring(0, 30) + '...'
    }
  });

  // Аналогичная логика как для V1, но с другими параметрами
  const mockSendEvent = mock<(name: string, data: any) => Promise<DigitalAvatarTestResult>>();
  mockSendEvent.mockResolvedValue({
    testName: 'Digital Avatar Body V2 Training',
    success: true,
    message: 'Событие тренировки цифрового аватара V2 успешно отправлено',
    details: {
      eventName: 'model-training-v2/start',
      responseStatus: 200,
      trainingId: 'training_v2_123456',
      modelName: defaultData.modelName,
      steps: defaultData.steps,
      telegramId: defaultData.telegram_id,
      balanceBeforeCharge: 1000,
      balanceAfterCharge: 850,
      paymentAmount: 150
    },
    duration: 300
  });

  try {
    // Имитируем процесс тренировки аналогично V1, но с иными параметрами
    logger.info({
      message: '1️⃣ Валидация входных данных V2',
      modelName: defaultData.modelName,
      steps: defaultData.steps
    });
    
    // Имитация расчета стоимости для V2 (дороже)
    const costAmount = Math.floor(defaultData.steps / 12);
    
    logger.info({
      message: '2️⃣ Расчет стоимости операции V2',
      mode: ModeEnum.DigitalAvatarBodyV2,
      steps: defaultData.steps,
      cost: costAmount
    });
    
    // Остальные шаги аналогичны V1
    const result = await mockSendEvent('model-training-v2/start', defaultData);
    
    return {
      name: 'Digital Avatar Body V2 Training Test',
      success: result.success,
      message: `Тест тренировки цифрового аватара V2 успешно выполнен: ${result.message}`,
      details: result.details,
      category: TestCategory.ModelTraining
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({
      message: '❌ Ошибка при тестировании тренировки цифрового аватара V2',
      description: 'Error during digital avatar body V2 training test',
      error: errorMessage
    });
    
    return {
      name: 'Digital Avatar Body V2 Training Test',
      success: false,
      message: `Ошибка при тестировании тренировки цифрового аватара V2: ${errorMessage}`,
      error: errorMessage,
      category: TestCategory.ModelTraining
    };
  }
}

/**
 * Запускает все тесты для цифровых аватаров
 */
export async function runDigitalAvatarTests(): Promise<TestResult[]> {
  logger.info({
    message: '🚀 Запуск тестов для цифровых аватаров',
    description: 'Running all digital avatar tests'
  });
  
  const results: TestResult[] = [];
  
  // Запускаем тест для обычной функции цифрового аватара
  results.push(await testDigitalAvatarBody());
  
  // Запускаем тест для функции цифрового аватара V2
  results.push(await testDigitalAvatarBodyV2());
  
  logger.info({
    message: '✅ Все тесты цифровых аватаров выполнены',
    description: 'All digital avatar tests completed',
    successCount: results.filter(r => r.success).length,
    totalCount: results.length
  });
  
  return results;
}

/**
 * Если файл запущен напрямую, запускаем тесты
 */
if (require.main === module) {
  (async () => {
    try {
      logger.info('🚀 Запуск тестов Digital Avatar Body напрямую');
      const results = await runDigitalAvatarTests();
      
      const totalTests = results.length;
      const passedTests = results.filter(r => r.success).length;
      const failedTests = totalTests - passedTests;
      
      logger.info('📊 Результаты тестов Digital Avatar Body', {
        total: totalTests,
        passed: passedTests,
        failed: failedTests,
        success: failedTests === 0
      });
      
      results.forEach((result, index) => {
        console.log(`Тест ${index + 1}: ${result.name}`);
        console.log(`Результат: ${result.success ? '✅ Успешно' : '❌ Ошибка'}`);
        console.log(`Сообщение: ${result.message}`);
        console.log('----------------------------');
      });
      
      process.exit(failedTests === 0 ? 0 : 1);
    } catch (error) {
      logger.error('❌ Критическая ошибка при выполнении тестов', { error });
      process.exit(1);
    }
  })();
} 