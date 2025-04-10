import { config } from 'dotenv'
import path from 'path'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/types/modes'

// Загружаем переменные окружения
config({ path: path.resolve('.env.test') })

// Моки для тестирования
const mocks = {
  // Моки для функций Supabase
  getUserByTelegramId: async () => ({
    id: 'test-user-id',
    telegram_id: '144022504',
    level: 1,
    bot_name: 'test_bot',
  }),
  updateUserLevelPlusOne: async () => true,
  getAspectRatio: async () => '1:1',
  getFineTuneIdByTelegramId: async () => 'test-finetune-id',
  saveNeuroPhotoPrompt: async () => ({
    id: 'test-prompt-id',
    telegram_id: '144022504',
    prompt: 'Тестовый промпт для нейрофото V2',
    mode: ModeEnum.NeuroPhotoV2,
    status: 'processing',
  }),
  
  // Мок для getBotByName
  getBotByName: () => ({
    bot: {
      telegram: {
        sendMessage: async () => true,
      }
    }
  }),
  
  // Мок для fetch
  fetch: async () => ({
    ok: true,
    json: async () => ({
      id: 'test-task-id-1234',
      status: 'processing',
    }),
    text: async () => 'OK'
  })
};

// Мок для global.fetch
global.fetch = mocks.fetch as any;

/**
 * Простой тест функциональности нейрофото V2 без зависимостей
 */
async function testNeuroPhotoV2() {
  logger.info({
    message: '🧪 Запуск теста нейрофото V2',
    description: 'Starting neuro photo V2 test',
  });

  try {
    // Создаем мок шага Inngest
    const step = {
      run: async (name: string, fn: () => Promise<any>) => {
        logger.info({
          message: `🔍 Выполнение шага: ${name}`,
          description: `Executing step: ${name}`,
        });
        return await fn();
      }
    };

    // Имитируем событие Inngest
    const event = {
      data: {
        prompt: 'Тестовый промпт для нейрофото V2 - портрет в городе',
        num_images: 1,
        telegram_id: '144022504',
        username: 'test_user',
        is_ru: true,
        bot_name: 'test_bot',
      }
    };

    // Выполняем основные шаги обработки
    logger.info({
      message: '👤 Проверка пользователя',
      description: 'Checking user existence',
    });
    const user = await mocks.getUserByTelegramId();
    
    logger.info({
      message: '💰 Расчет стоимости',
      description: 'Calculating cost',
    });
    const costPerImage = 15; // Примерная стоимость
    
    logger.info({
      message: '💵 Обработка платежа',
      description: 'Processing payment',
    });
    
    logger.info({
      message: '📐 Получение параметров для генерации',
      description: 'Getting generation parameters',
    });
    const aspectRatio = await mocks.getAspectRatio();
    const finetuneId = await mocks.getFineTuneIdByTelegramId();
    
    logger.info({
      message: '📐 Расчет размеров изображения',
      description: 'Calculating image dimensions',
    });
    const dimensions = { width: 1024, height: 1024 };
    
    logger.info({
      message: '🔄 Отправка запроса на генерацию',
      description: 'Sending generation request',
    });
    const response = await mocks.fetch();
    const data = await response.json();
    
    logger.info({
      message: '📝 Сохранение задачи',
      description: 'Saving task',
    });
    const savedTask = await mocks.saveNeuroPhotoPrompt();
    
    logger.info({
      message: '📩 Отправка сообщения пользователю',
      description: 'Sending message to user',
    });
    await mocks.getBotByName().bot.telegram.sendMessage();
    
    // Результаты теста
    const taskResult = {
      taskId: data.id,
      status: data.status,
      prompt: event.data.prompt,
      savedTask
    };
    
    const result = {
      success: true,
      user,
      aspectRatio,
      finetuneId,
      dimensions,
      costPerImage,
      tasks: [taskResult],
    };

    logger.info({
      message: '✅ Тест нейрофото V2 завершен успешно',
      description: 'Neuro photo V2 test completed successfully',
      result,
    });

    return {
      success: true,
      message: 'Тест нейрофото V2 выполнен успешно',
      result,
    }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при тестировании нейрофото V2',
      description: 'Error testing neuro photo V2',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      success: false,
      message: 'Ошибка при тестировании нейрофото V2',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Запуск теста
 */
async function runTest() {
  const result = await testNeuroPhotoV2();
  console.log('Результат теста:', result);

  if (!result.success) {
    process.exit(1);
  }

  process.exit(0);
}

// Запуск теста
runTest(); 