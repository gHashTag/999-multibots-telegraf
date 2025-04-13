import path from 'path'
import { TelegramId } from '@/interfaces/telegram.interface'
import { logger } from '@/utils/logger'
import { API_URL } from '@/config'
import { processApiResponse } from '@/helpers/processApiResponse'
import { replicate } from '@/core/replicate'
import { saveFileLocally } from '@/helpers'
import dotenv from 'dotenv'

dotenv.config()

/**
 * Тестовая функция для генерации нейрофото без списания средств
 */
async function testGenerateNeuroPhoto(
  prompt: string,
  model_url: string,
  numImages: number,
  telegram_id: TelegramId
): Promise<{ success: boolean; urls?: string[]; error?: string }> {
  const generatedUrls: string[] = []

  logger.info({
    message: '🚀 [TEST] Начало тестовой генерации Neurophoto',
    description: 'Starting test NeuroPhoto generation',
    prompt: prompt.substring(0, 50) + '...',
    model_url,
    numImages,
    telegram_id,
  })

  try {
    // Убедимся что numImages имеет разумное значение
    const validNumImages = numImages && numImages > 0 ? numImages : 1

    // Генерируем изображения
    for (let i = 0; i < validNumImages; i++) {
      console.log(`🎨 Генерация изображения ${i + 1}/${validNumImages}...`)

      try {
        const aspect_ratio = '1:1'

        logger.info({
          message: '🎨 [TEST] Запускаем тестовую генерацию изображения',
          description: 'Starting test image generation',
          telegram_id,
          prompt: prompt.substring(0, 50) + '...',
          model_url,
        })

        // Настраиваем параметры для модели
        const input = {
          prompt: `${prompt}. Cinematic Lighting, realistic, intricate details, extremely detailed, incredible details, full colored, complex details, insanely detailed and intricate, hypermaximalist, extremely detailed with rich colors. Masterpiece, best quality, aerial view, HDR, UHD, unreal engine, Representative, fair skin, beautiful face, Rich in details, high quality, gorgeous, glamorous, 8K, super detail, gorgeous light and shadow, detailed decoration, detailed lines.`,
          negative_prompt: 'nsfw, erotic, violence, bad anatomy...',
          num_inference_steps: 40,
          guidance_scale: 3,
          lora_scale: 1,
          megapixels: '1',
          output_quality: 80,
          prompt_strength: 0.8,
          extra_lora_scale: 1,
          go_fast: false,
          width: 1024,
          height: 1024,
          sampler: 'flowmatch',
          num_outputs: 1,
          aspect_ratio,
        }

        // Выполняем запрос к API
        const output = await replicate.run(model_url as `${string}/${string}`, {
          input,
        })

        const imageUrl = await processApiResponse(output)

        if (!imageUrl) {
          throw new Error('Image generation failed')
        }

        // Сохраняем изображение локально
        const localPath = await saveFileLocally(
          telegram_id,
          imageUrl,
          'neuro-photo',
          '.jpeg'
        )

        logger.info({
          message: '✅ [TEST] Изображение успешно сгенерировано',
          description: 'Image successfully generated (test)',
          imageUrl,
          localPath,
        })

        const publicUrl = `${API_URL}/uploads/${telegram_id}/neuro-photo/${path.basename(
          localPath.toString()
        )}`
        generatedUrls.push(publicUrl)

        console.log(
          `✅ Изображение ${i + 1} успешно сгенерировано: ${publicUrl}`
        )
      } catch (genError) {
        logger.error({
          message: '❌ [TEST] Ошибка при генерации изображения',
          description: 'Error generating image (test)',
          error: genError instanceof Error ? genError.message : 'Unknown error',
          prompt: prompt.substring(0, 50) + '...',
          telegram_id,
          index: i,
        })

        console.error(
          `❌ Ошибка при генерации изображения ${i + 1}: ${genError instanceof Error ? genError.message : 'Unknown error'}`
        )
      }
    }

    if (generatedUrls.length === 0) {
      return {
        success: false,
        error: 'Не удалось сгенерировать ни одного изображения',
      }
    }

    logger.info({
      message: '🎉 [TEST] Все задачи на генерацию успешно выполнены',
      description: 'All generation tasks successfully completed (test)',
      urlsCount: generatedUrls.length,
      telegram_id,
    })

    return {
      success: true,
      urls: generatedUrls,
    }
  } catch (error) {
    logger.error({
      message: '❌ [TEST] Критическая ошибка при тестовой генерации нейрофото',
      description: 'Critical error during test neurophoto generation',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      telegram_id,
    })

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// Запускаем тест
export async function runTest() {
  const TEST_TELEGRAM_ID = process.env.TEST_TELEGRAM_ID || '12345678'

  console.log('🚀 Запуск теста генерации нейрофото без списания средств...')

  // URL модели на Replicate
  const MODEL_URL =
    'ghashtag/neuro_coder_flux-dev-lora:5ff9ea5918427540563f09940bf95d6efc16b8ce9600e82bb17c2b188384e355'

  const gqPrompt =
    'NEUROCODER professional portrait photograph of a stylish man, high fashion GQ magazine cover, close-up face, professional studio lighting, sharp facial features, portrait orientation, 8k, high resolution, perfect details, fashion photography, professional retouching, cinematic lighting, dramatic shadows, professional DSLR'

  const result = await testGenerateNeuroPhoto(
    gqPrompt,
    MODEL_URL,
    1, // numImages
    TEST_TELEGRAM_ID
  )

  if (result.success) {
    console.log('✅ Тест успешно завершен!')
    console.log(`📷 Сгенерировано изображений: ${result.urls?.length}`)
    console.log('🔍 Проверьте папку uploads для просмотра результатов.')

    if (result.urls) {
      console.log('\n📸 Сгенерированные изображения:')
      result.urls.forEach((url, index) => {
        console.log(`${index + 1}. ${url}`)
      })
    }
  } else {
    console.error(`❌ Тест не пройден: ${result.error}`)
  }
}

// Запускаем тест
runTest().catch(error => {
  console.error('❌ Ошибка при выполнении теста:', error)
  process.exit(1)
})
