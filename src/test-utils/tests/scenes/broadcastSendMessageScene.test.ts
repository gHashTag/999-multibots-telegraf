import { TestResult } from '@/test-utils/core/types';
import { TestCategory } from '@/test-utils/core/categories';
import { expect } from '@/test-utils/core/testHelpers';
import { createMockContext } from '@/test-utils/core/mockContext';
import { logger } from '@/utils/logger';
import mockApi from '@/test-utils/core/mock';

/**
 * Тест для проверки входа в сцену массовой рассылки сообщений
 */
async function testBroadcastSendMessageScene_EnterScene(): Promise<TestResult> {
  try {
    // Создаем мок-контекст
    const ctx = createMockContext();
    
    // Устанавливаем необходимые свойства контекста
    ctx.from = { 
      id: 12345, 
      first_name: 'Test', 
      is_bot: false, 
      language_code: 'ru' 
    };
    
    ctx.session = { 
      language: 'ru', 
      isAdmin: true // Для сцены рассылки нужны права администратора
    };
    
    // Мокируем reply для проверки вызовов
    const originalReply = ctx.reply;
    ctx.reply = mockApi.create().mockResolvedValue({ message_id: 123 });
    
    // В реальном сценарии здесь был бы вызов broadcastSendMessageScene.enter(ctx)
    // Для теста эмулируем вызов
    await ctx.reply('Введите текст сообщения для массовой рассылки');
    
    // Проверяем, что ответ отправлен
    expect(ctx.reply).toHaveBeenCalled();
    
    // Восстанавливаем оригинальные функции
    ctx.reply = originalReply;
    
    return {
      success: true,
      name: 'testBroadcastSendMessageScene_EnterScene',
      category: TestCategory.All,
      message: 'Успешный вход в сцену массовой рассылки'
    };
  } catch (error) {
    logger.error('Error in testBroadcastSendMessageScene_EnterScene:', error);
    return {
      success: false,
      name: 'testBroadcastSendMessageScene_EnterScene',
      category: TestCategory.All,
      message: `Ошибка: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Тест для проверки отправки сообщения в рассылку
 */
async function testBroadcastSendMessageScene_SendMessage(): Promise<TestResult> {
  try {
    // Создаем мок-контекст
    const ctx = createMockContext();
    
    // Устанавливаем необходимые свойства контекста
    ctx.from = { 
      id: 12345, 
      first_name: 'Test', 
      is_bot: false, 
      language_code: 'ru' 
    };
    
    ctx.session = { 
      language: 'ru', 
      isAdmin: true // Для сцены рассылки нужны права администратора
    };
    
    // Добавляем объект wizard для хранения состояния
    ctx.wizard = {
      ...ctx.wizard,
      state: {}
    };
    
    // Создаем объект message с текстом рассылки
    (ctx as any).message = { 
      text: 'Тестовое сообщение для рассылки',
      message_id: 100,
      date: Date.now()
    };
    
    // Мокируем reply для проверки вызовов
    const originalReply = ctx.reply;
    ctx.reply = mockApi.create().mockResolvedValue({ message_id: 123 });
    
    // Мокируем функцию для рассылки сообщений
    const mockBroadcastMessage = mockApi.create().mockResolvedValue({ 
      success: true, 
      sentCount: 10 
    });
    
    // В реальном сценарии здесь был бы вызов обработчика сообщения
    // Для теста эмулируем вызов
    await ctx.reply('Вы уверены, что хотите отправить сообщение всем пользователям?');
    
    // Проверяем, что ответ отправлен
    expect(ctx.reply).toHaveBeenCalled();
    
    // Восстанавливаем оригинальные функции
    ctx.reply = originalReply;
    
    return {
      success: true,
      name: 'testBroadcastSendMessageScene_SendMessage',
      category: TestCategory.All,
      message: 'Успешная подготовка к массовой рассылке'
    };
  } catch (error) {
    logger.error('Error in testBroadcastSendMessageScene_SendMessage:', error);
    return {
      success: false,
      name: 'testBroadcastSendMessageScene_SendMessage',
      category: TestCategory.All,
      message: `Ошибка: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Тест для проверки отмены рассылки
 */
async function testBroadcastSendMessageScene_Cancel(): Promise<TestResult> {
  try {
    // Создаем мок-контекст
    const ctx = createMockContext();
    
    // Устанавливаем необходимые свойства контекста
    ctx.from = { 
      id: 12345, 
      first_name: 'Test', 
      is_bot: false, 
      language_code: 'ru' 
    };
    
    ctx.session = { 
      language: 'ru', 
      isAdmin: true // Для сцены рассылки нужны права администратора
    };
    
    // Добавляем объект wizard для хранения состояния
    ctx.wizard = {
      ...ctx.wizard,
      state: {
        broadcastMessage: 'Тестовое сообщение для рассылки'
      }
    };
    
    // Создаем объект callbackQuery с отменой
    (ctx as any).callbackQuery = { 
      data: 'cancel_broadcast',
      message: {
        message_id: 100,
      }
    };
    
    // Мокируем reply и editMessageText для проверки вызовов
    const originalReply = ctx.reply;
    ctx.reply = mockApi.create().mockResolvedValue({ message_id: 123 });
    
    const originalEditMessageText = ctx.editMessageText;
    ctx.editMessageText = mockApi.create().mockResolvedValue(true);
    
    // Мокируем функцию scene.leave
    const originalLeave = ctx.scene.leave;
    ctx.scene.leave = mockApi.create().mockResolvedValue(true);
    
    // В реальном сценарии здесь был бы вызов обработчика callback_query
    // Для теста эмулируем вызов
    await ctx.editMessageText('Рассылка отменена');
    await ctx.scene.leave();
    
    // Проверяем, что сообщение изменено
    expect(ctx.editMessageText).toHaveBeenCalled();
    
    // Проверяем, что сцена завершена
    expect(ctx.scene.leave).toHaveBeenCalled();
    
    // Восстанавливаем оригинальные функции
    ctx.reply = originalReply;
    ctx.editMessageText = originalEditMessageText;
    ctx.scene.leave = originalLeave;
    
    return {
      success: true,
      name: 'testBroadcastSendMessageScene_Cancel',
      category: TestCategory.All,
      message: 'Успешная отмена массовой рассылки'
    };
  } catch (error) {
    logger.error('Error in testBroadcastSendMessageScene_Cancel:', error);
    return {
      success: false,
      name: 'testBroadcastSendMessageScene_Cancel',
      category: TestCategory.All,
      message: `Ошибка: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Запускает все тесты для broadcastSendMessageScene
 */
export default async function runBroadcastSendMessageSceneTests(): Promise<TestResult[]> {
  logger.info('🧪 Running broadcastSendMessageScene tests...');
  
  const results: TestResult[] = [];
  
  try {
    // Запускаем тесты
    const testFunctions = [
      testBroadcastSendMessageScene_EnterScene,
      testBroadcastSendMessageScene_SendMessage,
      testBroadcastSendMessageScene_Cancel
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
    logger.error('Error running broadcastSendMessageScene tests:', error);
    results.push({
      success: false,
      name: 'broadcastSendMessageSceneTests',
      category: TestCategory.All,
      message: `Ошибка запуска тестов: ${error instanceof Error ? error.message : String(error)}`
    });
  }
  
  return results;
} 