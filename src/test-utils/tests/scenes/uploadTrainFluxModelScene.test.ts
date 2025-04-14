import { Scenes } from 'telegraf'
import { Message, Update } from 'telegraf/typings/core/types/typegram'
import { MyContext } from '../../../interfaces'
import { uploadTrainFluxModelScene } from '../../../scenes/uploadTrainFluxModelScene'

// Определяем типы для моков
type MockFunction<T = any> = jest.MockedFunction<T> & {
  mockClear: () => void;
  mockReset: () => void;
  mockRestore: () => void;
  mockReturnValue: (val: any) => MockFunction<T>;
  mockResolvedValue: (val: any) => MockFunction<T>;
  mockRejectedValue: (val: any) => MockFunction<T>;
}

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

// Утилиты для логирования
const logInfo = (message: string): void => {
  console.log(message);
};

const logError = (message: string, error: unknown): void => {
  console.error(message, error);
};

// Константы для тестирования
const USERNAME = 'test_user'
const MODEL_NAME = 'test_model'
const STEPS = 1500
const TARGET_USER_ID = 12345
const IMAGES = ['image1.jpg', 'image2.jpg']
const ZIP_PATH = '/tmp/test_archive.zip'
const BOT_USERNAME = 'test_bot'

// Определение типов для мокирования
interface TestContext extends MyContext {
  mockCreateImagesZip: MockFunction
  mockEnsureSupabaseAuth: MockFunction
  mockCreateModelTraining: MockFunction
  mockIsRussian: MockFunction
  mockDeleteFile: MockFunction
}

// Вспомогательная функция для создания контекста с моками
function setupContext(isRussian = true): TestContext {
  const mockCreateImagesZip = createMockFunction<typeof import('../../../helpers/images/createImagesZip').createImagesZip>()
  const mockEnsureSupabaseAuth = createMockFunction<typeof import('../../../core/supabase').ensureSupabaseAuth>()
  const mockCreateModelTraining = createMockFunction<typeof import('../../../services/createModelTraining').createModelTraining>()
  const mockIsRussian = createMockFunction<typeof import('../../../helpers/language').isRussian>().mockReturnValue(isRussian)
  const mockDeleteFile = createMockFunction<typeof import('../../../helpers').deleteFile>()

  mockCreateImagesZip.mockResolvedValue(ZIP_PATH)
  mockEnsureSupabaseAuth.mockResolvedValue(undefined)
  mockCreateModelTraining.mockResolvedValue(undefined)
  mockDeleteFile.mockResolvedValue(undefined)

  const ctx = createMockContext<TestContext>({
    session: {
      username: USERNAME,
      modelName: MODEL_NAME,
      steps: STEPS,
      targetUserId: TARGET_USER_ID,
      images: IMAGES
    },
    botInfo: {
      username: BOT_USERNAME
    } as any
  })

  ctx.mockCreateImagesZip = mockCreateImagesZip
  ctx.mockEnsureSupabaseAuth = mockEnsureSupabaseAuth
  ctx.mockCreateModelTraining = mockCreateModelTraining
  ctx.mockIsRussian = mockIsRussian
  ctx.mockDeleteFile = mockDeleteFile

  // Переопределение импортированных модулей
  jest.mock('../../../helpers/images/createImagesZip', () => ({
    createImagesZip: mockCreateImagesZip
  }))
  jest.mock('../../../core/supabase', () => ({
    ensureSupabaseAuth: mockEnsureSupabaseAuth
  }))
  jest.mock('../../../services/createModelTraining', () => ({
    createModelTraining: mockCreateModelTraining
  }))
  jest.mock('../../../helpers/language', () => ({
    isRussian: mockIsRussian
  }))
  jest.mock('../../../helpers', () => ({
    deleteFile: mockDeleteFile
  }))

  return ctx
}

// Вспомогательная функция для вызова обработчика
async function invokeEnterHandler(ctx: MyContext) {
  const middlewares = uploadTrainFluxModelScene.enterMiddleware;
  if (middlewares && middlewares.length > 0) {
    const handler = middlewares[0];
    await handler(ctx, () => Promise.resolve());
  } else {
    throw new Error('Enter handler not found');
  }
}

/**
 * Тестирует успешное создание архива и запуск обучения модели на русском языке
 */
async function testUploadTrainFluxModelScene_Success_Russian() {
  const TEST_NAME = 'testUploadTrainFluxModelScene_Success_Russian'
  const CATEGORY = 'uploadTrainFluxModelScene'
  
  logInfo(`🔄 Запуск теста: ${TEST_NAME}`)
  
  try {
    // Arrange
    const ctx = setupContext(true) // русский язык
    
    // Act
    await invokeEnterHandler(ctx)
    
    // Assert
    const expectedReplies = [
      '⏳ Создаю архив...',
      '⏳ Загружаю архив...',
      '✅ Архив успешно загружен! Начинаю обучение модели...',
      '⏳ Начинаю обучение модели...\n\nВаша модель будет натренирована через 1-2 часа. После завершения вы сможете проверить её работу, используя раздел "Модели" в Нейрофото.'
    ]
    
    // Проверяем, что все сообщения были отправлены в правильном порядке
    expect(ctx.reply).toHaveBeenCalledTimes(expectedReplies.length)
    expectedReplies.forEach((text, index) => {
      expect(ctx.reply).toHaveBeenNthCalledWith(index + 1, text)
    })
    
    // Проверяем, что createImagesZip был вызван с правильными параметрами
    expect(ctx.mockCreateImagesZip).toHaveBeenCalledWith(IMAGES)
    
    // Проверяем, что createModelTraining был вызван с правильными параметрами
    expect(ctx.mockCreateModelTraining).toHaveBeenCalledWith(
      {
        filePath: ZIP_PATH,
        triggerWord: USERNAME.toLocaleUpperCase(),
        modelName: MODEL_NAME,
        steps: STEPS,
        telegram_id: TARGET_USER_ID.toString(),
        is_ru: true,
        botName: BOT_USERNAME,
      },
      ctx
    )
    
    // Проверяем, что scene.leave был вызван (сцена завершена)
    expect(ctx.scene.leave).toHaveBeenCalled()
    
    logInfo(`✅ Тест прошел успешно: ${TEST_NAME}`)
    return { testName: TEST_NAME, category: CATEGORY, success: true, message: 'Успешное создание архива и запуск обучения модели на русском языке' }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError(`❌ Тест провален: ${TEST_NAME}`, error)
    return { testName: TEST_NAME, category: CATEGORY, success: false, message: `Ошибка: ${errorMessage}` }
  }
}

/**
 * Тестирует успешное создание архива и запуск обучения модели на английском языке
 */
async function testUploadTrainFluxModelScene_Success_English() {
  const TEST_NAME = 'testUploadTrainFluxModelScene_Success_English'
  const CATEGORY = 'uploadTrainFluxModelScene'
  
  logInfo(`🔄 Запуск теста: ${TEST_NAME}`)
  
  try {
    // Arrange
    const ctx = setupContext(false) // английский язык
    
    // Act
    await invokeEnterHandler(ctx)
    
    // Assert
    const expectedReplies = [
      '⏳ Creating archive...',
      '⏳ Uploading archive...',
      '✅ Archive uploaded successfully! Starting model training...',
      '⏳ Starting model training...\n\nYour model will be trained in 1-2 hours. Once completed, you can check its performance using the "Models" section in Neurophoto.'
    ]
    
    // Проверяем, что все сообщения были отправлены в правильном порядке
    expect(ctx.reply).toHaveBeenCalledTimes(expectedReplies.length)
    expectedReplies.forEach((text, index) => {
      expect(ctx.reply).toHaveBeenNthCalledWith(index + 1, text)
    })
    
    // Проверяем, что createImagesZip был вызван с правильными параметрами
    expect(ctx.mockCreateImagesZip).toHaveBeenCalledWith(IMAGES)
    
    // Проверяем, что createModelTraining был вызван с правильными параметрами
    expect(ctx.mockCreateModelTraining).toHaveBeenCalledWith(
      {
        filePath: ZIP_PATH,
        triggerWord: USERNAME.toLocaleUpperCase(),
        modelName: MODEL_NAME,
        steps: STEPS,
        telegram_id: TARGET_USER_ID.toString(),
        is_ru: false,
        botName: BOT_USERNAME,
      },
      ctx
    )
    
    // Проверяем, что scene.leave был вызван (сцена завершена)
    expect(ctx.scene.leave).toHaveBeenCalled()
    
    logInfo(`✅ Тест прошел успешно: ${TEST_NAME}`)
    return { testName: TEST_NAME, category: CATEGORY, success: true, message: 'Успешное создание архива и запуск обучения модели на английском языке' }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError(`❌ Тест провален: ${TEST_NAME}`, error)
    return { testName: TEST_NAME, category: CATEGORY, success: false, message: `Ошибка: ${errorMessage}` }
  }
}

/**
 * Тестирует обработку ошибки при создании ZIP-архива
 */
async function testUploadTrainFluxModelScene_ZipCreationError() {
  const TEST_NAME = 'testUploadTrainFluxModelScene_ZipCreationError'
  const CATEGORY = 'uploadTrainFluxModelScene'
  
  logInfo(`🔄 Запуск теста: ${TEST_NAME}`)
  
  try {
    // Arrange
    const ctx = setupContext(true)
    const errorMessage = 'Error creating ZIP file'
    ctx.mockCreateImagesZip.mockRejectedValue(new Error(errorMessage))
    
    // Act
    await invokeEnterHandler(ctx)
    
    // Assert
    // Проверяем, что было отправлено только первое сообщение (о создании архива)
    expect(ctx.reply).toHaveBeenCalledTimes(1)
    expect(ctx.reply).toHaveBeenCalledWith('⏳ Создаю архив...')
    
    // Проверяем, что createImagesZip был вызван с правильными параметрами
    expect(ctx.mockCreateImagesZip).toHaveBeenCalledWith(IMAGES)
    
    // Проверяем, что остальные функции не вызывались
    expect(ctx.mockCreateModelTraining).not.toHaveBeenCalled()
    
    // Проверяем, что scene.leave был вызван (сцена завершена)
    expect(ctx.scene.leave).toHaveBeenCalled()
    
    logInfo(`✅ Тест прошел успешно: ${TEST_NAME}`)
    return { testName: TEST_NAME, category: CATEGORY, success: true, message: 'Корректная обработка ошибки при создании ZIP-архива' }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError(`❌ Тест провален: ${TEST_NAME}`, error)
    return { testName: TEST_NAME, category: CATEGORY, success: false, message: `Ошибка: ${errorMessage}` }
  }
}

/**
 * Тестирует обработку ошибки при пустом triggerWord (username)
 */
async function testUploadTrainFluxModelScene_EmptyTriggerWord() {
  const TEST_NAME = 'testUploadTrainFluxModelScene_EmptyTriggerWord'
  const CATEGORY = 'uploadTrainFluxModelScene'
  
  logInfo(`🔄 Запуск теста: ${TEST_NAME}`)
  
  try {
    // Arrange
    const ctx = setupContext(true)
    ctx.session.username = ''
    
    // Act
    await invokeEnterHandler(ctx)
    
    // Assert
    const expectedReplies = [
      '⏳ Создаю архив...',
      '⏳ Загружаю архив...',
      '❌ Некорректный trigger word'
    ]
    
    // Проверяем, что сообщения были отправлены в правильном порядке
    expect(ctx.reply).toHaveBeenCalledTimes(expectedReplies.length)
    expectedReplies.forEach((text, index) => {
      expect(ctx.reply).toHaveBeenNthCalledWith(index + 1, text)
    })
    
    // Проверяем, что createModelTraining не был вызван
    expect(ctx.mockCreateModelTraining).not.toHaveBeenCalled()
    
    // Проверяем, что scene.leave был вызван (сцена завершена)
    expect(ctx.scene.leave).toHaveBeenCalled()
    
    logInfo(`✅ Тест прошел успешно: ${TEST_NAME}`)
    return { testName: TEST_NAME, category: CATEGORY, success: true, message: 'Корректная обработка ошибки при пустом triggerWord' }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError(`❌ Тест провален: ${TEST_NAME}`, error)
    return { testName: TEST_NAME, category: CATEGORY, success: false, message: `Ошибка: ${errorMessage}` }
  }
}

/**
 * Тестирует обработку ошибки при обучении модели
 */
async function testUploadTrainFluxModelScene_TrainingError() {
  const TEST_NAME = 'testUploadTrainFluxModelScene_TrainingError'
  const CATEGORY = 'uploadTrainFluxModelScene'
  
  logInfo(`🔄 Запуск теста: ${TEST_NAME}`)
  
  try {
    // Arrange
    const ctx = setupContext(true)
    const errorMessage = 'Error training model'
    ctx.mockCreateModelTraining.mockRejectedValue(new Error(errorMessage))
    
    // Act
    await invokeEnterHandler(ctx)
    
    // Assert
    const expectedReplies = [
      '⏳ Создаю архив...',
      '⏳ Загружаю архив...',
      '✅ Архив успешно загружен! Начинаю обучение модели...',
      '⏳ Начинаю обучение модели...\n\nВаша модель будет натренирована через 1-2 часа. После завершения вы сможете проверить её работу, используя раздел "Модели" в Нейрофото.'
    ]
    
    // Проверяем, что все сообщения были отправлены в правильном порядке
    expect(ctx.reply).toHaveBeenCalledTimes(expectedReplies.length)
    expectedReplies.forEach((text, index) => {
      expect(ctx.reply).toHaveBeenNthCalledWith(index + 1, text)
    })
    
    // Проверяем, что createModelTraining был вызван с правильными параметрами
    expect(ctx.mockCreateModelTraining).toHaveBeenCalled()
    
    // Проверяем, что scene.leave был вызван (сцена завершена)
    expect(ctx.scene.leave).toHaveBeenCalled()
    
    logInfo(`✅ Тест прошел успешно: ${TEST_NAME}`)
    return { testName: TEST_NAME, category: CATEGORY, success: true, message: 'Корректная обработка ошибки при обучении модели' }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError(`❌ Тест провален: ${TEST_NAME}`, error)
    return { testName: TEST_NAME, category: CATEGORY, success: false, message: `Ошибка: ${errorMessage}` }
  }
}

/**
 * Запускает все тесты uploadTrainFluxModelScene
 */
export async function runUploadTrainFluxModelSceneTests() {
  const results = await Promise.all([
    testUploadTrainFluxModelScene_Success_Russian(),
    testUploadTrainFluxModelScene_Success_English(),
    testUploadTrainFluxModelScene_ZipCreationError(),
    testUploadTrainFluxModelScene_EmptyTriggerWord(),
    testUploadTrainFluxModelScene_TrainingError()
  ])
  
  logInfo(`
📊 Результаты тестирования uploadTrainFluxModelScene:
✅ Успешно: ${results.filter(r => r.success).length}
❌ Провалено: ${results.filter(r => !r.success).length}
`)
  
  return results
}

// Запуск тестов
runUploadTrainFluxModelSceneTests()