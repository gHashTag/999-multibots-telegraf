import { MyContext } from '@/interfaces';
import { createMockContext, createMockWizardContext } from '../../core/mockContext';
import { TestResult } from '../../core/types';
import { assertReplyContains, assertScene } from '../../core/assertions';
import { create as mockFunction } from '../../core/mock';
import { TestCategory } from '../../core/categories';
import { logger } from '@/utils/logger';
import * as lipSyncService from '@/services/generateLipSync';

// Мокированные функции
const mockedGenerateLipSync = mockFunction<typeof lipSyncService.generateLipSync>();

// Константы для тестирования
const TEST_USER_ID = 123456789;
const TEST_USERNAME = 'test_user';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const TEST_TOKEN = 'test_token';
const TEST_VIDEO_URL = 'https://example.com/test-video.mp4';
const TEST_AUDIO_URL = 'https://example.com/test-audio.mp3';
const TEST_BOT_USERNAME = 'test_bot';

/**
 * Настройка тестовой среды
 */
function setupTest() {
  // Настройка моков
  mockedGenerateLipSync.mockReturnValue(Promise.resolve({
    message: 'Lip sync generation in progress',
    resultUrl: 'https://example.com/result.mp4'
  }));
  
  // Сброс моков между тестами
  mockedGenerateLipSync.mockClear();
}

/**
 * Хелпер для проверки, что сцена была покинута
 */
function assertSceneLeaveHelper(ctx: any): void {
  const replies = ctx.replies || [];
  const didLeaveScene = replies.some((reply: any) => 
    reply && reply.action === 'leaveScene'
  );
  
  if (!didLeaveScene && ctx.scene && ctx.scene.leave) {
    // Проверяем, был ли вызван метод leave
    expect(ctx.scene.leave).toHaveBeenCalled();
    return;
  }
  
  if (!didLeaveScene) {
    throw new Error('Сцена не была покинута');
  }
}

/**
 * Тест для входа в сцену липсинк
 */
export async function testLipSyncWizardEnter(): Promise<TestResult> {
  try {
    setupTest();
    
    // Создаем мок-контекст
    const ctx = createMockWizardContext(0);
    ctx.from = { id: TEST_USER_ID, username: TEST_USERNAME, language_code: 'ru' } as any;
    
    // Импортируем липсинк-визард и вызываем его первый шаг
    const { lipSyncWizard } = await import('@/scenes/lipSyncWizard');
    if (typeof lipSyncWizard.steps[0] !== 'function') {
      throw new Error('Шаг 0 не является функцией');
    }
    const firstStep = lipSyncWizard.steps[0];
    await firstStep(ctx as unknown as MyContext);
    
    // Проверки
    assertReplyContains(ctx, 'Отправьте видео или URL видео');
    expect(ctx.wizard.next).toHaveBeenCalled();
    
    return {
      name: 'LipSyncWizard: Enter Scene',
      category: TestCategory.All,
      success: true,
      message: 'Тест входа в сцену липсинк успешно пройден'
    };
  } catch (error) {
    logger.error('Ошибка в тесте входа в сцену липсинк:', error);
    return {
      name: 'LipSyncWizard: Enter Scene',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Тест для отправки видео через URL
 */
export async function testLipSyncWizardVideoURL(): Promise<TestResult> {
  try {
    setupTest();
    
    // Создаем мок-контекст для второго шага
    const ctx = createMockWizardContext(1);
    ctx.from = { id: TEST_USER_ID, username: TEST_USERNAME, language_code: 'ru' } as any;
    ctx.message = { text: TEST_VIDEO_URL } as any;
    // Инициализируем сессию с нужными полями
    ctx.session = {
      balance: 0,
      isAdmin: false,
      language: 'ru',
      // Добавляем поле для хранения URL видео
      videoUrl: undefined
    } as any;
    
    // Импортируем липсинк-визард и вызываем его второй шаг
    const { lipSyncWizard } = await import('@/scenes/lipSyncWizard');
    if (typeof lipSyncWizard.steps[1] !== 'function') {
      throw new Error('Шаг 1 не является функцией');
    }
    const secondStep = lipSyncWizard.steps[1];
    await secondStep(ctx as unknown as MyContext);
    
    // Проверки (используем any для доступа к кастомным полям)
    expect((ctx.session as any).videoUrl).toBe(TEST_VIDEO_URL);
    assertReplyContains(ctx, 'Отправьте аудио, голосовое сообщение или URL аудио');
    expect(ctx.wizard.next).toHaveBeenCalled();
    
    return {
      name: 'LipSyncWizard: Process Video URL',
      category: TestCategory.All,
      success: true,
      message: 'Тест обработки URL видео успешно пройден'
    };
  } catch (error) {
    logger.error('Ошибка в тесте обработки URL видео:', error);
    return {
      name: 'LipSyncWizard: Process Video URL',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Тест для отправки видео файла
 */
export async function testLipSyncWizardVideoFile(): Promise<TestResult> {
  try {
    setupTest();
    
    // Создаем мок-контекст для второго шага
    const ctx = createMockWizardContext(1);
    ctx.from = { id: TEST_USER_ID, username: TEST_USERNAME, language_code: 'ru' } as any;
    ctx.message = { 
      video: { 
        file_id: 'test_video_file_id' 
      } 
    } as any;
    
    // Инициализируем сессию с нужными полями
    ctx.session = {
      balance: 0,
      isAdmin: false,
      language: 'ru',
      // Добавляем поле для хранения URL видео
      videoUrl: undefined
    } as any;
    
    // Мокируем getFile
    (ctx as any).telegram = {
      sendMessage: ctx.telegram.sendMessage,
      sendPhoto: ctx.telegram.sendPhoto,
      sendVideo: ctx.telegram.sendVideo,
      getFile: mockFunction().mockReturnValue(Promise.resolve({
        file_id: 'test_video_file_id',
        file_path: 'videos/test_video.mp4',
        file_size: 5 * 1024 * 1024 // 5MB, меньше максимума
      })),
      // Добавляем token в контекст для теста
      token: TEST_TOKEN
    };
    
    // Импортируем липсинк-визард и вызываем его второй шаг
    const { lipSyncWizard } = await import('@/scenes/lipSyncWizard');
    if (typeof lipSyncWizard.steps[1] !== 'function') {
      throw new Error('Шаг 1 не является функцией');
    }
    const secondStep = lipSyncWizard.steps[1];
    await secondStep(ctx as unknown as MyContext);
    
    // Проверки
    expect((ctx.telegram as any).getFile).toHaveBeenCalledWith('test_video_file_id');
    expect((ctx.session as any).videoUrl).toBe(`https://api.telegram.org/file/bot${TEST_TOKEN}/videos/test_video.mp4`);
    assertReplyContains(ctx, 'Отправьте аудио, голосовое сообщение или URL аудио');
    expect(ctx.wizard.next).toHaveBeenCalled();
    
    return {
      name: 'LipSyncWizard: Process Video File',
      category: TestCategory.All,
      success: true,
      message: 'Тест обработки видео файла успешно пройден'
    };
  } catch (error) {
    logger.error('Ошибка в тесте обработки видео файла:', error);
    return {
      name: 'LipSyncWizard: Process Video File',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Тест для отправки слишком большого видео
 */
export async function testLipSyncWizardLargeVideo(): Promise<TestResult> {
  try {
    setupTest();
    
    // Создаем мок-контекст для второго шага
    const ctx = createMockWizardContext(1);
    ctx.from = { id: TEST_USER_ID, username: TEST_USERNAME, language_code: 'ru' } as any;
    ctx.message = { 
      video: { 
        file_id: 'test_large_video_file_id' 
      } 
    } as any;
    
    // Мокируем getFile для большого файла
    (ctx as any).telegram = {
      sendMessage: ctx.telegram.sendMessage,
      sendPhoto: ctx.telegram.sendPhoto,
      sendVideo: ctx.telegram.sendVideo,
      getFile: mockFunction().mockReturnValue(Promise.resolve({
        file_id: 'test_large_video_file_id',
        file_path: 'videos/large_video.mp4',
        file_size: 60 * 1024 * 1024 // 60MB, больше максимума
      }))
    };
    
    // Импортируем липсинк-визард и вызываем его второй шаг
    const { lipSyncWizard } = await import('@/scenes/lipSyncWizard');
    if (typeof lipSyncWizard.steps[1] !== 'function') {
      throw new Error('Шаг 1 не является функцией');
    }
    const secondStep = lipSyncWizard.steps[1];
    await secondStep(ctx as unknown as MyContext);
    
    // Проверки
    assertReplyContains(ctx, 'Ошибка: видео слишком большое');
    assertSceneLeaveHelper(ctx);
    
    return {
      name: 'LipSyncWizard: Reject Large Video',
      category: TestCategory.All,
      success: true,
      message: 'Тест отклонения слишком большого видео успешно пройден'
    };
  } catch (error) {
    logger.error('Ошибка в тесте отклонения слишком большого видео:', error);
    return {
      name: 'LipSyncWizard: Reject Large Video',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Тест для отправки аудио URL и завершения процесса
 */
export async function testLipSyncWizardCompleteProcess(): Promise<TestResult> {
  try {
    setupTest();
    
    // Создаем мок-контекст для третьего шага
    const ctx = createMockWizardContext(2);
    ctx.from = { id: TEST_USER_ID, username: TEST_USERNAME, language_code: 'ru' } as any;
    ctx.message = { text: TEST_AUDIO_URL } as any;
    ctx.session = {
      balance: 0,
      isAdmin: false,
      language: 'ru',
      // Кастомные поля для теста
      videoUrl: TEST_VIDEO_URL,
      audioUrl: undefined
    } as any;
    
    // Добавляем botInfo в контекст
    (ctx as any).botInfo = { username: TEST_BOT_USERNAME } as any;
    
    // Импортируем липсинк-визард и вызываем его третий шаг
    const { lipSyncWizard } = await import('@/scenes/lipSyncWizard');
    if (typeof lipSyncWizard.steps[2] !== 'function') {
      throw new Error('Шаг 2 не является функцией');
    }
    const thirdStep = lipSyncWizard.steps[2];
    await thirdStep(ctx as unknown as MyContext);
    
    // Проверки
    expect((ctx.session as any).audioUrl).toBe(TEST_AUDIO_URL);
    expect(mockedGenerateLipSync).toHaveBeenCalledWith(
      TEST_VIDEO_URL,
      TEST_AUDIO_URL,
      TEST_USER_ID.toString(),
      TEST_BOT_USERNAME
    );
    assertReplyContains(ctx, 'Видео отправлено на обработку');
    assertSceneLeaveHelper(ctx);
    
    return {
      name: 'LipSyncWizard: Complete Process',
      category: TestCategory.All,
      success: true,
      message: 'Тест полного процесса липсинка успешно пройден'
    };
  } catch (error) {
    logger.error('Ошибка в тесте полного процесса липсинка:', error);
    return {
      name: 'LipSyncWizard: Complete Process',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Тест для обработки ошибки в generateLipSync
 */
export async function testLipSyncWizardHandleError(): Promise<TestResult> {
  try {
    setupTest();
    
    // Настраиваем мок для генерации ошибки
    mockedGenerateLipSync.mockRejectedValue(new Error('Service error'));
    
    // Создаем мок-контекст для третьего шага
    const ctx = createMockWizardContext(2);
    ctx.from = { id: TEST_USER_ID, username: TEST_USERNAME, language_code: 'ru' } as any;
    ctx.message = { text: TEST_AUDIO_URL } as any;
    ctx.session = {
      balance: 0,
      isAdmin: false,
      language: 'ru',
      // Кастомные поля для теста
      videoUrl: TEST_VIDEO_URL,
      audioUrl: undefined
    } as any;
    
    // Добавляем botInfo в контекст
    (ctx as any).botInfo = { username: TEST_BOT_USERNAME } as any;
    
    // Импортируем липсинк-визард и вызываем его третий шаг
    const { lipSyncWizard } = await import('@/scenes/lipSyncWizard');
    if (typeof lipSyncWizard.steps[2] !== 'function') {
      throw new Error('Шаг 2 не является функцией');
    }
    const thirdStep = lipSyncWizard.steps[2];
    await thirdStep(ctx as unknown as MyContext);
    
    // Проверки
    expect(mockedGenerateLipSync).toHaveBeenCalled();
    assertReplyContains(ctx, 'Произошла ошибка');
    assertSceneLeaveHelper(ctx);
    
    return {
      name: 'LipSyncWizard: Handle Error',
      category: TestCategory.All,
      success: true,
      message: 'Тест обработки ошибки в процессе липсинка успешно пройден'
    };
  } catch (error) {
    logger.error('Ошибка в тесте обработки ошибки липсинка:', error);
    return {
      name: 'LipSyncWizard: Handle Error',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Запуск всех тестов для липсинк сцены
 */
export async function runLipSyncWizardTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  try {
    results.push(await testLipSyncWizardEnter());
    results.push(await testLipSyncWizardVideoURL());
    results.push(await testLipSyncWizardVideoFile());
    results.push(await testLipSyncWizardLargeVideo());
    results.push(await testLipSyncWizardCompleteProcess());
    results.push(await testLipSyncWizardHandleError());
  } catch (error) {
    logger.error('Ошибка при запуске тестов липсинк сцены:', error);
    results.push({
      name: 'LipSyncWizard: Общая ошибка',
      category: TestCategory.All,
      success: false,
      message: String(error)
    });
  }
  
  return results;
}

export default runLipSyncWizardTests; 