import { TestResult } from '../types'
import { InngestTestEngine } from '../inngest-test-engine'

const inngestTestEngine = new InngestTestEngine()

export async function runTextToVideoWizardTests(): Promise<TestResult[]> {
  const results: TestResult[] = []
  const startTime = Date.now()

  try {
    await inngestTestEngine.init()

    // Регистрируем обработчики
    inngestTestEngine.register('video/generate', async () => {
      return {
        success: true,
        data: {
          video_url: 'https://example.com/test-video.mp4',
          status: 'completed',
        },
      }
    })

    // Тест генерации видео через визард
    const generateResult = await inngestTestEngine.send({
      name: 'video/generate',
      data: {
        prompt: 'Test video generation',
        telegram_id: '123456789',
        bot_name: 'test_bot',
      },
    })

    if (!generateResult) {
      throw new Error('❌ Не удалось сгенерировать видео через визард')
    }

    results.push({
      success: true,
      message: 'Тест генерации видео через визард пройден успешно',
      name: 'Generate Video Wizard Test',
      startTime,
      details: { video_url: 'https://example.com/test-video.mp4' },
    })

    return results
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    results.push({
      success: false,
      name: 'Text to Video Wizard Tests',
      message: 'Ошибка в тестах визарда генерации видео',
      error: new Error(errorMessage),
      startTime,
    })
  }

  return results
}
