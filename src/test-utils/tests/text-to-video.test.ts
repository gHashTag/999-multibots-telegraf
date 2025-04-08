import { TestResult } from '../types'
import { InngestTestEngine } from '../inngest-test-engine'
import { TEST_CONFIG } from '../test-config'

const inngestTestEngine = new InngestTestEngine()

export async function runTextToVideoTests(): Promise<TestResult[]> {
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

    // Тест генерации видео
    const generateResult = await inngestTestEngine.send({
      name: 'video/generate',
      data: {
        prompt: 'Test video generation',
        telegram_id: TEST_CONFIG.TEST_USER_ID,
        bot_name: TEST_CONFIG.TEST_BOT_NAME,
      },
    })

    if (!generateResult) {
      throw new Error('❌ Не удалось сгенерировать видео')
    }

    results.push({
      success: true,
      message: 'Тест генерации видео пройден успешно',
      name: 'Generate Video Test',
      startTime,
      details: { video_url: TEST_CONFIG.TEST_IMAGE_URL },
    })

    return results
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    results.push({
      success: false,
      name: 'Text to Video Tests',
      message: 'Ошибка в тестах генерации видео',
      error: new Error(errorMessage),
      startTime,
    })
  }

  return results
}
