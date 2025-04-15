import { Scenes } from 'telegraf'
import { MyContext } from '../../../interfaces'
import { createImagesZip } from '../../../helpers/images/createImagesZip'
import { ensureSupabaseAuth } from '../../../core/supabase'
import { createModelTraining } from '@/services/createModelTraining'
import { isRussian } from '@/helpers/language'
import { deleteFile } from '@/helpers'
import { uploadTrainFluxModelScene } from '../../../scenes/uploadTrainFluxModelScene'
import { createMockContext } from '../../mocks/context'
import { MockFunction } from '../../types/MockFunction'
import { TestResult } from '../../types'

// Мокируем зависимые модули
jest.mock('../../../helpers/images/createImagesZip')
jest.mock('../../../core/supabase')
jest.mock('@/services/createModelTraining')
jest.mock('@/helpers/language')
jest.mock('@/helpers')

// Константы для тестов
const MOCK_ZIP_PATH = '/tmp/test-images.zip'
const MOCK_USERNAME = 'testuser'
const MOCK_MODEL_NAME = 'testmodel'
const MOCK_STEPS = 1000
const MOCK_USER_ID = 123456
const MOCK_BOT_NAME = 'testbot'

// Функция для настройки и возврата контекста
function setupContext(isRussianLang: boolean = true) {
  const mockIsRussian = isRussian as jest.MockedFunction<typeof isRussian>
  mockIsRussian.mockReturnValue(isRussianLang)

  const mockCreateImagesZip = createImagesZip as jest.MockedFunction<
    typeof createImagesZip
  >
  mockCreateImagesZip.mockResolvedValue(MOCK_ZIP_PATH)

  const mockEnsureSupabaseAuth = ensureSupabaseAuth as jest.MockedFunction<
    typeof ensureSupabaseAuth
  >
  mockEnsureSupabaseAuth.mockResolvedValue(undefined)

  const mockCreateModelTraining = createModelTraining as jest.MockedFunction<
    typeof createModelTraining
  >
  mockCreateModelTraining.mockResolvedValue(undefined)

  const mockDeleteFile = deleteFile as jest.MockedFunction<typeof deleteFile>
  mockDeleteFile.mockResolvedValue(undefined)

  const ctx = createMockContext() as any
  ctx.scene = {
    enter: jest.fn(),
    leave: jest.fn(),
    reenter: jest.fn(),
  }
  ctx.reply = jest.fn()
  ctx.botInfo = {
    username: MOCK_BOT_NAME,
  }
  ctx.session = {
    images: ['image1.jpg', 'image2.jpg'],
    username: MOCK_USERNAME,
    modelName: MOCK_MODEL_NAME,
    steps: MOCK_STEPS,
    targetUserId: MOCK_USER_ID,
  }

  return ctx
}

describe('uploadTrainFluxModelScene Tests', () => {
  let context: MyContext

  beforeEach(() => {
    context = createMockContext({
      session: {
        images: ['image1.jpg', 'image2.jpg'],
        username: 'testuser',
        modelName: 'TestModel',
        steps: 1000,
        targetUserId: 123456789,
      },
      botInfo: {
        username: 'testbot',
      },
    })

    // Сбрасываем моки перед каждым тестом
    jest.clearAllMocks()
    mockCreateImagesZip.mockResolvedValue('test/path/archive.zip')
    mockCreateModelTraining.mockResolvedValue(undefined)
  })

  const testUploadTrainFluxModelScene_Success =
    async (): Promise<TestResult> => {
      console.log('🧪 Starting testUploadTrainFluxModelScene_Success')
      try {
        mockIsRussian.mockReturnValue(true)

        // Вызываем enter handler сцены
        await context.scene.enter('uploadTrainFluxModelScene')

        // Проверяем, что все сообщения были отправлены
        expect(context.reply).toHaveBeenCalledWith('⏳ Создаю архив...')
        expect(context.reply).toHaveBeenCalledWith('⏳ Загружаю архив...')
        expect(context.reply).toHaveBeenCalledWith(
          '✅ Архив успешно загружен! Начинаю обучение модели...'
        )

        // Проверяем, что функции были вызваны с правильными параметрами
        expect(mockCreateImagesZip).toHaveBeenCalledWith([
          'image1.jpg',
          'image2.jpg',
        ])
        expect(mockCreateModelTraining).toHaveBeenCalledWith(
          {
            filePath: 'test/path/archive.zip',
            triggerWord: 'TESTUSER',
            modelName: 'TestModel',
            steps: 1000,
            telegram_id: '123456789',
            is_ru: true,
            botName: 'testbot',
          },
          context
        )

        return {
          name: 'testUploadTrainFluxModelScene_Success',
          category: 'uploadTrainFluxModelScene',
          success: true,
          message:
            '✅ Successfully tested uploadTrainFluxModelScene with Russian language',
        }
      } catch (error) {
        console.error(
          '❌ Error in testUploadTrainFluxModelScene_Success:',
          error
        )
        return {
          name: 'testUploadTrainFluxModelScene_Success',
          category: 'uploadTrainFluxModelScene',
          success: false,
          message: `❌ Test failed: ${error.message}`,
        }
      }
    }

  const testUploadTrainFluxModelScene_English =
    async (): Promise<TestResult> => {
      console.log('🧪 Starting testUploadTrainFluxModelScene_English')
      try {
        mockIsRussian.mockReturnValue(false)

        await context.scene.enter('uploadTrainFluxModelScene')

        expect(context.reply).toHaveBeenCalledWith('⏳ Creating archive...')
        expect(context.reply).toHaveBeenCalledWith('⏳ Uploading archive...')
        expect(context.reply).toHaveBeenCalledWith(
          '✅ Archive uploaded successfully! Starting model training...'
        )

        return {
          name: 'testUploadTrainFluxModelScene_English',
          category: 'uploadTrainFluxModelScene',
          success: true,
          message:
            '✅ Successfully tested uploadTrainFluxModelScene with English language',
        }
      } catch (error) {
        console.error(
          '❌ Error in testUploadTrainFluxModelScene_English:',
          error
        )
        return {
          name: 'testUploadTrainFluxModelScene_English',
          category: 'uploadTrainFluxModelScene',
          success: false,
          message: `❌ Test failed: ${error.message}`,
        }
      }
    }

  const testUploadTrainFluxModelScene_Error = async (): Promise<TestResult> => {
    console.log('🧪 Starting testUploadTrainFluxModelScene_Error')
    try {
      mockIsRussian.mockReturnValue(true)
      mockCreateImagesZip.mockRejectedValue(new Error('Failed to create ZIP'))

      await context.scene.enter('uploadTrainFluxModelScene')

      expect(context.reply).toHaveBeenCalledWith('⏳ Создаю архив...')
      expect(context.scene.leave).toHaveBeenCalled()

      return {
        name: 'testUploadTrainFluxModelScene_Error',
        category: 'uploadTrainFluxModelScene',
        success: true,
        message:
          '✅ Successfully tested error handling in uploadTrainFluxModelScene',
      }
    } catch (error) {
      console.error('❌ Error in testUploadTrainFluxModelScene_Error:', error)
      return {
        name: 'testUploadTrainFluxModelScene_Error',
        category: 'uploadTrainFluxModelScene',
        success: false,
        message: `❌ Test failed: ${error.message}`,
      }
    }
  }

  const testUploadTrainFluxModelScene_InvalidTriggerWord =
    async (): Promise<TestResult> => {
      console.log(
        '🧪 Starting testUploadTrainFluxModelScene_InvalidTriggerWord'
      )
      try {
        mockIsRussian.mockReturnValue(true)
        context.session.username = ''

        await context.scene.enter('uploadTrainFluxModelScene')

        expect(context.reply).toHaveBeenCalledWith(
          '❌ Некорректный trigger word'
        )
        expect(context.scene.leave).toHaveBeenCalled()

        return {
          name: 'testUploadTrainFluxModelScene_InvalidTriggerWord',
          category: 'uploadTrainFluxModelScene',
          success: true,
          message: '✅ Successfully tested invalid trigger word handling',
        }
      } catch (error) {
        console.error(
          '❌ Error in testUploadTrainFluxModelScene_InvalidTriggerWord:',
          error
        )
        return {
          name: 'testUploadTrainFluxModelScene_InvalidTriggerWord',
          category: 'uploadTrainFluxModelScene',
          success: false,
          message: `❌ Test failed: ${error.message}`,
        }
      }
    }

  // Функция для запуска всех тестов
  export const runUploadTrainFluxModelSceneTests = async (): Promise<
    TestResult[]
  > => {
    console.log('🚀 Running all uploadTrainFluxModelScene tests')
    const results = await Promise.all([
      testUploadTrainFluxModelScene_Success(),
      testUploadTrainFluxModelScene_English(),
      testUploadTrainFluxModelScene_Error(),
      testUploadTrainFluxModelScene_InvalidTriggerWord(),
    ])
    console.log('✅ All uploadTrainFluxModelScene tests completed')
    return results
  }
})
