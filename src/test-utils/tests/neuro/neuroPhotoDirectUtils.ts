import { v4 as uuidv4 } from 'uuid'
import { generateNeuroPhotoDirect } from '../../../services/generateNeuroPhotoDirect'
import { logger } from '../../../utils/logger'
import { Telegraf } from 'telegraf'
import { config } from 'dotenv'

// Используем ModeEnum напрямую
const ModeEnum = {
  NeuroPhoto: 'neurophoto',
}

// Загружаем переменные окружения
config()

// Экспортируем интерфейс для тестового ввода
export interface NeuroPhotoDirectTestInput {
  prompt: string
  model_url: string
  numImages: number
  telegram_id: string
  username: string
  is_ru: string
  bot_name?: string
}

// Интерфейс для результатов тестирования
export interface SimpleTestResult {
  success: boolean
  message: string
  name: string
  error?: string
  details?: {
    urls?: string[]
    [key: string]: any
  }
}

// Настройка Telegram-бота для отправки результатов
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID || ''
const bot = BOT_TOKEN ? new Telegraf(BOT_TOKEN) : null

/**
 * Генерирует случайный креативный промпт для NeuroPhoto
 * @returns {string} промпт
 */
export const generateCreativePrompt = (): string => {
  const subjects = [
    'handsome businessman in luxury suit',
    'elegant model with perfect facial features',
    'confident male model with strong jawline',
    'stylish entrepreneur with sophisticated look',
    'attractive man with charismatic smile',
    'professional male model with defined facial features',
    'fashionable gentleman in tailored outfit',
    'photogenic male with striking features',
    'sophisticated executive in premium attire',
    'charming male model with perfect bone structure',
  ]

  const poses = [
    'looking directly at camera',
    'with confident pose',
    'with slight smile',
    'with serious expression',
    'with head slightly tilted',
    'with penetrating gaze',
    'with professional posture',
    'with charismatic expression',
    'with determined look',
    'with friendly but professional expression',
  ]

  const styles = [
    'GQ cover style photoshoot',
    'professional magazine cover lighting',
    'high-end fashion editorial style',
    'luxury brand advertisement look',
    'premium magazine portrait style',
    'executive portrait photography',
    'professional headshot style',
    'high contrast fashion photography',
    'sophisticated magazine feature',
    'corporate leader portrait style',
  ]

  const lighting = [
    'with perfect studio lighting',
    'with dramatic side lighting',
    'with professional three-point lighting',
    'with soft beauty lighting',
    'with glamour portrait lighting',
    'with cinematic lighting setup',
    'with professional flash photography',
    'with premium portrait lighting',
    'with perfect face illumination',
    'with magazine quality lighting',
  ]

  const quality = [
    'ultra detailed, sharp focus on face',
    '4k resolution, perfect clarity',
    'professional photography, high definition',
    'studio quality, flawless details',
    'crisp details, professional retouching',
    'perfect exposure, stunning details',
    'high fashion quality, sharp focus',
    'commercial photography standard, pristine details',
    'photorealistic quality, stunning resolution',
    'portrait perfection, lifelike details',
  ]

  // Выбираем случайные элементы из каждой категории
  const randomSubject = subjects[Math.floor(Math.random() * subjects.length)]
  const randomPose = poses[Math.floor(Math.random() * poses.length)]
  const randomStyle = styles[Math.floor(Math.random() * styles.length)]
  const randomLighting = lighting[Math.floor(Math.random() * lighting.length)]
  const randomQuality = quality[Math.floor(Math.random() * quality.length)]

  // Формируем промпт
  return `NEUROCODER ${randomSubject}, ${randomPose}, ${randomStyle}, ${randomLighting}, ${randomQuality}, portrait orientation, head and shoulders framing, face clearly visible`
}

/**
 * Генерирует случайный промпт для интерьеров и дизайна для NeuroPhoto
 * @returns {string} промпт
 */
export function generateDesignPrompt(): string {
  const designs = [
    'sleek modern website design',
    'elegant mobile app interface',
    'minimalist logo design',
    'professional business card layout',
    'luxury brand identity',
    'modern UI dashboard',
    'clean web application interface',
    'corporate branding elements',
    'premium product package design',
    'high-end digital marketing material',
  ]

  const styles = [
    'with modern typography',
    'with luxury color palette',
    'with professional layout',
    'with elegant visual hierarchy',
    'with sophisticated design elements',
    'with premium visual balance',
    'with perfect proportions',
    'with strategic negative space',
    'with expert color theory application',
    'with refined design aesthetics',
  ]

  const elements = [
    'incorporating geometric elements',
    'using subtle gradient transitions',
    'featuring professional iconography',
    'with balanced composition',
    'with cohesive visual language',
    'with strategic brand positioning',
    'with thoughtful UX considerations',
    'with polished visual details',
    'with innovative design solutions',
    'with intuitive navigation elements',
  ]

  const quality = [
    'high resolution mockup',
    'professional design presentation',
    'detailed design specifications',
    'pixel-perfect execution',
    'industry-standard quality',
    'print-ready resolution',
    'premium design quality',
    'perfect for professional portfolio',
    'showcase quality presentation',
    'client presentation ready',
  ]

  // Выбираем случайные элементы из каждой категории
  const randomDesign = designs[Math.floor(Math.random() * designs.length)]
  const randomStyle = styles[Math.floor(Math.random() * styles.length)]
  const randomElement = elements[Math.floor(Math.random() * elements.length)]
  const randomQuality = quality[Math.floor(Math.random() * quality.length)]

  // Формируем промпт
  return `NEUROCODER ${randomDesign}, ${randomStyle}, ${randomElement}, ${randomQuality}, clean background, perfect composition, highly detailed`
}

/**
 * Генерирует случайный промпт для архитектуры для NeuroPhoto
 * @returns {string} промпт
 */
export function generateArchitecturePrompt(): string {
  const buildings = [
    'modern luxury residence',
    'contemporary urban skyscraper',
    'innovative commercial building',
    'elegant residential complex',
    'cutting-edge corporate headquarters',
    'sustainable architectural design',
    'high-end urban apartment building',
    'futuristic architectural concept',
    'premium hotel exterior design',
    'sophisticated mixed-use development',
  ]

  const styles = [
    'minimalist architectural style',
    'with clean geometric lines',
    'featuring glass and steel elements',
    'with innovative structural design',
    'combining form and function perfectly',
    'with sustainable design features',
    'with dramatic architectural statement',
    'with perfect proportions and balance',
    'with striking visual impact',
    'with harmonious integration to surroundings',
  ]

  const contexts = [
    'in urban setting',
    'against dramatic skyline',
    'in perfect natural environment',
    'with professional landscaping',
    'in evening lighting',
    'with perfect sky background',
    'showcasing innovative materials',
    'highlighting structural elegance',
    'emphasizing spatial relationships',
    'with perfect perspective view',
  ]

  const quality = [
    'architectural visualization',
    'high-resolution 3D render',
    'photorealistic quality',
    'professional architectural photography style',
    'detailed structural elements',
    'professional lighting and shadows',
    'perfect material textures',
    'studio quality presentation',
    'architectural competition standard',
    'portfolio showcase quality',
  ]

  // Выбираем случайные элементы из каждой категории
  const randomBuilding = buildings[Math.floor(Math.random() * buildings.length)]
  const randomStyle = styles[Math.floor(Math.random() * styles.length)]
  const randomContext = contexts[Math.floor(Math.random() * contexts.length)]
  const randomQuality = quality[Math.floor(Math.random() * quality.length)]

  // Формируем промпт
  return `NEUROCODER ${randomBuilding}, ${randomStyle}, ${randomContext}, ${randomQuality}, precise details, perfect composition, high definition, award-winning design`
}

/**
 * Отправляет результаты тестирования администратору через телеграм
 */
export async function sendResultsToAdmin(
  testName: string,
  result: SimpleTestResult,
  urls?: string[]
): Promise<void> {
  if (!bot) {
    logger.warn({
      message: '⚠️ Невозможно отправить результаты - токен бота не настроен',
      description: 'Cannot send results - bot token not configured',
    })
    return
  }

  try {
    const message = `${result.success ? '✅' : '❌'} Тест: ${testName}
${result.success ? 'Успешно' : 'Ошибка'}: ${result.message}
${result.error ? `Ошибка: ${result.error}` : ''}
Время: ${new Date().toISOString()}`

    await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, message)

    // Отправляем изображения, если они есть
    if (urls && urls.length > 0) {
      for (const url of urls) {
        await bot.telegram.sendPhoto(ADMIN_TELEGRAM_ID, url)
      }
    }

    logger.info({
      message: '✅ Результаты отправлены администратору',
      description: 'Results sent to admin',
    })
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при отправке результатов администратору',
      description: 'Error sending results to admin',
      error,
    })
  }
}

/**
 * Проверяет готовность системы для тестирования
 */
export async function runSystemCheck(): Promise<SimpleTestResult> {
  console.log(`🔍 [SYSTEM_CHECK]: Запуск проверки системы нейрофото`)
  try {
    const testPrompt =
      'A beautiful landscape with mountains and a lake, photo-realistic'
    const result = await testWithPrompt(testPrompt)

    if (!result.success) {
      console.error(
        `❌ [SYSTEM_CHECK]: Системная проверка не пройдена: ${result.message}`
      )
      return {
        success: false,
        message: `Системная проверка не пройдена: ${result.message}`,
        name: 'runSystemCheck',
        error: result.error,
      }
    }

    console.log(`✅ [SYSTEM_CHECK]: Системная проверка успешно пройдена`)
    return {
      success: true,
      message: 'Системная проверка успешно пройдена',
      name: 'runSystemCheck',
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(
      `❌ [SYSTEM_CHECK]: Ошибка при выполнении системной проверки: ${errorMessage}`
    )
    return {
      success: false,
      message: `Ошибка при выполнении системной проверки: ${errorMessage}`,
      name: 'runSystemCheck',
      error: errorMessage,
    }
  }
}

/**
 * Тестирует генерацию с креативным промтом
 */
export async function testWithCreativePrompt(): Promise<SimpleTestResult> {
  try {
    const prompt = generateCreativePrompt()

    logger.info({
      message: `🧪 Запуск теста с креативным промтом: "${prompt}"`,
      description: `Running test with creative prompt: "${prompt}"`,
    })

    return await testWithPrompt(prompt)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    return {
      success: false,
      message: 'Ошибка при тестировании с креативным промтом',
      error: errorMessage,
      name: 'testWithCreativePrompt',
    }
  }
}

/**
 * Тестирует генерацию с указанным промтом
 */
export async function testWithPrompt(
  prompt: string,
  numImagesArg?: number
): Promise<SimpleTestResult> {
  try {
    const testId = uuidv4()
    const testTelegramId = process.env.TEST_TELEGRAM_ID || '123456789'
    const numImages = numImagesArg || 1

    logger.info({
      message: `🧪 Запуск теста с промтом: "${prompt}"`,
      description: `Running test with prompt: "${prompt}"`,
      testId,
    })

    const input: NeuroPhotoDirectTestInput = {
      prompt,
      model_url:
        'ghashtag/neuro_coder_flux-dev-lora:5ff9ea5918427540563f09940bf95d6efc16b8ce9600e82bb17c2b188384e355',
      numImages,
      telegram_id: testTelegramId,
      username: 'test_user',
      is_ru: 'true',
      bot_name: 'test_bot',
    }

    // Создаем моки для Telegram ctx
    const mockContext = {
      from: {
        id: parseInt(input.telegram_id),
        username: input.username,
      },
      session: {
        mode: ModeEnum.NeuroPhoto,
      },
    }

    // Подготавливаем параметры для генерации
    const params = {
      prompt,
      model_url:
        'ghashtag/neuro_coder_flux-dev-lora:5ff9ea5918427540563f09940bf95d6efc16b8ce9600e82bb17c2b188384e355',
      numImages,
      telegram_id: testTelegramId,
      bot_name: 'neuro_blogger_bot',
    }

    logger.info({
      message: '🚀 Запуск прямой генерации нейрофото',
      description: 'Starting direct generation of neurophoto',
      params,
    })

    // Вызываем функцию прямой генерации с правильными параметрами
    const result = await generateNeuroPhotoDirect(
      params.prompt,
      params.model_url,
      params.numImages,
      params.telegram_id,
      mockContext as any,
      params.bot_name
    )

    if (!result || !result.success) {
      const errorMessage = result
        ? (result as any).error || 'Неизвестная ошибка'
        : 'Результат недоступен'

      logger.error({
        message: '❌ Ошибка при генерации нейрофото',
        description: 'Error generating neurophoto',
        error: errorMessage,
      })

      return {
        success: false,
        message: 'Ошибка при генерации нейрофото',
        error: errorMessage,
        name: 'testWithPrompt',
      }
    }

    logger.info({
      message: '✅ Генерация нейрофото успешно завершена',
      description: 'Neurophoto generation completed successfully',
      urls: result.urls,
    })

    // Отправляем результаты администратору
    if (result.urls && result.urls.length > 0) {
      await sendResultsToAdmin(
        'Тест генерации нейрофото',
        {
          success: true,
          message: `Нейрофото успешно сгенерировано (промт: "${prompt}")`,
          name: 'testWithPrompt',
        },
        result.urls
      )
    }

    return {
      success: true,
      message: 'Нейрофото успешно сгенерировано',
      details: { urls: result.urls },
      name: 'testWithPrompt',
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined

    logger.error({
      message: '❌ Ошибка при тестировании с промтом',
      description: 'Error testing with prompt',
      error: errorMessage,
      stack,
    })

    return {
      success: false,
      message: 'Ошибка при тестировании с промтом',
      error: errorMessage,
      name: 'testWithPrompt',
    }
  }
}

/**
 * Тестирует генерацию нескольких изображений
 */
export async function testWithMultipleImages(
  numImages: number = 2
): Promise<SimpleTestResult> {
  try {
    const prompt =
      'мужчина, портрет, высокое качество, профессиональное освещение'

    logger.info({
      message: `🧪 Запуск теста с несколькими изображениями (${numImages})`,
      description: `Running test with multiple images (${numImages})`,
      prompt,
    })

    const testId = uuidv4()
    const testTelegramId = process.env.TEST_TELEGRAM_ID || '123456789'

    // Создаем моки для Telegram ctx
    const mockContext = {
      from: {
        id: parseInt(testTelegramId),
        username: 'test_user',
      },
      session: {
        mode: ModeEnum.NeuroPhoto,
      },
    }

    // Подготавливаем параметры для генерации
    const params = {
      prompt,
      model_url:
        'ghashtag/neuro_coder_flux-dev-lora:5ff9ea5918427540563f09940bf95d6efc16b8ce9600e82bb17c2b188384e355',
      numImages,
      telegram_id: testTelegramId,
      bot_name: 'neuro_blogger_bot',
    }

    logger.info({
      message: `🚀 Запуск прямой генерации ${numImages} нейрофото`,
      description: `Starting direct generation of ${numImages} neurophoto`,
      testId,
      params,
    })

    // Вызываем функцию прямой генерации с правильными параметрами
    const result = await generateNeuroPhotoDirect(
      params.prompt,
      params.model_url,
      params.numImages,
      params.telegram_id,
      mockContext as any,
      params.bot_name
    )

    if (!result || !result.success) {
      const errorMessage = result
        ? (result as any).error || 'Неизвестная ошибка'
        : 'Результат недоступен'

      logger.error({
        message: '❌ Ошибка при генерации нескольких нейрофото',
        description: 'Error generating multiple neurophoto',
        error: errorMessage,
      })

      return {
        success: false,
        message: 'Ошибка при генерации нескольких нейрофото',
        error: errorMessage,
        name: 'testWithMultipleImages',
      }
    }

    // Проверяем, что сгенерировано правильное количество изображений
    if (!result.urls || result.urls.length !== numImages) {
      logger.warn({
        message: `⚠️ Сгенерировано ${result.urls?.length || 0} изображений вместо ${numImages}`,
        description: `Generated ${result.urls?.length || 0} images instead of ${numImages}`,
      })

      return {
        success: false,
        message: `Неверное количество сгенерированных изображений: ${
          result.urls?.length || 0
        } вместо ${numImages}`,
        error: 'Incorrect number of generated images',
        name: 'testWithMultipleImages',
      }
    }

    logger.info({
      message: `✅ Генерация ${numImages} нейрофото успешно завершена`,
      description: `Successfully generated ${numImages} neurophoto`,
      urls: result.urls,
    })

    // Отправляем результаты администратору
    await sendResultsToAdmin(
      `Тест генерации ${numImages} нейрофото`,
      {
        success: true,
        message: `${numImages} нейрофото успешно сгенерировано`,
        name: 'testWithMultipleImages',
      },
      result.urls
    )

    return {
      success: true,
      message: `${numImages} нейрофото успешно сгенерировано`,
      details: { urls: result.urls },
      name: 'testWithMultipleImages',
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    return {
      success: false,
      message: 'Ошибка при тестировании с несколькими изображениями',
      error: errorMessage,
      name: 'testWithMultipleImages',
    }
  }
}

export async function testWithRealUserAndAdmin(
  input: NeuroPhotoDirectTestInput
): Promise<SimpleTestResult> {
  const {
    prompt,
    model_url,
    numImages,
    telegram_id,
    username,
    is_ru,
    bot_name = 'test_bot',
  } = input
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID || '123456789'

  if (!botToken) {
    console.error(
      '❌ [TEST]: TELEGRAM_BOT_TOKEN не найден в переменных окружения'
    )
    return {
      success: false,
      message: 'TELEGRAM_BOT_TOKEN не найден в переменных окружения',
      name: 'testWithRealUserAndAdmin',
      error: 'TELEGRAM_BOT_TOKEN не найден',
    }
  }

  // Настройка телеграм бота для отправки уведомлений админу
  const bot = new Telegraf(botToken)

  // Функция для отправки сообщения админу
  const sendToAdmin = async (text: string) => {
    try {
      await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, text)
      console.log(`✅ [ADMIN]: Сообщение отправлено админу`)
    } catch (sendError) {
      console.error(
        `❌ [ADMIN]: Ошибка при отправке сообщения админу: ${sendError instanceof Error ? sendError.message : String(sendError)}`
      )
    }
  }

  console.log(
    `🚀 [REAL_TEST]: Запуск теста с реальным API для пользователя ${username}`
  )
  await sendToAdmin(
    `🚀 Начато тестирование нейрофото API с пользователем ${username} (${telegram_id})
Промпт: "${prompt}"
Количество изображений: ${numImages}
Язык: ${is_ru === 'true' ? 'Русский' : 'Английский'}`
  )

  try {
    // Мок контекста для телеграм
    const mockContext = {
      from: {
        id: parseInt(telegram_id),
        username,
      },
      session: {
        mode: ModeEnum.NeuroPhoto,
      },
      reply: async (text: string) => {
        console.log(`💬 [MOCK] Отправка сообщения: ${text.substring(0, 50)}...`)
        return {} as any
      },
    }

    const startTime = new Date()
    console.log(`🔍 [REAL_TEST]: Вызов generateNeuroPhotoDirect`)

    // Вызов реальной функции
    const result = await generateNeuroPhotoDirect(
      prompt,
      model_url,
      numImages,
      telegram_id,
      mockContext as any,
      bot_name
    )

    const endTime = new Date()
    const executionTime = (endTime.getTime() - startTime.getTime()) / 1000

    if (!result) {
      const errorMsg = `❌ Тест не пройден: результат равен null`
      console.error(`❌ [REAL_TEST]: ${errorMsg}`)
      await sendToAdmin(errorMsg)
      return {
        success: false,
        message: errorMsg,
        name: 'testWithRealUserAndAdmin',
        error: 'Результат генерации равен null',
      }
    }

    // Сообщение об успехе
    const successMsg = `✅ Тест успешно пройден за ${executionTime.toFixed(2)} сек. Сгенерировано изображений: ${result.urls ? result.urls.length : 0}`
    console.log(`✅ [REAL_TEST]: ${successMsg}`)

    // Отправка результата админу
    await sendToAdmin(successMsg)

    return {
      success: true,
      message: successMsg,
      name: 'testWithRealUserAndAdmin',
      details: {
        urls: result.urls,
        executionTime,
      },
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorMsg = `❌ Ошибка при тестировании: ${errorMessage}`
    console.error(`❌ [REAL_TEST]: ${errorMsg}`)

    // Отправка ошибки админу
    await sendToAdmin(errorMsg)

    return {
      success: false,
      message: errorMsg,
      name: 'testWithRealUserAndAdmin',
      error: errorMessage,
    }
  }
}

/**
 * Тестирует прямую генерацию и отправляет отчет администратору
 */
export async function testDirectGenerationAndReport(input: {
  mode: any // ModeEnum.NeuroPhoto
  prompt: string
  model_url: string
  numImages: number
  telegram_id: string
  username: string
  amount: number
  bot_name: string
  selectedModel: string
  selectedSize: string
  is_ru?: string
}): Promise<SimpleTestResult> {
  try {
    const startTime = new Date()
    console.log(`🚀 [TEST]: Запуск теста прямой генерации нейрофото`)
    console.log(`ℹ️ [TEST]: Промпт: "${input.prompt}"`)
    console.log(`ℹ️ [TEST]: Модель: ${input.model_url}`)
    console.log(`ℹ️ [TEST]: Количество изображений: ${input.numImages}`)

    // Создаем моки для Telegram ctx
    const mockContext = {
      from: {
        id: parseInt(input.telegram_id),
        username: input.username || 'test_user',
      },
      session: {
        mode: input.mode,
      },
    }

    // Вызываем функцию прямой генерации с правильными параметрами
    const result = await generateNeuroPhotoDirect(
      input.prompt,
      input.model_url,
      input.numImages,
      input.telegram_id,
      mockContext as any,
      input.bot_name
    )

    const endTime = new Date()
    const executionTime = (endTime.getTime() - startTime.getTime()) / 1000

    if (!result || !result.success) {
      const errorMsg = `❌ Тест не пройден: ${result ? (result as any).error || 'Неизвестная ошибка' : 'Результат равен null'}`
      console.error(`❌ [TEST]: ${errorMsg}`)

      return {
        success: false,
        message: errorMsg,
        name: 'testDirectGenerationAndReport',
        error: errorMsg,
      }
    }

    // Сообщение об успехе
    const successMsg = `✅ Тест успешно пройден за ${executionTime.toFixed(2)} сек. Сгенерировано изображений: ${result.urls ? result.urls.length : 0}`
    console.log(`✅ [TEST]: ${successMsg}`)

    // Отправка результата админу если есть ADMIN_TELEGRAM_ID
    const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID
    if (ADMIN_TELEGRAM_ID && bot) {
      try {
        await bot.telegram.sendMessage(
          ADMIN_TELEGRAM_ID,
          `✅ Тест генерации нейрофото:\n` +
            `Промпт: "${input.prompt}"\n` +
            `Время выполнения: ${executionTime.toFixed(2)} сек\n` +
            `Параметры: ${input.numImages} изображений, размер ${input.selectedSize}`
        )

        // Отправляем изображения
        if (result.urls && result.urls.length > 0) {
          for (const url of result.urls) {
            await bot.telegram.sendPhoto(ADMIN_TELEGRAM_ID, url)
          }
        }

        console.log(`✅ [ADMIN]: Результаты отправлены администратору`)
      } catch (error) {
        console.error(
          `❌ [ADMIN]: Ошибка при отправке результатов: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }

    return {
      success: true,
      message: successMsg,
      name: 'testDirectGenerationAndReport',
      details: {
        urls: result.urls,
        executionTime,
      },
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorMsg = `❌ Ошибка при тестировании: ${errorMessage}`
    console.error(`❌ [TEST]: ${errorMsg}`)

    return {
      success: false,
      message: errorMsg,
      name: 'testDirectGenerationAndReport',
      error: errorMessage,
    }
  }
}
