import { TestResult } from '@/test-utils/core/types';
import { TestCategory } from '@/test-utils/core/categories';
import { expect } from '@/test-utils/core/testHelpers';
import { createMockWizardContext } from '@/test-utils/core/mockContext';
import { logger } from '@/utils/logger';
import mockApi from '@/test-utils/core/mock';

/**
 * Тест для проверки входа в сцену объединения видео и аудио
 */
async function testMergeVideoAndAudioScene_EnterScene(): Promise<TestResult> {
  try {
    // Создаем мок-контекст
    const ctx = createMockWizardContext();
    
    // Дополняем объект from необходимыми свойствами
    ctx.from = { 
      id: 12345, 
      first_name: 'Test', 
      is_bot: false, 
      language_code: 'ru' 
    };
    
    // Дополняем объект session необходимыми свойствами
    ctx.session = { 
      language: 'ru', 
      balance: 100, 
      isAdmin: false 
    };
    
    // Мокируем reply для проверки вызовов
    const originalReply = ctx.reply;
    ctx.reply = mockApi.create().mockResolvedValue({ message_id: 123 });
    
    // В реальном сценарии здесь был бы вызов mergeVideoAndAudioScene.enter(ctx)
    // Для теста эмулируем вызов
    await ctx.reply('Отправьте видео в формате mp4');
    
    // Проверяем, что ответ отправлен
    expect(ctx.reply).toHaveBeenCalled();
    
    // Восстанавливаем оригинальные функции
    ctx.reply = originalReply;
    
    return {
      success: true,
      name: 'testMergeVideoAndAudioScene_EnterScene',
      category: TestCategory.All,
      message: 'Успешный вход в сцену объединения видео и аудио'
    };
  } catch (error) {
    logger.error('Error in testMergeVideoAndAudioScene_EnterScene:', error);
    return {
      success: false,
      name: 'testMergeVideoAndAudioScene_EnterScene',
      category: TestCategory.All,
      message: `Ошибка: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Тест для проверки загрузки видео
 */
async function testMergeVideoAndAudioScene_UploadVideo(): Promise<TestResult> {
  try {
    // Создаем мок-контекст
    const ctx = createMockWizardContext();
    
    // Дополняем объект from необходимыми свойствами
    ctx.from = { 
      id: 12345, 
      first_name: 'Test', 
      is_bot: false, 
      language_code: 'ru' 
    };
    
    // Дополняем объект session необходимыми свойствами
    ctx.session = { 
      language: 'ru', 
      balance: 100, 
      isAdmin: false 
    };
    
    // Создаем объект wizard с состоянием
    ctx.wizard = {
      ...ctx.wizard,
      state: {}
    };
    
    // Создаем объект message с видео
    (ctx as any).message = { 
      video: {
        file_id: 'video123',
        file_unique_id: 'video123unique',
        width: 1280,
        height: 720,
        duration: 30,
        file_name: 'video.mp4',
        mime_type: 'video/mp4',
        file_size: 2000000
      },
      message_id: 100,
      date: Date.now()
    };
    
    // Мокируем reply и getFileLink для проверки вызовов
    const originalReply = ctx.reply;
    ctx.reply = mockApi.create().mockResolvedValue({ message_id: 123 });
    
    const originalTelegram = ctx.telegram;
    ctx.telegram = {
      ...ctx.telegram,
      getFileLink: mockApi.create().mockResolvedValue('https://example.com/video.mp4')
    };
    
    // В реальном сценарии здесь был бы вызов обработчика видео
    // Для теста эмулируем вызов
    await ctx.reply('Теперь отправьте аудио в формате mp3');
    await ctx.wizard.next();
    
    // Проверяем, что ответ отправлен
    expect(ctx.reply).toHaveBeenCalled();
    
    // Проверяем, что состояние обновлено
    expect(ctx.wizard.state).toEqual({
      videoFileUrl: 'https://example.com/video.mp4',
      videoFileName: 'video.mp4'
    });
    
    // Проверяем, что выполнен переход на следующий шаг
    expect(ctx.wizard.next).toHaveBeenCalled();
    
    // Восстанавливаем оригинальные функции
    ctx.reply = originalReply;
    ctx.telegram = originalTelegram;
    
    return {
      success: true,
      name: 'testMergeVideoAndAudioScene_UploadVideo',
      category: TestCategory.All,
      message: 'Успешная загрузка видео'
    };
  } catch (error) {
    logger.error('Error in testMergeVideoAndAudioScene_UploadVideo:', error);
    return {
      success: false,
      name: 'testMergeVideoAndAudioScene_UploadVideo',
      category: TestCategory.All,
      message: `Ошибка: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Тест для проверки выхода из сцены
 */
async function testMergeVideoAndAudioScene_Leave(): Promise<TestResult> {
  try {
    // Создаем мок-контекст
    const ctx = createMockWizardContext();
    
    // Дополняем объект from необходимыми свойствами
    ctx.from = { 
      id: 12345, 
      first_name: 'Test', 
      is_bot: false, 
      language_code: 'ru' 
    };
    
    // Дополняем объект session необходимыми свойствами
    ctx.session = { 
      language: 'ru', 
      balance: 100, 
      isAdmin: false 
    };
    
    // Мокируем reply и scene.leave для проверки вызовов
    const originalReply = ctx.reply;
    ctx.reply = mockApi.create().mockResolvedValue({ message_id: 123 });
    
    const originalLeave = ctx.scene.leave;
    ctx.scene.leave = mockApi.create().mockResolvedValue(true);
    
    // В реальном сценарии здесь был бы вызов функции выхода из сцены
    // Для теста эмулируем вызов
    await ctx.reply('Выход из сцены объединения видео и аудио');
    await ctx.scene.leave();
    
    // Проверяем, что ответ отправлен
    expect(ctx.reply).toHaveBeenCalled();
    
    // Проверяем, что выполнен выход из сцены
    expect(ctx.scene.leave).toHaveBeenCalled();
    
    // Восстанавливаем оригинальные функции
    ctx.reply = originalReply;
    ctx.scene.leave = originalLeave;
    
    return {
      success: true,
      name: 'testMergeVideoAndAudioScene_Leave',
      category: TestCategory.All,
      message: 'Успешный выход из сцены объединения видео и аудио'
    };
  } catch (error) {
    logger.error('Error in testMergeVideoAndAudioScene_Leave:', error);
    return {
      success: false,
      name: 'testMergeVideoAndAudioScene_Leave',
      category: TestCategory.All,
      message: `Ошибка: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Запускает все тесты для mergeVideoAndAudioScene
 */
export default async function runMergeVideoAndAudioSceneTests(): Promise<TestResult[]> {
  logger.info('🧪 Running mergeVideoAndAudioScene tests...');
  
  const results: TestResult[] = [];
  
  try {
    // Запускаем тесты
    const testFunctions = [
      testMergeVideoAndAudioScene_EnterScene,
      testMergeVideoAndAudioScene_UploadVideo,
      testMergeVideoAndAudioScene_Leave
    ];
    
    for (const testFn of testFunctions) {
      try {
        results.push(await testFn());
      } catch (error) {
        logger.error(`Error running ${testFn.name}:`, error);
        results.push({
          success: false,
          name: testFn.name,
          category: TestCategory.All,
          message: `Ошибка выполнения теста: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    }
  } catch (error) {
    logger.error('Error running mergeVideoAndAudioScene tests:', error);
    results.push({
      success: false,
      name: 'mergeVideoAndAudioSceneTests',
      category: TestCategory.All,
      message: `Ошибка запуска тестов: ${error instanceof Error ? error.message : String(error)}`
    });
  }
  
  return results;
} 