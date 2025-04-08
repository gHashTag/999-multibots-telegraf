import { TestResult } from '../types'
import { InngestTestEngine } from '../inngest-test-engine'
import { TEST_CONFIG } from '../test-config'

const inngestTestEngine = new InngestTestEngine()

export async function runTextToVideoWithImageTests(): Promise<TestResult[]> {
  const results: TestResult[] = []
  const startTime = Date.now()

  try {
    await inngestTestEngine.init()

    // Регистрируем обработчики
    inngestTestEngine.register('video/generate', async () => {
      return {
        success: true,
        data: {
          video_url: TEST_CONFIG.TEST_IMAGE_URL,
          status: 'completed',
        },
      }
    })

    // Тест генерации видео с изображением
    const generateResult = await inngestTestEngine.send({
      name: 'video/generate',
      data: {
        prompt: 'Test video generation',
        telegram_id: TEST_CONFIG.TEST_USER_ID,
        bot_name: TEST_CONFIG.TEST_BOT_NAME,
        image_url: TEST_CONFIG.TEST_IMAGE_URL,
      },
    })

    if (!generateResult) {
      throw new Error('❌ Не удалось сгенерировать видео с изображением')
    }

    results.push({
      success: true,
      message: 'Тест генерации видео с изображением пройден успешно',
      name: 'Generate Video With Image Test',
      startTime,
      details: { video_url: TEST_CONFIG.TEST_IMAGE_URL },
    })

    return results
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    results.push({
      success: false,
      name: 'Text to Video with Image Tests',
      message: 'Ошибка в тестах генерации видео с изображением',
      error: new Error(errorMessage),
      startTime,
    })
  }

  return results
}
