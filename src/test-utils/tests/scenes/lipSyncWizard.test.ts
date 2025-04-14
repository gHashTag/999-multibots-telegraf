import { Scenes } from 'telegraf';
import { Message, Update } from 'telegraf/typings/core/types/typegram';
import { TestCategory, TestResult } from '../../core/types';
import { MyContext } from '../../../interfaces';
import { createMockContext } from '../../core/mockContext';
import { mockFn, mockObject } from '../../core/mockFunction';
import lipSyncWizard from '../../../scenes/lipSyncWizard';
import * as generateLipSyncModule from '../../../services/generateLipSync';
import { logError, logInfo } from '../../utils/logger';
import { MockFunction } from '../../types/mockFunction';
import { testReport } from '../../helpers';

// Определяем типы для моков
type MockFunction<T = any> = jest.MockedFunction<T> & {
  mockClear: () => void;
  mockReset: () => void;
  mockRestore: () => void;
  mockReturnValue: (val: any) => MockFunction<T>;
  mockResolvedValue: (val: any) => MockFunction<T>;
  mockRejectedValue: (val: any) => MockFunction<T>;
};

// Функция для создания мока
function createMockFunction<T>(): MockFunction<T> {
  return jest.fn() as MockFunction<T>;
}

// Функция для создания мок-контекста
function createMockContext<T extends MyContext>(overrides: Partial<T> = {}): T {
  const defaultContext = {
    scene: {
      enter: jest.fn(),
      reenter: jest.fn(),
      leave: jest.fn(),
      state: {}
    },
    reply: jest.fn(),
    session: {},
    ...overrides
  } as unknown as T;
  
  return defaultContext;
}

// Константы для тестирования
const TEST_USER_ID = 12345;
const TEST_TOKEN = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
const TEST_VIDEO_URL = 'https://example.com/video.mp4';
const TEST_AUDIO_URL = 'https://example.com/audio.mp3';
const TEST_VIDEO_FILE_ID = 'video_file_id';
const TEST_AUDIO_FILE_ID = 'audio_file_id';
const TEST_VOICE_FILE_ID = 'voice_file_id';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const TEST_FILE_PATH = 'test/path/file.mp4';

// Определение типов для мокирования
interface TestContext extends MyContext {
  scene: {
    enter: MockFunction;
    leave: MockFunction;
    reenter: MockFunction;
  };
  telegram: {
    getFile: MockFunction;
    token: string;
  };
  wizard: {
    next: MockFunction;
    selectStep: MockFunction;
    state: Record<string, any>;
    cursor: number;
  };
  session: {
    videoUrl?: string;
    audioUrl?: string;
    [key: string]: any;
  };
  from?: {
    id: number;
    language_code?: string;
  };
  botInfo?: {
    username: string;
  };
  message?: any;
  reply: MockFunction;
  mockGenerateLipSync: MockFunction;
}

// Вспомогательная функция для создания контекста с моками
function setupContext(params: {
  language?: string;
  messageType?: 'text' | 'video' | 'audio' | 'voice';
  hasVideoFile?: boolean;
  hasAudioFile?: boolean;
  hasVoiceFile?: boolean;
  fileSize?: number;
  filePath?: string;
  step?: number;
  videoUrl?: string;
  audioUrl?: string;
}): TestContext {
  const { 
    language = 'ru',
    messageType = 'text',
    hasVideoFile = false,
    hasAudioFile = false,
    hasVoiceFile = false,
    fileSize = 1024,
    filePath = TEST_FILE_PATH,
    step = 0,
    videoUrl,
    audioUrl
  } = params;

  // Создаем базовые моки
  const generateLipSyncMock = createMockFunction<typeof import('../../../services/generateLipSync').generateLipSync>();
  generateLipSyncMock.mockResolvedValue(undefined);

  // Создаем контекст
  const ctx = createMockContext<TestContext>({
    from: { id: TEST_USER_ID, language_code: language },
    botInfo: { username: 'test_bot' } as any,
    session: {}
  });

  // Настраиваем сообщение в зависимости от типа
  if (messageType === 'text') {
    ctx.message = { 
      text: hasVideoFile ? TEST_VIDEO_URL : (hasAudioFile ? TEST_AUDIO_URL : 'some text') 
    };
  } else if (messageType === 'video' && hasVideoFile) {
    ctx.message = { 
      video: { file_id: TEST_VIDEO_FILE_ID, file_size: fileSize } 
    };
  } else if (messageType === 'audio' && hasAudioFile) {
    ctx.message = { 
      audio: { file_id: TEST_AUDIO_FILE_ID, file_size: fileSize } 
    };
  } else if (messageType === 'voice' && hasVoiceFile) {
    ctx.message = { 
      voice: { file_id: TEST_VOICE_FILE_ID, file_size: fileSize } 
    };
  }

  // Настраиваем Telegram методы
  ctx.telegram = {
    getFile: createMockFunction().mockResolvedValue({ 
      file_id: 'file_id', 
      file_size: fileSize, 
      file_path: filePath 
    }),
    token: TEST_TOKEN
  } as any;

  // Настраиваем wizard методы
  ctx.wizard = {
    next: createMockFunction().mockReturnValue(step + 1),
    selectStep: createMockFunction(),
    state: {},
    cursor: step
  } as any;

  // Устанавливаем URL для видео и аудио если они предоставлены
  if (videoUrl) {
    ctx.session.videoUrl = videoUrl;
  }
  
  if (audioUrl) {
    ctx.session.audioUrl = audioUrl;
  }

  // Добавляем мок для generateLipSync
  ctx.mockGenerateLipSync = generateLipSyncMock;

  // Переопределение зависимостей
  jest.mock('../../../services/generateLipSync', () => ({
    generateLipSync: generateLipSyncMock
  }));

  return ctx;
}

// Вспомогательная функция для вызова обработчика
async function invokeHandler(ctx: TestContext, step: number): Promise<void> {
  if (!lipSyncWizard || !(lipSyncWizard instanceof Scenes.WizardScene)) {
    throw new Error('lipSyncWizard не является WizardScene');
  }
  
  const steps = (lipSyncWizard as any).steps;
  if (!Array.isArray(steps) || steps.length <= step) {
    throw new Error(`Шаг ${step} не существует в липсинк сцене`);
  }
  
  const handler = steps[step];
  await handler(ctx);
}

/**
 * Тестирование первого шага липсинк мастера (русский язык)
 */
async function testLipSyncWizard_FirstStep() {
  const TEST_NAME = 'testLipSyncWizard_FirstStep';
  const CATEGORY = 'lipSyncWizard';
  
  logInfo(`🔄 Запуск теста: ${TEST_NAME}`);
  
  try {
    // Arrange
    const ctx = setupContext({ language: 'ru', step: 0 });
    
    // Act
    await invokeHandler(ctx, 0);
    
    // Assert
    // Проверяем, что отправлено правильное сообщение
    expect(ctx.reply).toHaveBeenCalledWith(
      'Отправьте видео или URL видео',
      { reply_markup: { remove_keyboard: true } }
    );
    
    // Проверяем, что wizard.next был вызван для перехода к следующему шагу
    expect(ctx.wizard.next).toHaveBeenCalled();
    
    logInfo(`✅ Тест прошел успешно: ${TEST_NAME}`);
    return { testName: TEST_NAME, category: CATEGORY, success: true, message: 'Первый шаг липсинк мастера успешно обрабатывает запрос на русском языке' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError(`❌ Тест провален: ${TEST_NAME}`, error);
    return { testName: TEST_NAME, category: CATEGORY, success: false, message: `Ошибка: ${errorMessage}` };
  }
}

/**
 * Тестирование первого шага липсинк мастера (английский язык)
 */
async function testLipSyncWizard_FirstStepEnglish() {
  const TEST_NAME = 'testLipSyncWizard_FirstStepEnglish';
  const CATEGORY = 'lipSyncWizard';
  
  logInfo(`🔄 Запуск теста: ${TEST_NAME}`);
  
  try {
    // Arrange
    const ctx = setupContext({ language: 'en', step: 0 });
    
    // Act
    await invokeHandler(ctx, 0);
    
    // Assert
    // Проверяем, что отправлено правильное сообщение на английском
    expect(ctx.reply).toHaveBeenCalledWith(
      'Send a video or video URL',
      { reply_markup: { remove_keyboard: true } }
    );
    
    // Проверяем, что wizard.next был вызван для перехода к следующему шагу
    expect(ctx.wizard.next).toHaveBeenCalled();
    
    logInfo(`✅ Тест прошел успешно: ${TEST_NAME}`);
    return { testName: TEST_NAME, category: CATEGORY, success: true, message: 'Первый шаг липсинк мастера успешно обрабатывает запрос на английском языке' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError(`❌ Тест провален: ${TEST_NAME}`, error);
    return { testName: TEST_NAME, category: CATEGORY, success: false, message: `Ошибка: ${errorMessage}` };
  }
}

/**
 * Тестирование второго шага с URL видео (русский язык)
 */
async function testLipSyncWizard_SecondStepWithUrl() {
  const TEST_NAME = 'testLipSyncWizard_SecondStepWithUrl';
  const CATEGORY = 'lipSyncWizard';
  
  logInfo(`🔄 Запуск теста: ${TEST_NAME}`);
  
  try {
    // Arrange
    const ctx = setupContext({ 
      language: 'ru', 
      step: 1, 
      messageType: 'text', 
      hasVideoFile: true 
    });
    
    // Act
    await invokeHandler(ctx, 1);
    
    // Assert
    // Проверяем, что видео URL сохранен в сессии
    expect(ctx.session.videoUrl).toBe(TEST_VIDEO_URL);
    
    // Проверяем, что было отправлено правильное сообщение для запроса аудио
    expect(ctx.reply).toHaveBeenCalledWith(
      'Отправьте аудио, голосовое сообщение или URL аудио'
    );
    
    // Проверяем, что wizard.next был вызван для перехода к следующему шагу
    expect(ctx.wizard.next).toHaveBeenCalled();
    
    logInfo(`✅ Тест прошел успешно: ${TEST_NAME}`);
    return { testName: TEST_NAME, category: CATEGORY, success: true, message: 'Второй шаг липсинк мастера успешно обрабатывает URL видео' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError(`❌ Тест провален: ${TEST_NAME}`, error);
    return { testName: TEST_NAME, category: CATEGORY, success: false, message: `Ошибка: ${errorMessage}` };
  }
}

/**
 * Тестирование второго шага с файлом видео (русский язык)
 */
async function testLipSyncWizard_SecondStepWithVideoFile() {
  const TEST_NAME = 'testLipSyncWizard_SecondStepWithVideoFile';
  const CATEGORY = 'lipSyncWizard';
  
  logInfo(`🔄 Запуск теста: ${TEST_NAME}`);
  
  try {
    // Arrange
    const ctx = setupContext({ 
      language: 'ru', 
      step: 1, 
      messageType: 'video', 
      hasVideoFile: true 
    });
    
    // Act
    await invokeHandler(ctx, 1);
    
    // Assert
    // Проверяем, что getFile был вызван с правильным ID
    expect(ctx.telegram.getFile).toHaveBeenCalledWith(TEST_VIDEO_FILE_ID);
    
    // Проверяем, что URL видео был сохранен в правильном формате
    expect(ctx.session.videoUrl).toBe(`https://api.telegram.org/file/bot${TEST_TOKEN}/${TEST_FILE_PATH}`);
    
    // Проверяем, что было отправлено правильное сообщение для запроса аудио
    expect(ctx.reply).toHaveBeenCalledWith(
      'Отправьте аудио, голосовое сообщение или URL аудио'
    );
    
    // Проверяем, что wizard.next был вызван для перехода к следующему шагу
    expect(ctx.wizard.next).toHaveBeenCalled();
    
    logInfo(`✅ Тест прошел успешно: ${TEST_NAME}`);
    return { testName: TEST_NAME, category: CATEGORY, success: true, message: 'Второй шаг липсинк мастера успешно обрабатывает файл видео' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError(`❌ Тест провален: ${TEST_NAME}`, error);
    return { testName: TEST_NAME, category: CATEGORY, success: false, message: `Ошибка: ${errorMessage}` };
  }
}

/**
 * Тестирование обработки слишком большого видео файла
 */
async function testLipSyncWizard_TooLargeVideoFile() {
  const TEST_NAME = 'testLipSyncWizard_TooLargeVideoFile';
  const CATEGORY = 'lipSyncWizard';
  
  logInfo(`🔄 Запуск теста: ${TEST_NAME}`);
  
  try {
    // Arrange
    const ctx = setupContext({ 
      language: 'ru', 
      step: 1, 
      messageType: 'video', 
      hasVideoFile: true,
      fileSize: MAX_FILE_SIZE + 1024 // Превышаем максимальный размер
    });
    
    // Act
    await invokeHandler(ctx, 1);
    
    // Assert
    // Проверяем, что getFile был вызван с правильным ID
    expect(ctx.telegram.getFile).toHaveBeenCalledWith(TEST_VIDEO_FILE_ID);
    
    // Проверяем, что было отправлено сообщение об ошибке
    expect(ctx.reply).toHaveBeenCalledWith(
      'Ошибка: видео слишком большое. Максимальный размер: 50MB'
    );
    
    // Проверяем, что scene.leave был вызван для выхода из сцены
    expect(ctx.scene.leave).toHaveBeenCalled();
    
    logInfo(`✅ Тест прошел успешно: ${TEST_NAME}`);
    return { testName: TEST_NAME, category: CATEGORY, success: true, message: 'Второй шаг липсинк мастера корректно обрабатывает слишком большие видео файлы' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError(`❌ Тест провален: ${TEST_NAME}`, error);
    return { testName: TEST_NAME, category: CATEGORY, success: false, message: `Ошибка: ${errorMessage}` };
  }
}

/**
 * Тестирование обработки отсутствия видео
 */
async function testLipSyncWizard_NoVideo() {
  const TEST_NAME = 'testLipSyncWizard_NoVideo';
  const CATEGORY = 'lipSyncWizard';
  
  logInfo(`🔄 Запуск теста: ${TEST_NAME}`);
  
  try {
    // Arrange
    const ctx = setupContext({ 
      language: 'ru', 
      step: 1, 
      messageType: 'text', 
      hasVideoFile: false // Без видео URL
    });
    
    // Устанавливаем пустое сообщение
    ctx.message = { text: '' };
    
    // Act
    await invokeHandler(ctx, 1);
    
    // Assert
    // Проверяем, что было отправлено сообщение об ошибке
    expect(ctx.reply).toHaveBeenCalledWith(
      'Ошибка: видео не предоставлено'
    );
    
    // Проверяем, что scene.leave был вызван для выхода из сцены
    expect(ctx.scene.leave).toHaveBeenCalled();
    
    logInfo(`✅ Тест прошел успешно: ${TEST_NAME}`);
    return { testName: TEST_NAME, category: CATEGORY, success: true, message: 'Второй шаг липсинк мастера корректно обрабатывает отсутствие видео' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError(`❌ Тест провален: ${TEST_NAME}`, error);
    return { testName: TEST_NAME, category: CATEGORY, success: false, message: `Ошибка: ${errorMessage}` };
  }
}

/**
 * Тестирование третьего шага с URL аудио
 */
async function testLipSyncWizard_ThirdStepWithUrl() {
  const TEST_NAME = 'testLipSyncWizard_ThirdStepWithUrl';
  const CATEGORY = 'lipSyncWizard';
  
  logInfo(`🔄 Запуск теста: ${TEST_NAME}`);
  
  try {
    // Arrange
    const ctx = setupContext({ 
      language: 'ru', 
      step: 2, 
      messageType: 'text', 
      hasAudioFile: true,
      videoUrl: TEST_VIDEO_URL // Устанавливаем URL видео из предыдущего шага
    });
    
    // Act
    await invokeHandler(ctx, 2);
    
    // Assert
    // Проверяем, что аудио URL сохранен в сессии
    expect(ctx.session.audioUrl).toBe(TEST_AUDIO_URL);
    
    // Проверяем, что generateLipSync был вызван с правильными параметрами
    expect(ctx.mockGenerateLipSync).toHaveBeenCalledWith(
      TEST_VIDEO_URL,
      TEST_AUDIO_URL,
      TEST_USER_ID.toString(),
      'test_bot'
    );
    
    // Проверяем, что было отправлено правильное сообщение об успешной отправке
    expect(ctx.reply).toHaveBeenCalledWith(
      '🎥 Видео отправлено на обработку. Ждите результата'
    );
    
    // Проверяем, что scene.leave был вызван для выхода из сцены
    expect(ctx.scene.leave).toHaveBeenCalled();
    
    logInfo(`✅ Тест прошел успешно: ${TEST_NAME}`);
    return { testName: TEST_NAME, category: CATEGORY, success: true, message: 'Третий шаг липсинк мастера успешно обрабатывает URL аудио' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError(`❌ Тест провален: ${TEST_NAME}`, error);
    return { testName: TEST_NAME, category: CATEGORY, success: false, message: `Ошибка: ${errorMessage}` };
  }
}

/**
 * Тестирование третьего шага с файлом аудио
 */
async function testLipSyncWizard_ThirdStepWithAudioFile() {
  const TEST_NAME = 'testLipSyncWizard_ThirdStepWithAudioFile';
  const CATEGORY = 'lipSyncWizard';
  
  logInfo(`🔄 Запуск теста: ${TEST_NAME}`);
  
  try {
    // Arrange
    const ctx = setupContext({ 
      language: 'ru', 
      step: 2, 
      messageType: 'audio', 
      hasAudioFile: true,
      videoUrl: TEST_VIDEO_URL // Устанавливаем URL видео из предыдущего шага
    });
    
    // Act
    await invokeHandler(ctx, 2);
    
    // Assert
    // Проверяем, что getFile был вызван с правильным ID
    expect(ctx.telegram.getFile).toHaveBeenCalledWith(TEST_AUDIO_FILE_ID);
    
    // Проверяем, что URL аудио был сохранен в правильном формате
    const expectedAudioUrl = `https://api.telegram.org/file/bot${TEST_TOKEN}/${TEST_FILE_PATH}`;
    expect(ctx.session.audioUrl).toBe(expectedAudioUrl);
    
    // Проверяем, что generateLipSync был вызван с правильными параметрами
    expect(ctx.mockGenerateLipSync).toHaveBeenCalledWith(
      TEST_VIDEO_URL,
      expectedAudioUrl,
      TEST_USER_ID.toString(),
      'test_bot'
    );
    
    // Проверяем, что было отправлено правильное сообщение об успешной отправке
    expect(ctx.reply).toHaveBeenCalledWith(
      '🎥 Видео отправлено на обработку. Ждите результата'
    );
    
    // Проверяем, что scene.leave был вызван для выхода из сцены
    expect(ctx.scene.leave).toHaveBeenCalled();
    
    logInfo(`✅ Тест прошел успешно: ${TEST_NAME}`);
    return { testName: TEST_NAME, category: CATEGORY, success: true, message: 'Третий шаг липсинк мастера успешно обрабатывает файл аудио' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError(`❌ Тест провален: ${TEST_NAME}`, error);
    return { testName: TEST_NAME, category: CATEGORY, success: false, message: `Ошибка: ${errorMessage}` };
  }
}

/**
 * Тестирование третьего шага с голосовым сообщением
 */
async function testLipSyncWizard_ThirdStepWithVoiceMessage() {
  const TEST_NAME = 'testLipSyncWizard_ThirdStepWithVoiceMessage';
  const CATEGORY = 'lipSyncWizard';
  
  logInfo(`🔄 Запуск теста: ${TEST_NAME}`);
  
  try {
    // Arrange
    const ctx = setupContext({ 
      language: 'ru', 
      step: 2, 
      messageType: 'voice', 
      hasVoiceFile: true,
      videoUrl: TEST_VIDEO_URL // Устанавливаем URL видео из предыдущего шага
    });
    
    // Act
    await invokeHandler(ctx, 2);
    
    // Assert
    // Проверяем, что getFile был вызван с правильным ID
    expect(ctx.telegram.getFile).toHaveBeenCalledWith(TEST_VOICE_FILE_ID);
    
    // Проверяем, что URL аудио был сохранен в правильном формате
    const expectedAudioUrl = `https://api.telegram.org/file/bot${TEST_TOKEN}/${TEST_FILE_PATH}`;
    expect(ctx.session.audioUrl).toBe(expectedAudioUrl);
    
    // Проверяем, что generateLipSync был вызван с правильными параметрами
    expect(ctx.mockGenerateLipSync).toHaveBeenCalledWith(
      TEST_VIDEO_URL,
      expectedAudioUrl,
      TEST_USER_ID.toString(),
      'test_bot'
    );
    
    // Проверяем, что было отправлено правильное сообщение об успешной отправке
    expect(ctx.reply).toHaveBeenCalledWith(
      '🎥 Видео отправлено на обработку. Ждите результата'
    );
    
    // Проверяем, что scene.leave был вызван для выхода из сцены
    expect(ctx.scene.leave).toHaveBeenCalled();
    
    logInfo(`✅ Тест прошел успешно: ${TEST_NAME}`);
    return { testName: TEST_NAME, category: CATEGORY, success: true, message: 'Третий шаг липсинк мастера успешно обрабатывает голосовое сообщение' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError(`❌ Тест провален: ${TEST_NAME}`, error);
    return { testName: TEST_NAME, category: CATEGORY, success: false, message: `Ошибка: ${errorMessage}` };
  }
}

/**
 * Тестирование обработки слишком большого аудио файла
 */
async function testLipSyncWizard_TooLargeAudioFile() {
  const TEST_NAME = 'testLipSyncWizard_TooLargeAudioFile';
  const CATEGORY = 'lipSyncWizard';
  
  logInfo(`🔄 Запуск теста: ${TEST_NAME}`);
  
  try {
    // Arrange
    const ctx = setupContext({ 
      language: 'ru', 
      step: 2, 
      messageType: 'audio', 
      hasAudioFile: true,
      fileSize: MAX_FILE_SIZE + 1024, // Превышаем максимальный размер
      videoUrl: TEST_VIDEO_URL // Устанавливаем URL видео из предыдущего шага
    });
    
    // Act
    await invokeHandler(ctx, 2);
    
    // Assert
    // Проверяем, что getFile был вызван с правильным ID
    expect(ctx.telegram.getFile).toHaveBeenCalledWith(TEST_AUDIO_FILE_ID);
    
    // Проверяем, что было отправлено сообщение об ошибке
    expect(ctx.reply).toHaveBeenCalledWith(
      'Ошибка: аудио слишком большое. Максимальный размер: 50MB'
    );
    
    // Проверяем, что scene.leave был вызван для выхода из сцены
    expect(ctx.scene.leave).toHaveBeenCalled();
    
    logInfo(`✅ Тест прошел успешно: ${TEST_NAME}`);
    return { testName: TEST_NAME, category: CATEGORY, success: true, message: 'Третий шаг липсинк мастера корректно обрабатывает слишком большие аудио файлы' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError(`❌ Тест провален: ${TEST_NAME}`, error);
    return { testName: TEST_NAME, category: CATEGORY, success: false, message: `Ошибка: ${errorMessage}` };
  }
}

/**
 * Тестирование обработки отсутствия аудио
 */
async function testLipSyncWizard_NoAudio() {
  const TEST_NAME = 'testLipSyncWizard_NoAudio';
  const CATEGORY = 'lipSyncWizard';
  
  logInfo(`🔄 Запуск теста: ${TEST_NAME}`);
  
  try {
    // Arrange
    const ctx = setupContext({ 
      language: 'ru', 
      step: 2, 
      messageType: 'text',
      videoUrl: TEST_VIDEO_URL // Устанавливаем URL видео из предыдущего шага
    });
    
    // Устанавливаем пустое сообщение
    ctx.message = { text: '' };
    
    // Act
    await invokeHandler(ctx, 2);
    
    // Assert
    // Проверяем, что было отправлено сообщение об ошибке
    expect(ctx.reply).toHaveBeenCalledWith(
      'Ошибка: аудио не предоставлено'
    );
    
    // Проверяем, что scene.leave был вызван для выхода из сцены
    expect(ctx.scene.leave).toHaveBeenCalled();
    
    logInfo(`✅ Тест прошел успешно: ${TEST_NAME}`);
    return { testName: TEST_NAME, category: CATEGORY, success: true, message: 'Третий шаг липсинк мастера корректно обрабатывает отсутствие аудио' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError(`❌ Тест провален: ${TEST_NAME}`, error);
    return { testName: TEST_NAME, category: CATEGORY, success: false, message: `Ошибка: ${errorMessage}` };
  }
}

/**
 * Тестирование обработки отсутствия ID пользователя
 */
async function testLipSyncWizard_NoUserId() {
  const TEST_NAME = 'testLipSyncWizard_NoUserId';
  const CATEGORY = 'lipSyncWizard';
  
  logInfo(`🔄 Запуск теста: ${TEST_NAME}`);
  
  try {
    // Arrange
    const ctx = setupContext({ 
      language: 'ru', 
      step: 2, 
      messageType: 'text', 
      hasAudioFile: true,
      videoUrl: TEST_VIDEO_URL, // Устанавливаем URL видео из предыдущего шага
    });
    
    // Убираем ID пользователя
    ctx.from = { language_code: 'ru' } as any;
    
    // Act
    await invokeHandler(ctx, 2);
    
    // Assert
    // Проверяем, что аудио URL сохранен в сессии
    expect(ctx.session.audioUrl).toBe(TEST_AUDIO_URL);
    
    // Проверяем, что было отправлено сообщение об ошибке
    expect(ctx.reply).toHaveBeenCalledWith(
      'Ошибка: ID пользователя не предоставлен'
    );
    
    // Проверяем, что scene.leave был вызван для выхода из сцены
    expect(ctx.scene.leave).toHaveBeenCalled();
    
    logInfo(`✅ Тест прошел успешно: ${TEST_NAME}`);
    return { testName: TEST_NAME, category: CATEGORY, success: true, message: 'Третий шаг липсинк мастера корректно обрабатывает отсутствие ID пользователя' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError(`❌ Тест провален: ${TEST_NAME}`, error);
    return { testName: TEST_NAME, category: CATEGORY, success: false, message: `Ошибка: ${errorMessage}` };
  }
}

/**
 * Тестирование обработки ошибки генерации липсинка
 */
async function testLipSyncWizard_GenerationError() {
  const TEST_NAME = 'testLipSyncWizard_GenerationError';
  const CATEGORY = 'lipSyncWizard';
  
  logInfo(`🔄 Запуск теста: ${TEST_NAME}`);
  
  try {
    // Arrange
    const ctx = setupContext({ 
      language: 'ru', 
      step: 2, 
      messageType: 'text', 
      hasAudioFile: true,
      videoUrl: TEST_VIDEO_URL // Устанавливаем URL видео из предыдущего шага
    });
    
    // Настраиваем мок для generateLipSync чтобы выбрасывал ошибку
    ctx.mockGenerateLipSync.mockRejectedValue(new Error('Test error in generation'));
    
    // Act
    await invokeHandler(ctx, 2);
    
    // Assert
    // Проверяем, что аудио URL сохранен в сессии
    expect(ctx.session.audioUrl).toBe(TEST_AUDIO_URL);
    
    // Проверяем, что generateLipSync был вызван с правильными параметрами
    expect(ctx.mockGenerateLipSync).toHaveBeenCalledWith(
      TEST_VIDEO_URL,
      TEST_AUDIO_URL,
      TEST_USER_ID.toString(),
      'test_bot'
    );
    
    // Проверяем, что было отправлено сообщение об ошибке
    expect(ctx.reply).toHaveBeenCalledWith(
      'Произошла ошибка при обработке видео'
    );
    
    // Проверяем, что scene.leave был вызван для выхода из сцены
    expect(ctx.scene.leave).toHaveBeenCalled();
    
    logInfo(`✅ Тест прошел успешно: ${TEST_NAME}`);
    return { testName: TEST_NAME, category: CATEGORY, success: true, message: 'Третий шаг липсинк мастера корректно обрабатывает ошибки генерации' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError(`❌ Тест провален: ${TEST_NAME}`, error);
    return { testName: TEST_NAME, category: CATEGORY, success: false, message: `Ошибка: ${errorMessage}` };
  }
}

/**
 * Запускает все тесты для липсинк мастера
 */
export async function runLipSyncWizardTests() {
  const results = await Promise.all([
    testLipSyncWizard_FirstStep(),
    testLipSyncWizard_FirstStepEnglish(),
    testLipSyncWizard_SecondStepWithUrl(),
    testLipSyncWizard_SecondStepWithVideoFile(),
    testLipSyncWizard_TooLargeVideoFile(),
    testLipSyncWizard_NoVideo(),
    testLipSyncWizard_ThirdStepWithUrl(),
    testLipSyncWizard_ThirdStepWithAudioFile(),
    testLipSyncWizard_ThirdStepWithVoiceMessage(),
    testLipSyncWizard_TooLargeAudioFile(),
    testLipSyncWizard_NoAudio(),
    testLipSyncWizard_NoUserId(),
    testLipSyncWizard_GenerationError()
  ]);
  
  logInfo(`
📊 Результаты тестирования lipSyncWizard:
✅ Успешно: ${results.filter(r => r.success).length}
❌ Провалено: ${results.filter(r => !r.success).length}
`);
  
  return results;
}

// Запуск тестов
runLipSyncWizardTests(); 