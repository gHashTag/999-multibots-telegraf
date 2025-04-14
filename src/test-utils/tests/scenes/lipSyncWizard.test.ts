import { Scenes } from 'telegraf';
import { TestCategory, TestResult } from '../../core/types';
import { MyContext } from '../../../interfaces';
import { createMockContext } from '../../core/mockContext';
import { mockFn, mockObject } from '../../core/mockFunction';
import lipSyncWizard from '../../../scenes/lipSyncWizard';
import * as generateLipSyncModule from '../../../services/generateLipSync';
import { logError, logInfo } from '../../utils/logger';
import { MockFunction } from '../../types/mockFunction';
import { testReport } from '../../helpers';

// Константы для тестирования
const TEST_TOKEN = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
const TEST_VIDEO_URL = 'https://example.com/video.mp4';
const TEST_AUDIO_URL = 'https://example.com/audio.mp3';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

// Создаем моки для внешних зависимостей
const generateLipSyncMock = mockFn();

// Мок для логгера
const logMock = mockObject({
  info: mockFn(),
  error: mockFn()
});

// Устанавливаем моки в глобальное пространство имен
console.log('🔧 Настраиваем моки для lipSyncWizard');
jest.mock('../../../services/generateLipSync', () => ({
  generateLipSync: generateLipSyncMock
}));
(global as any).log = logMock;

// Отладочный вывод для lipSyncWizard
console.log('🔍 lipSyncWizard:', {
  type: typeof lipSyncWizard,
  isWizardScene: lipSyncWizard instanceof Scenes.WizardScene,
  steps: lipSyncWizard.middleware().length,
  handlerKeys: Object.keys(lipSyncWizard)
});

// Типизированный интерфейс для мок-контекста в тестах
interface TestContext {
  scene: {
    enter: jest.Mock;
    leave: jest.Mock;
    reenter: jest.Mock;
  };
  telegram: {
    getFile: jest.Mock;
    token: string;
  };
  wizard: {
    next: jest.Mock;
    selectStep: jest.Mock;
    cursor: number;
    state: Record<string, any>;
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
  reply: jest.Mock;
  replies?: Array<{ text: string; extra?: any }>;
}

/**
 * Настраивает контекст для тестирования lipSyncWizard
 * @param params Параметры для настройки контекста
 * @returns Подготовленный мок-контекст
 */
function setupContext(params: {
  language?: string;
  messageType?: 'text' | 'video' | 'audio' | 'voice';
  hasVideoFile?: boolean;
  hasAudioFile?: boolean;
  hasVoiceFile?: boolean;
  fileSize?: number;
  filePath?: string;
  step?: number;
}): TestContext {
  const { 
    language = 'ru',
    messageType = 'text',
    hasVideoFile = false,
    hasAudioFile = false,
    hasVoiceFile = false,
    fileSize = 1024,
    filePath = 'test/path.file',
    step = 0
  } = params;

  // Создаем базовый контекст
  const ctx = createMockContext() as unknown as TestContext;
  
  // Настраиваем базовые свойства
  ctx.from = { id: 12345, language_code: language } as any;
  ctx.botInfo = { username: 'test_bot' } as any;
  
  // Настраиваем сообщение в зависимости от типа
  if (messageType === 'text') {
    ctx.message = { text: hasVideoFile ? TEST_VIDEO_URL : (hasAudioFile ? TEST_AUDIO_URL : 'some text') } as any;
  } else if (messageType === 'video' && hasVideoFile) {
    ctx.message = { video: { file_id: 'video_file_id', file_size: fileSize } } as any;
  } else if (messageType === 'audio' && hasAudioFile) {
    ctx.message = { audio: { file_id: 'audio_file_id', file_size: fileSize } } as any;
  } else if (messageType === 'voice' && hasVoiceFile) {
    ctx.message = { voice: { file_id: 'voice_file_id', file_size: fileSize } } as any;
  }
  
  // Настраиваем методы Telegram
  ctx.telegram = {
    getFile: mockFn().mockResolvedValue({ 
      file_id: 'file_id', 
      file_size: fileSize, 
      file_path: filePath 
    }),
    token: TEST_TOKEN
  } as any;
  
  // Настраиваем методы сцены
  ctx.scene = {
    leave: mockFn().mockResolvedValue(undefined),
    enter: mockFn().mockResolvedValue(undefined),
    reenter: mockFn().mockResolvedValue(undefined)
  } as any;
  
  // Настраиваем методы мастера
  ctx.wizard = {
    next: mockFn().mockReturnValue(step + 1),
    selectStep: mockFn(),
    cursor: step,
    state: {}
  } as any;
  
  // Настраиваем сессию
  ctx.session = {};
  
  // Мокаем метод reply
  ctx.reply = mockFn().mockImplementation(function(text: string, extra?: any) {
    console.log('Reply called with:', { text: typeof text === 'string' ? text.substring(0, 30) + '...' : text });
    if (!ctx.replies) {
      ctx.replies = [];
    }
    ctx.replies.push({ text, extra });
    return Promise.resolve({ message_id: ctx.replies.length });
  });
  
  return ctx;
}

/**
 * Получает обработчик для определенного шага сцены
 * @param step Индекс шага сцены
 * @returns Функция-обработчик для указанного шага
 */
function getSceneHandler(step: number) {
  if (!lipSyncWizard || !(lipSyncWizard instanceof Scenes.WizardScene)) {
    throw new Error('lipSyncWizard не является экземпляром WizardScene');
  }
  
  const steps = (lipSyncWizard as any).steps;
  if (!Array.isArray(steps) || steps.length <= step) {
    throw new Error(`Шаг ${step} не существует в липсинк сцене`);
  }
  
  return steps[step];
}

/**
 * Вызывает обработчик шага сцены с заданным контекстом
 * @param step Индекс шага сцены
 * @param ctx Контекст для вызова обработчика
 */
async function invokeHandler(step: number, ctx: TestContext) {
  const handler = getSceneHandler(step);
  await handler(ctx);
}

// Функция для безопасного вызова обработчиков шагов
async function invokeHandlerSafe(
  step: number,
  ctx: TestContext
): Promise<{ success: boolean; error?: string }> {
  try {
    const handler = getSceneHandler(step);
    if (!handler) {
      return { success: false, error: `Обработчик для шага ${step} не найден` };
    }
    await handler(ctx);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// Вспомогательные функции для проверок
function assertHasCalled(mock: jest.Mock, times: number = 1): void {
  if (!mock.mock) {
    throw new Error('Передан не мок-объект');
  }
  if (mock.mock.calls.length !== times) {
    throw new Error(`Ожидалось вызовов: ${times}, получено: ${mock.mock.calls.length}`);
  }
}

function assertMessageSentWith(ctx: TestContext, expectedText: string): void {
  if (!ctx.reply) {
    throw new Error('ctx.reply не определен');
  }
  
  const replyMock = ctx.reply as jest.Mock;
  if (!replyMock.mock) {
    throw new Error('ctx.reply не является мок-функцией');
  }
  
  const calls = replyMock.mock.calls;
  const matchingCall = calls.find(call => {
    const text = call[0] as string;
    return text.includes(expectedText);
  });
  
  if (!matchingCall) {
    throw new Error(`Сообщение с текстом "${expectedText}" не было отправлено. Отправленные сообщения: ${calls.map(c => c[0]).join(', ')}`);
  }
}

// Функция для выполнения набора тестов
async function runTests(
  tests: Record<string, () => Promise<TestResult>>
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  for (const testName in tests) {
    if (Object.prototype.hasOwnProperty.call(tests, testName)) {
      const testFn = tests[testName];
      try {
        const result = await testFn();
        results.push(result);
      } catch (error: any) {
        logError(`Неожиданная ошибка при выполнении теста ${testName}: ${error.message}`);
        results.push({
          name: testName,
          category: TestCategory.All,
          success: false,
          message: `Неожиданная ошибка: ${error.message}`
        });
      }
    }
  }
  
  return results;
}

// Тесты для липсинк сцены
export const lipSyncWizardTests = {
  testLipSyncWizardEnter: async function(): Promise<TestResult> {
    logInfo('📝 Тест: вход в сцену липсинк на русском языке');
    
    try {
      // Настраиваем мок контекст
      const ctx = setupContext({
        language: 'ru'
      });
      
      // Вызываем обработчик первого шага
      const result = await invokeHandler(0, ctx);
      
      // Проверки
      if (!result.success) {
        throw new Error(`Не удалось выполнить первый шаг: ${result.error}`);
      }
      
      assertMessageSentWith(ctx, 'Отправьте видео или URL видео');
      assertHasCalled(ctx.wizard.next as jest.Mock);
      
      return {
        name: 'testLipSyncWizardEnter',
        category: TestCategory.All,
        success: true,
        message: '✅ Тест входа в сцену липсинк на русском языке успешно пройден'
      };
    } catch (error: any) {
      logError(`❌ Ошибка в тесте входа в сцену липсинк: ${error.message}`);
      return {
        name: 'testLipSyncWizardEnter',
        category: TestCategory.All,
        success: false,
        message: `❌ Тест входа в сцену липсинк провален: ${error.message}`
      };
    }
  },
  
  testLipSyncWizardEnterEnglish: async function(): Promise<TestResult> {
    logInfo('📝 Тест: вход в сцену липсинк на английском языке');
    
    try {
      // Настраиваем мок контекст с английским языком
      const ctx = setupContext({
        language: 'en'
      });
      
      // Вызываем обработчик первого шага
      const result = await invokeHandler(0, ctx);
      
      // Проверки
      if (!result.success) {
        throw new Error(`Не удалось выполнить первый шаг: ${result.error}`);
      }
      
      assertMessageSentWith(ctx, 'Send a video or video URL');
      assertHasCalled(ctx.wizard.next as jest.Mock);
      
      return {
        name: 'testLipSyncWizardEnterEnglish',
        category: TestCategory.All,
        success: true,
        message: '✅ Тест входа в сцену липсинк на английском языке успешно пройден'
      };
    } catch (error: any) {
      logError(`❌ Ошибка в тесте входа в сцену липсинк на английском языке: ${error.message}`);
      return {
        name: 'testLipSyncWizardEnterEnglish',
        category: TestCategory.All,
        success: false,
        message: `❌ Тест входа в сцену липсинк на английском языке провален: ${error.message}`
      };
    }
  },
  
  testLipSyncWizardVideoURL: async function(): Promise<TestResult> {
    logInfo('📝 Тест: обработка URL видео');
    
    try {
      // Настраиваем мок контекст
      const ctx = setupContext({
        language: 'ru',
        messageType: 'text',
        step: 1
      });
      ctx.message = { text: TEST_VIDEO_URL } as any;
      
      // Вызываем обработчик второго шага
      const result = await invokeHandler(1, ctx);
      
      // Проверки
      if (!result.success) {
        throw new Error(`Не удалось выполнить второй шаг: ${result.error}`);
      }
      
      if (ctx.session.videoUrl !== TEST_VIDEO_URL) {
        throw new Error(`videoUrl в сессии неверный. Ожидалось: ${TEST_VIDEO_URL}, получено: ${ctx.session.videoUrl}`);
      }
      
      assertMessageSentWith(ctx, 'Отправьте аудио');
      assertHasCalled(ctx.wizard.next as jest.Mock);
      
      return {
        name: 'testLipSyncWizardVideoURL',
        category: TestCategory.All,
        success: true,
        message: '✅ Тест обработки URL видео успешно пройден'
      };
    } catch (error: any) {
      logError(`❌ Ошибка в тесте обработки URL видео: ${error.message}`);
      return {
        name: 'testLipSyncWizardVideoURL',
        category: TestCategory.All,
        success: false,
        message: `❌ Тест обработки URL видео провален: ${error.message}`
      };
    }
  },
  
  testLipSyncWizardVideoFile: async function(): Promise<TestResult> {
    logInfo('📝 Тест: обработка файла видео');
    
    try {
      // Настраиваем мок контекст
      const ctx = setupContext({
        language: 'ru',
        messageType: 'video',
        hasVideoFile: true,
        fileSize: 1 * 1024 * 1024, // 1MB
        filePath: 'videos/test_video.mp4',
        step: 1
      });
      
      // Вызываем обработчик второго шага
      const result = await invokeHandler(1, ctx);
      
      // Проверки
      if (!result.success) {
        throw new Error(`Не удалось выполнить второй шаг: ${result.error}`);
      }
      
      assertHasCalled(ctx.telegram.getFile as jest.Mock);
      
      const videoUrlInSession = ctx.session.videoUrl;
      const expectedUrl = `https://api.telegram.org/file/bot${TEST_TOKEN}/videos/test_video.mp4`;
      if (videoUrlInSession !== expectedUrl) {
        throw new Error(`videoUrl в сессии неверный. Ожидалось: ${expectedUrl}, получено: ${videoUrlInSession}`);
      }
      
      assertMessageSentWith(ctx, 'Отправьте аудио');
      assertHasCalled(ctx.wizard.next as jest.Mock);
      
      return {
        name: 'testLipSyncWizardVideoFile',
        category: TestCategory.All,
        success: true,
        message: '✅ Тест обработки файла видео успешно пройден'
      };
    } catch (error: any) {
      logError(`❌ Ошибка в тесте обработки файла видео: ${error.message}`);
      return {
        name: 'testLipSyncWizardVideoFile',
        category: TestCategory.All,
        success: false,
        message: `❌ Тест обработки файла видео провален: ${error.message}`
      };
    }
  },
  
  testLipSyncWizardLargeVideo: async function(): Promise<TestResult> {
    logInfo('📝 Тест: обработка слишком большого видео');
    
    try {
      // Настраиваем мок контекст
      const ctx = setupContext({
        language: 'ru',
        messageType: 'video',
        hasVideoFile: true,
        fileSize: 60 * 1024 * 1024, // 60MB - больше лимита
        filePath: 'videos/large_video.mp4',
        step: 1
      });
      
      // Вызываем обработчик второго шага
      const result = await invokeHandler(1, ctx);
      
      // Проверки
      if (!result.success) {
        throw new Error(`Не удалось выполнить второй шаг: ${result.error}`);
      }
      
      assertHasCalled(ctx.telegram.getFile as jest.Mock);
      assertMessageSentWith(ctx, 'слишком большое');
      assertHasCalled(ctx.scene.leave as jest.Mock);
      
      return {
        name: 'testLipSyncWizardLargeVideo',
        category: TestCategory.All,
        success: true,
        message: '✅ Тест обработки слишком большого видео успешно пройден'
      };
    } catch (error: any) {
      logError(`❌ Ошибка в тесте обработки слишком большого видео: ${error.message}`);
      return {
        name: 'testLipSyncWizardLargeVideo',
        category: TestCategory.All,
        success: false,
        message: `❌ Тест обработки слишком большого видео провален: ${error.message}`
      };
    }
  },
  
  testLipSyncWizardAudioURL: async function(): Promise<TestResult> {
    logInfo('📝 Тест: обработка URL аудио');
    
    try {
      // Инициализируем мок для generateLipSync
      mockGenerateLipSync = jest.fn().mockResolvedValue({
        success: true,
        message: 'Lip sync generation started'
      }) as any;
      jest.spyOn(generateLipSyncModule, 'generateLipSync').mockImplementation(mockGenerateLipSync);
      
      // Настраиваем мок контекст
      const ctx = setupContext({
        language: 'ru',
        messageType: 'text',
        step: 2
      });
      ctx.message = { text: TEST_AUDIO_URL } as any;
      
      // Настраиваем сессию для теста третьего шага
      ctx.session.videoUrl = TEST_VIDEO_URL;
      
      // Вызываем обработчик третьего шага
      const result = await invokeHandler(2, ctx);
      
      // Проверки
      if (!result.success) {
        throw new Error(`Не удалось выполнить третий шаг: ${result.error}`);
      }
      
      if (ctx.session.audioUrl !== TEST_AUDIO_URL) {
        throw new Error(`audioUrl в сессии неверный. Ожидалось: ${TEST_AUDIO_URL}, получено: ${ctx.session.audioUrl}`);
      }
      
      assertHasCalled(mockGenerateLipSync as any);
      assertMessageSentWith(ctx, 'Видео отправлено на обработку');
      assertHasCalled(ctx.scene.leave as jest.Mock);
      
      return {
        name: 'testLipSyncWizardAudioURL',
        category: TestCategory.All,
        success: true,
        message: '✅ Тест обработки URL аудио успешно пройден'
      };
    } catch (error: any) {
      logError(`❌ Ошибка в тесте обработки URL аудио: ${error.message}`);
      return {
        name: 'testLipSyncWizardAudioURL',
        category: TestCategory.All,
        success: false,
        message: `❌ Тест обработки URL аудио провален: ${error.message}`
      };
    }
  },
  
  testLipSyncWizardAudioFile: async function(): Promise<TestResult> {
    logInfo('📝 Тест: обработка файла аудио');
    
    try {
      // Инициализируем мок для generateLipSync
      mockGenerateLipSync = jest.fn().mockResolvedValue({
        success: true,
        message: 'Lip sync generation started'
      }) as any;
      jest.spyOn(generateLipSyncModule, 'generateLipSync').mockImplementation(mockGenerateLipSync);
      
      // Настраиваем мок контекст
      const ctx = setupContext({
        language: 'ru',
        messageType: 'audio',
        hasAudioFile: true,
        fileSize: 1 * 1024 * 1024, // 1MB
        filePath: 'audios/test_audio.mp3',
        step: 2
      });
      
      // Настраиваем сессию для теста третьего шага
      ctx.session.videoUrl = TEST_VIDEO_URL;
      
      // Вызываем обработчик третьего шага
      const result = await invokeHandler(2, ctx);
      
      // Проверки
      if (!result.success) {
        throw new Error(`Не удалось выполнить третий шаг: ${result.error}`);
      }
      
      assertHasCalled(ctx.telegram.getFile as any);
      
      const audioUrlInSession = ctx.session.audioUrl;
      const expectedUrl = `https://api.telegram.org/file/bot${TEST_TOKEN}/audios/test_audio.mp3`;
      if (audioUrlInSession !== expectedUrl) {
        throw new Error(`audioUrl в сессии неверный. Ожидалось: ${expectedUrl}, получено: ${audioUrlInSession}`);
      }
      
      assertHasCalled(mockGenerateLipSync as any);
      assertMessageSentWith(ctx, 'Видео отправлено на обработку');
      assertHasCalled(ctx.scene.leave as any);
      
      return {
        name: 'testLipSyncWizardAudioFile',
        category: TestCategory.All,
        success: true,
        message: '✅ Тест обработки файла аудио успешно пройден'
      };
    } catch (error: any) {
      logError(`❌ Ошибка в тесте обработки файла аудио: ${error.message}`);
      return {
        name: 'testLipSyncWizardAudioFile',
        category: TestCategory.All,
        success: false,
        message: `❌ Тест обработки файла аудио провален: ${error.message}`
      };
    }
  },
  
  testLipSyncWizardVoiceMessage: async function(): Promise<TestResult> {
    logInfo('📝 Тест: обработка голосового сообщения');
    
    try {
      // Инициализируем мок для generateLipSync
      mockGenerateLipSync = jest.fn().mockResolvedValue({
        success: true,
        message: 'Lip sync generation started'
      }) as any;
      jest.spyOn(generateLipSyncModule, 'generateLipSync').mockImplementation(mockGenerateLipSync);
      
      // Настраиваем мок контекст
      const ctx = setupContext({ 
        language: 'ru', 
        messageType: 'voice',
        hasVoiceFile: true,
        fileSize: 1 * 1024 * 1024, // 1MB
        filePath: 'voices/test_voice.ogg',
        step: 2
      });
      
      // Настраиваем сессию для теста третьего шага
      ctx.session.videoUrl = TEST_VIDEO_URL;
      
      // Вызываем обработчик третьего шага
      const result = await invokeHandler(2, ctx);
      
      // Проверки
      if (!result.success) {
        throw new Error(`Не удалось выполнить третий шаг: ${result.error}`);
      }
      
      assertHasCalled(ctx.telegram.getFile as any);
      
      const audioUrlInSession = ctx.session.audioUrl;
      const expectedUrl = `https://api.telegram.org/file/bot${TEST_TOKEN}/voices/test_voice.ogg`;
      if (audioUrlInSession !== expectedUrl) {
        throw new Error(`audioUrl в сессии неверный. Ожидалось: ${expectedUrl}, получено: ${audioUrlInSession}`);
      }
      
      assertHasCalled(mockGenerateLipSync as any);
      assertMessageSentWith(ctx, 'Видео отправлено на обработку');
      assertHasCalled(ctx.scene.leave as any);
      
      return {
        name: 'testLipSyncWizardVoiceMessage',
        category: TestCategory.All,
        success: true,
        message: '✅ Тест обработки голосового сообщения успешно пройден'
      };
    } catch (error: any) {
      logError(`❌ Ошибка в тесте обработки голосового сообщения: ${error.message}`);
      return {
        name: 'testLipSyncWizardVoiceMessage',
        category: TestCategory.All,
        success: false,
        message: `❌ Тест обработки голосового сообщения провален: ${error.message}`
      };
    }
  },
  
  testLipSyncWizardHandleError: async function(): Promise<TestResult> {
    logInfo('📝 Тест: обработка ошибки в generateLipSync');
    
    try {
      // Инициализируем мок для generateLipSync с ошибкой
      mockGenerateLipSync = jest.fn().mockRejectedValue(new Error('Service error')) as any;
      jest.spyOn(generateLipSyncModule, 'generateLipSync').mockImplementation(mockGenerateLipSync);
      
      // Настраиваем мок контекст
      const ctx = setupContext({ 
        language: 'ru', 
        messageType: 'text',
        step: 2
      });
      
      // Настраиваем сессию для теста третьего шага
      ctx.session.videoUrl = TEST_VIDEO_URL;
      
      // Вызываем обработчик третьего шага
      const result = await invokeHandler(2, ctx);
      
      // Проверки
      if (!result.success) {
        throw new Error(`Не удалось выполнить третий шаг: ${result.error}`);
      }
      
      assertHasCalled(mockGenerateLipSync as any);
      assertMessageSentWith(ctx, 'Произошла ошибка при обработке видео');
      assertHasCalled(ctx.scene.leave as any);
      
      return {
        name: 'testLipSyncWizardHandleError',
        category: TestCategory.All,
        success: true,
        message: '✅ Тест обработки ошибки успешно пройден'
      };
    } catch (error: any) {
      logError(`❌ Ошибка в тесте обработки ошибки: ${error.message}`);
      return {
        name: 'testLipSyncWizardHandleError',
        category: TestCategory.All,
        success: false,
        message: `❌ Тест обработки ошибки провален: ${error.message}`
      };
    }
  }
};

/**
 * Тестирует первый шаг сцены - запрос на отправку видео (русский язык)
 * @returns Результат теста
 */
const testLipSyncWizardFirstStep = async (): Promise<TestResult> => {
  console.log('🧪 Запуск testLipSyncWizardFirstStep');
  
  try {
    // Arrange
    const ctx = setupContext({
      language: 'ru',
      step: 0
    });
    
    // Act
    await invokeHandler(0, ctx);
    
    // Assert
    if (ctx.reply.mock.calls.length === 0) {
      return {
        name: 'Первый шаг lipSyncWizard (ru)',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод reply не был вызван'
      };
    }
    
    const replyText = ctx.replies?.[0]?.text;
    if (!replyText.includes('Отправьте видео или URL видео')) {
      return {
        name: 'Первый шаг lipSyncWizard (ru)',
        category: TestCategory.SCENE,
        success: false,
        message: `Неверное сообщение: ${replyText}`
      };
    }
    
    if (!ctx.wizard.next.mock.calls.length) {
      return {
        name: 'Первый шаг lipSyncWizard (ru)',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод wizard.next не был вызван'
      };
    }
    
    return {
      name: 'Первый шаг lipSyncWizard (ru)',
      category: TestCategory.SCENE,
      success: true,
      message: 'Первый шаг сцены корректно запрашивает видео'
    };
  } catch (error) {
    console.error('Ошибка в testLipSyncWizardFirstStep:', error);
    return {
      name: 'Первый шаг lipSyncWizard (ru)',
      category: TestCategory.SCENE,
      success: false,
      message: 'Ошибка при тестировании первого шага сцены',
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * Тестирует первый шаг сцены - запрос на отправку видео (английский язык)
 * @returns Результат теста
 */
const testLipSyncWizardFirstStepEnglish = async (): Promise<TestResult> => {
  console.log('🧪 Запуск testLipSyncWizardFirstStepEnglish');
  
  try {
    // Arrange
    const ctx = setupContext({
      language: 'en',
      step: 0
    });
    
    // Act
    await invokeHandler(0, ctx);
    
    // Assert
    if (ctx.reply.mock.calls.length === 0) {
      return {
        name: 'Первый шаг lipSyncWizard (en)',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод reply не был вызван'
      };
    }
    
    const replyText = ctx.replies?.[0]?.text;
    if (!replyText.includes('Send a video or video URL')) {
      return {
        name: 'Первый шаг lipSyncWizard (en)',
        category: TestCategory.SCENE,
        success: false,
        message: `Неверное сообщение: ${replyText}`
      };
    }
    
    if (!ctx.wizard.next.mock.calls.length) {
      return {
        name: 'Первый шаг lipSyncWizard (en)',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод wizard.next не был вызван'
      };
    }
    
    return {
      name: 'Первый шаг lipSyncWizard (en)',
      category: TestCategory.SCENE,
      success: true,
      message: 'Первый шаг сцены корректно запрашивает видео на английском'
    };
  } catch (error) {
    console.error('Ошибка в testLipSyncWizardFirstStepEnglish:', error);
    return {
      name: 'Первый шаг lipSyncWizard (en)',
      category: TestCategory.SCENE,
      success: false,
      message: 'Ошибка при тестировании первого шага сцены на английском',
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * Тестирует второй шаг сцены - обработка URL видео
 * @returns Результат теста
 */
const testLipSyncWizardSecondStepWithUrl = async (): Promise<TestResult> => {
  console.log('🧪 Запуск testLipSyncWizardSecondStepWithUrl');
  
  try {
    // Arrange
    const ctx = setupContext({
      language: 'ru',
      messageType: 'text',
      hasVideoFile: true,
      step: 1
    });
    
    // Act
    await invokeHandler(1, ctx);
    
    // Assert
    if (!ctx.session.videoUrl) {
      return {
        name: 'Второй шаг lipSyncWizard - URL видео',
        category: TestCategory.SCENE,
        success: false,
        message: 'URL видео не был сохранен в сессии'
      };
    }
    
    if (ctx.session.videoUrl !== TEST_VIDEO_URL) {
      return {
        name: 'Второй шаг lipSyncWizard - URL видео',
        category: TestCategory.SCENE,
        success: false,
        message: `Неверный URL видео: ${ctx.session.videoUrl} (ожидался ${TEST_VIDEO_URL})`
      };
    }
    
    if (!ctx.wizard.next.mock.calls.length) {
      return {
        name: 'Второй шаг lipSyncWizard - URL видео',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод wizard.next не был вызван'
      };
    }
    
    // Проверяем запрос аудио
    const replyText = ctx.replies?.[0]?.text;
    if (!replyText || !replyText.includes('Отправьте аудио')) {
      return {
        name: 'Второй шаг lipSyncWizard - URL видео',
        category: TestCategory.SCENE,
        success: false,
        message: `Неверное сообщение: ${replyText}`
      };
    }
    
    return {
      name: 'Второй шаг lipSyncWizard - URL видео',
      category: TestCategory.SCENE,
      success: true,
      message: 'Второй шаг сцены корректно обрабатывает URL видео'
    };
  } catch (error) {
    console.error('Ошибка в testLipSyncWizardSecondStepWithUrl:', error);
    return {
      name: 'Второй шаг lipSyncWizard - URL видео',
      category: TestCategory.SCENE,
      success: false,
      message: 'Ошибка при тестировании второго шага с URL видео',
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * Тестирует второй шаг сцены - обработка файла видео
 * @returns Результат теста
 */
const testLipSyncWizardSecondStepWithVideoFile = async (): Promise<TestResult> => {
  console.log('🧪 Запуск testLipSyncWizardSecondStepWithVideoFile');
  
  try {
    // Arrange
    const ctx = setupContext({
      language: 'ru',
      messageType: 'video',
      hasVideoFile: true,
      filePath: 'videos/test.mp4',
      step: 1
    });
    
    // Act
    await invokeHandler(1, ctx);
    
    // Assert
    if (!ctx.telegram.getFile.mock.calls.length) {
      return {
        name: 'Второй шаг lipSyncWizard - файл видео',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод telegram.getFile не был вызван'
      };
    }
    
    if (!ctx.session.videoUrl) {
      return {
        name: 'Второй шаг lipSyncWizard - файл видео',
        category: TestCategory.SCENE,
        success: false,
        message: 'URL видео не был сохранен в сессии'
      };
    }
    
    const expectedUrl = `https://api.telegram.org/file/bot${TEST_TOKEN}/videos/test.mp4`;
    if (ctx.session.videoUrl !== expectedUrl) {
      return {
        name: 'Второй шаг lipSyncWizard - файл видео',
        category: TestCategory.SCENE,
        success: false,
        message: `Неверный URL видео: ${ctx.session.videoUrl} (ожидался ${expectedUrl})`
      };
    }
    
    if (!ctx.wizard.next.mock.calls.length) {
      return {
        name: 'Второй шаг lipSyncWizard - файл видео',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод wizard.next не был вызван'
      };
    }
    
    return {
      name: 'Второй шаг lipSyncWizard - файл видео',
      category: TestCategory.SCENE,
      success: true,
      message: 'Второй шаг сцены корректно обрабатывает файл видео'
    };
  } catch (error) {
    console.error('Ошибка в testLipSyncWizardSecondStepWithVideoFile:', error);
    return {
      name: 'Второй шаг lipSyncWizard - файл видео',
      category: TestCategory.SCENE,
      success: false,
      message: 'Ошибка при тестировании второго шага с файлом видео',
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * Тестирует сценарий слишком большого файла видео
 * @returns Результат теста
 */
const testLipSyncWizardTooLargeVideoFile = async (): Promise<TestResult> => {
  console.log('🧪 Запуск testLipSyncWizardTooLargeVideoFile');
  
  try {
    // Arrange
    const ctx = setupContext({
      language: 'ru',
      messageType: 'video',
      hasVideoFile: true,
      fileSize: 60 * 1024 * 1024, // 60 MB (больше лимита в 50 MB)
      step: 1
    });
    
    // Act
    await invokeHandler(1, ctx);
    
    // Assert
    if (ctx.reply.mock.calls.length === 0) {
      return {
        name: 'Проверка лимита размера видео',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод reply не был вызван'
      };
    }
    
    const replyText = ctx.replies?.[0]?.text;
    if (!replyText.includes('ошибка') && !replyText.includes('Ошибка') && !replyText.includes('большое')) {
      return {
        name: 'Проверка лимита размера видео',
        category: TestCategory.SCENE,
        success: false,
        message: `Неверное сообщение об ошибке: ${replyText}`
      };
    }
    
    if (!ctx.scene.leave.mock.calls.length) {
      return {
        name: 'Проверка лимита размера видео',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод scene.leave не был вызван'
      };
    }
    
    return {
      name: 'Проверка лимита размера видео',
      category: TestCategory.SCENE,
      success: true,
      message: 'Сцена корректно обрабатывает случай слишком большого файла видео'
    };
  } catch (error) {
    console.error('Ошибка в testLipSyncWizardTooLargeVideoFile:', error);
    return {
      name: 'Проверка лимита размера видео',
      category: TestCategory.SCENE,
      success: false,
      message: 'Ошибка при тестировании лимита размера видео',
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * Тестирует сценарий отсутствия видео в сообщении
 * @returns Результат теста
 */
const testLipSyncWizardNoVideo = async (): Promise<TestResult> => {
  console.log('🧪 Запуск testLipSyncWizardNoVideo');
  
  try {
    // Arrange
    const ctx = setupContext({
      language: 'ru',
      messageType: 'text',
      hasVideoFile: false,
      step: 1
    });
    
    // Сбрасываем текст сообщения
    ctx.message = { text: '' };
    
    // Act
    await invokeHandler(1, ctx);
    
    // Assert
    if (ctx.reply.mock.calls.length === 0) {
      return {
        name: 'Проверка отсутствия видео',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод reply не был вызван'
      };
    }
    
    const replyText = ctx.replies?.[0]?.text;
    if (!replyText.includes('Ошибка') && !replyText.includes('видео не предоставлено')) {
      return {
        name: 'Проверка отсутствия видео',
        category: TestCategory.SCENE,
        success: false,
        message: `Неверное сообщение об ошибке: ${replyText}`
      };
    }
    
    if (!ctx.scene.leave.mock.calls.length) {
      return {
        name: 'Проверка отсутствия видео',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод scene.leave не был вызван'
      };
    }
    
    return {
      name: 'Проверка отсутствия видео',
      category: TestCategory.SCENE,
      success: true,
      message: 'Сцена корректно обрабатывает сообщение без видео'
    };
  } catch (error) {
    console.error('Ошибка в testLipSyncWizardNoVideo:', error);
    return {
      name: 'Проверка отсутствия видео',
      category: TestCategory.SCENE,
      success: false,
      message: 'Ошибка при тестировании сообщения без видео',
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * Тестирует третий шаг сцены - обработка URL аудио
 * @returns Результат теста
 */
const testLipSyncWizardThirdStepWithUrl = async (): Promise<TestResult> => {
  console.log('🧪 Запуск testLipSyncWizardThirdStepWithUrl');
  
  try {
    // Arrange
    const ctx = setupContext({
      language: 'ru',
      messageType: 'text',
      hasAudioFile: true,
      step: 2
    });
    
    // Устанавливаем URL видео в сессии
    ctx.session.videoUrl = TEST_VIDEO_URL;
    
    // Сбрасываем мок
    generateLipSyncMock.mockReset();
    generateLipSyncMock.mockResolvedValue(undefined);
    
    // Act
    await invokeHandler(2, ctx);
    
    // Assert
    if (!ctx.session.audioUrl) {
      return {
        name: 'Третий шаг lipSyncWizard - URL аудио',
        category: TestCategory.SCENE,
        success: false,
        message: 'URL аудио не был сохранен в сессии'
      };
    }
    
    if (ctx.session.audioUrl !== TEST_AUDIO_URL) {
      return {
        name: 'Третий шаг lipSyncWizard - URL аудио',
        category: TestCategory.SCENE,
        success: false,
        message: `Неверный URL аудио: ${ctx.session.audioUrl} (ожидался ${TEST_AUDIO_URL})`
      };
    }
    
    if (generateLipSyncMock.mock.calls.length === 0) {
      return {
        name: 'Третий шаг lipSyncWizard - URL аудио',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод generateLipSync не был вызван'
      };
    }
    
    const generateArgs = generateLipSyncMock.mock.calls[0];
    if (!generateArgs || generateArgs[0] !== TEST_VIDEO_URL || generateArgs[1] !== TEST_AUDIO_URL) {
      return {
        name: 'Третий шаг lipSyncWizard - URL аудио',
        category: TestCategory.SCENE,
        success: false,
        message: `Неверные аргументы вызова generateLipSync: ${JSON.stringify(generateArgs)}`
      };
    }
    
    if (!ctx.scene.leave.mock.calls.length) {
      return {
        name: 'Третий шаг lipSyncWizard - URL аудио',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод scene.leave не был вызван'
      };
    }
    
    if (ctx.reply.mock.calls.length === 0) {
      return {
        name: 'Третий шаг lipSyncWizard - URL аудио',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод reply не был вызван'
      };
    }
    
    const replyText = ctx.replies?.[0]?.text;
    if (!replyText.includes('Видео отправлено на обработку')) {
      return {
        name: 'Третий шаг lipSyncWizard - URL аудио',
        category: TestCategory.SCENE,
        success: false,
        message: `Неверное сообщение: ${replyText}`
      };
    }
    
    return {
      name: 'Третий шаг lipSyncWizard - URL аудио',
      category: TestCategory.SCENE,
      success: true,
      message: 'Третий шаг сцены корректно обрабатывает URL аудио'
    };
  } catch (error) {
    console.error('Ошибка в testLipSyncWizardThirdStepWithUrl:', error);
    return {
      name: 'Третий шаг lipSyncWizard - URL аудио',
      category: TestCategory.SCENE,
      success: false,
      message: 'Ошибка при тестировании третьего шага с URL аудио',
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * Тестирует третий шаг сцены - обработка файла аудио
 * @returns Результат теста
 */
const testLipSyncWizardThirdStepWithAudioFile = async (): Promise<TestResult> => {
  console.log('🧪 Запуск testLipSyncWizardThirdStepWithAudioFile');
  
  try {
    // Arrange
    const ctx = setupContext({
      language: 'ru',
      messageType: 'audio',
      hasAudioFile: true,
      filePath: 'audios/test.mp3',
      step: 2
    });
    
    // Устанавливаем URL видео в сессии
    ctx.session.videoUrl = TEST_VIDEO_URL;
    
    // Сбрасываем мок
    generateLipSyncMock.mockReset();
    generateLipSyncMock.mockResolvedValue(undefined);
    
    // Act
    await invokeHandler(2, ctx);
    
    // Assert
    if (!ctx.telegram.getFile.mock.calls.length) {
      return {
        name: 'Третий шаг lipSyncWizard - файл аудио',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод telegram.getFile не был вызван'
      };
    }
    
    if (!ctx.session.audioUrl) {
      return {
        name: 'Третий шаг lipSyncWizard - файл аудио',
        category: TestCategory.SCENE,
        success: false,
        message: 'URL аудио не был сохранен в сессии'
      };
    }
    
    const expectedUrl = `https://api.telegram.org/file/bot${TEST_TOKEN}/audios/test.mp3`;
    if (ctx.session.audioUrl !== expectedUrl) {
      return {
        name: 'Третий шаг lipSyncWizard - файл аудио',
        category: TestCategory.SCENE,
        success: false,
        message: `Неверный URL аудио: ${ctx.session.audioUrl} (ожидался ${expectedUrl})`
      };
    }
    
    if (generateLipSyncMock.mock.calls.length === 0) {
      return {
        name: 'Третий шаг lipSyncWizard - файл аудио',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод generateLipSync не был вызван'
      };
    }
    
    return {
      name: 'Третий шаг lipSyncWizard - файл аудио',
      category: TestCategory.SCENE,
      success: true,
      message: 'Третий шаг сцены корректно обрабатывает файл аудио'
    };
  } catch (error) {
    console.error('Ошибка в testLipSyncWizardThirdStepWithAudioFile:', error);
    return {
      name: 'Третий шаг lipSyncWizard - файл аудио',
      category: TestCategory.SCENE,
      success: false,
      message: 'Ошибка при тестировании третьего шага с файлом аудио',
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * Тестирует третий шаг сцены - обработка голосового сообщения
 * @returns Результат теста
 */
const testLipSyncWizardThirdStepWithVoiceMessage = async (): Promise<TestResult> => {
  console.log('🧪 Запуск testLipSyncWizardThirdStepWithVoiceMessage');
  
  try {
    // Arrange
    const ctx = setupContext({
      language: 'ru',
      messageType: 'voice',
      hasVoiceFile: true,
      filePath: 'voice/test.ogg',
      step: 2
    });
    
    // Устанавливаем URL видео в сессии
    ctx.session.videoUrl = TEST_VIDEO_URL;
    
    // Сбрасываем мок
    generateLipSyncMock.mockReset();
    generateLipSyncMock.mockResolvedValue(undefined);
    
    // Act
    await invokeHandler(2, ctx);
    
    // Assert
    if (!ctx.telegram.getFile.mock.calls.length) {
      return {
        name: 'Третий шаг lipSyncWizard - голосовое сообщение',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод telegram.getFile не был вызван'
      };
    }
    
    if (!ctx.session.audioUrl) {
      return {
        name: 'Третий шаг lipSyncWizard - голосовое сообщение',
        category: TestCategory.SCENE,
        success: false,
        message: 'URL аудио не был сохранен в сессии'
      };
    }
    
    const expectedUrl = `https://api.telegram.org/file/bot${TEST_TOKEN}/voice/test.ogg`;
    if (ctx.session.audioUrl !== expectedUrl) {
      return {
        name: 'Третий шаг lipSyncWizard - голосовое сообщение',
        category: TestCategory.SCENE,
        success: false,
        message: `Неверный URL аудио: ${ctx.session.audioUrl} (ожидался ${expectedUrl})`
      };
    }
    
    if (generateLipSyncMock.mock.calls.length === 0) {
      return {
        name: 'Третий шаг lipSyncWizard - голосовое сообщение',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод generateLipSync не был вызван'
      };
    }
    
    return {
      name: 'Третий шаг lipSyncWizard - голосовое сообщение',
      category: TestCategory.SCENE,
      success: true,
      message: 'Третий шаг сцены корректно обрабатывает голосовое сообщение'
    };
  } catch (error) {
    console.error('Ошибка в testLipSyncWizardThirdStepWithVoiceMessage:', error);
    return {
      name: 'Третий шаг lipSyncWizard - голосовое сообщение',
      category: TestCategory.SCENE,
      success: false,
      message: 'Ошибка при тестировании третьего шага с голосовым сообщением',
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * Тестирует сценарий слишком большого файла аудио
 * @returns Результат теста
 */
const testLipSyncWizardTooLargeAudioFile = async (): Promise<TestResult> => {
  console.log('🧪 Запуск testLipSyncWizardTooLargeAudioFile');
  
  try {
    // Arrange
    const ctx = setupContext({
      language: 'ru',
      messageType: 'audio',
      hasAudioFile: true,
      fileSize: 60 * 1024 * 1024, // 60 MB (больше лимита в 50 MB)
      step: 2
    });
    
    // Устанавливаем URL видео в сессии
    ctx.session.videoUrl = TEST_VIDEO_URL;
    
    // Act
    await invokeHandler(2, ctx);
    
    // Assert
    if (ctx.reply.mock.calls.length === 0) {
      return {
        name: 'Проверка лимита размера аудио',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод reply не был вызван'
      };
    }
    
    const replyText = ctx.replies?.[0]?.text;
    if (!replyText.includes('ошибка') && !replyText.includes('Ошибка') && !replyText.includes('большое')) {
      return {
        name: 'Проверка лимита размера аудио',
        category: TestCategory.SCENE,
        success: false,
        message: `Неверное сообщение об ошибке: ${replyText}`
      };
    }
    
    if (!ctx.scene.leave.mock.calls.length) {
      return {
        name: 'Проверка лимита размера аудио',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод scene.leave не был вызван'
      };
    }
    
    return {
      name: 'Проверка лимита размера аудио',
      category: TestCategory.SCENE,
      success: true,
      message: 'Сцена корректно обрабатывает случай слишком большого файла аудио'
    };
  } catch (error) {
    console.error('Ошибка в testLipSyncWizardTooLargeAudioFile:', error);
    return {
      name: 'Проверка лимита размера аудио',
      category: TestCategory.SCENE,
      success: false,
      message: 'Ошибка при тестировании лимита размера аудио',
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * Тестирует сценарий отсутствия аудио в сообщении
 * @returns Результат теста
 */
const testLipSyncWizardNoAudio = async (): Promise<TestResult> => {
  console.log('🧪 Запуск testLipSyncWizardNoAudio');
  
  try {
    // Arrange
    const ctx = setupContext({
      language: 'ru',
      messageType: 'text',
      hasAudioFile: false,
      step: 2
    });
    
    // Устанавливаем URL видео в сессии
    ctx.session.videoUrl = TEST_VIDEO_URL;
    
    // Сбрасываем текст сообщения
    ctx.message = { text: '' };
    
    // Act
    await invokeHandler(2, ctx);
    
    // Assert
    if (ctx.reply.mock.calls.length === 0) {
      return {
        name: 'Проверка отсутствия аудио',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод reply не был вызван'
      };
    }
    
    const replyText = ctx.replies?.[0]?.text;
    if (!replyText.includes('Ошибка') && !replyText.includes('аудио не предоставлено')) {
      return {
        name: 'Проверка отсутствия аудио',
        category: TestCategory.SCENE,
        success: false,
        message: `Неверное сообщение об ошибке: ${replyText}`
      };
    }
    
    if (!ctx.scene.leave.mock.calls.length) {
      return {
        name: 'Проверка отсутствия аудио',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод scene.leave не был вызван'
      };
    }
    
    return {
      name: 'Проверка отсутствия аудио',
      category: TestCategory.SCENE,
      success: true,
      message: 'Сцена корректно обрабатывает сообщение без аудио'
    };
  } catch (error) {
    console.error('Ошибка в testLipSyncWizardNoAudio:', error);
    return {
      name: 'Проверка отсутствия аудио',
      category: TestCategory.SCENE,
      success: false,
      message: 'Ошибка при тестировании сообщения без аудио',
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * Тестирует сценарий отсутствия ID пользователя
 * @returns Результат теста
 */
const testLipSyncWizardNoUserId = async (): Promise<TestResult> => {
  console.log('🧪 Запуск testLipSyncWizardNoUserId');
  
  try {
    // Arrange
    const ctx = setupContext({
      language: 'ru',
      messageType: 'text',
      hasAudioFile: true,
      step: 2
    });
    
    // Устанавливаем URL видео в сессии
    ctx.session.videoUrl = TEST_VIDEO_URL;
    
    // Удаляем ID пользователя
    ctx.from = undefined;
    
    // Act
    await invokeHandler(2, ctx);
    
    // Assert
    if (ctx.reply.mock.calls.length === 0) {
      return {
        name: 'Проверка отсутствия ID пользователя',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод reply не был вызван'
      };
    }
    
    const replyText = ctx.replies?.[0]?.text;
    if (!replyText.includes('Ошибка') && !replyText.includes('ID пользователя')) {
      return {
        name: 'Проверка отсутствия ID пользователя',
        category: TestCategory.SCENE,
        success: false,
        message: `Неверное сообщение об ошибке: ${replyText}`
      };
    }
    
    if (!ctx.scene.leave.mock.calls.length) {
      return {
        name: 'Проверка отсутствия ID пользователя',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод scene.leave не был вызван'
      };
    }
    
    return {
      name: 'Проверка отсутствия ID пользователя',
      category: TestCategory.SCENE,
      success: true,
      message: 'Сцена корректно обрабатывает отсутствие ID пользователя'
    };
  } catch (error) {
    console.error('Ошибка в testLipSyncWizardNoUserId:', error);
    return {
      name: 'Проверка отсутствия ID пользователя',
      category: TestCategory.SCENE,
      success: false,
      message: 'Ошибка при тестировании отсутствия ID пользователя',
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * Тестирует сценарий ошибки при генерации липсинка
 * @returns Результат теста
 */
const testLipSyncWizardGenerationError = async (): Promise<TestResult> => {
  console.log('🧪 Запуск testLipSyncWizardGenerationError');
  
  try {
    // Arrange
    const ctx = setupContext({
      language: 'ru',
      messageType: 'text',
      hasAudioFile: true,
      step: 2
    });
    
    // Устанавливаем URL видео в сессии
    ctx.session.videoUrl = TEST_VIDEO_URL;
    
    // Сбрасываем мок и заставляем его вызывать ошибку
    generateLipSyncMock.mockReset();
    generateLipSyncMock.mockRejectedValue(new Error('Ошибка генерации'));
    
    // Act
    await invokeHandler(2, ctx);
    
    // Assert
    if (ctx.reply.mock.calls.length === 0) {
      return {
        name: 'Проверка ошибки генерации',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод reply не был вызван'
      };
    }
    
    const replyText = ctx.replies?.[0]?.text;
    if (!replyText.includes('ошибка') && !replyText.includes('Ошибка') && !replyText.includes('произошла ошибка')) {
      return {
        name: 'Проверка ошибки генерации',
        category: TestCategory.SCENE,
        success: false,
        message: `Неверное сообщение об ошибке: ${replyText}`
      };
    }
    
    if (!ctx.scene.leave.mock.calls.length) {
      return {
        name: 'Проверка ошибки генерации',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод scene.leave не был вызван'
      };
    }
    
    return {
      name: 'Проверка ошибки генерации',
      category: TestCategory.SCENE,
      success: true,
      message: 'Сцена корректно обрабатывает ошибку генерации липсинка'
    };
  } catch (error) {
    console.error('Ошибка в testLipSyncWizardGenerationError:', error);
    return {
      name: 'Проверка ошибки генерации',
      category: TestCategory.SCENE,
      success: false,
      message: 'Ошибка при тестировании ошибки генерации',
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * Выполняет все тесты для lipSyncWizard
 * @returns Массив результатов тестов
 */
export async function runLipSyncWizardTests(): Promise<TestResult[]> {
  console.log('🚀 Запуск всех тестов для lipSyncWizard');
  
  const results: TestResult[] = [];
  
  try {
    // Первый шаг - запрос на отправку видео
    results.push(await testLipSyncWizardFirstStep());
    results.push(await testLipSyncWizardFirstStepEnglish());
    
    // Второй шаг - обработка видео
    results.push(await testLipSyncWizardSecondStepWithUrl());
    results.push(await testLipSyncWizardSecondStepWithVideoFile());
    results.push(await testLipSyncWizardTooLargeVideoFile());
    results.push(await testLipSyncWizardNoVideo());
    
    // Третий шаг - обработка аудио и генерация липсинка
    results.push(await testLipSyncWizardThirdStepWithUrl());
    results.push(await testLipSyncWizardThirdStepWithAudioFile());
    results.push(await testLipSyncWizardThirdStepWithVoiceMessage());
    results.push(await testLipSyncWizardTooLargeAudioFile());
    results.push(await testLipSyncWizardNoAudio());
    results.push(await testLipSyncWizardNoUserId());
    results.push(await testLipSyncWizardGenerationError());
    
    // Выводим сводку результатов
    const successCount = results.filter(r => r.success).length;
    console.log(`✅ Успешно: ${successCount}/${results.length} тестов`);
    
    results.filter(r => !r.success).forEach(r => {
      console.error(`❌ Тест "${r.name}" не прошел: ${r.message}`);
      if (r.error) console.error(`   Ошибка: ${r.error}`);
    });
    
    return results;
  } catch (error) {
    console.error('❌ Критическая ошибка при выполнении тестов:', error);
    results.push({
      name: 'Выполнение всех тестов lipSyncWizard',
      category: TestCategory.SCENE,
      success: false,
      message: 'Критическая ошибка при выполнении тестов',
      error: error instanceof Error ? error.message : String(error)
    });
    
    return results;
  }
}

// Можно вызвать для прогона тестов
// runLipSyncWizardTests().then(results => {
//   console.log(`Всего тестов: ${results.length}`);
//   console.log(`Успешных: ${results.filter(r => r.success).length}`);
//   console.log(`Неудачных: ${results.filter(r => !r.success).length}`);
// });

// Экспортируем тесты для использования в других модулях
export default lipSyncWizardTests;

// Тесты для проверки обработки ошибок
export {
  testEnterLipSyncWizard,
  testEnterLipSyncWizardEnglish,
  testVideoFileUpload,
  testVideoSizeExceeded,
  testVideoUrlSubmission,
  testAudioFileUpload,
  testLipSyncGenerationError
}; 