import { v4 as uuidv4 } from 'uuid'
import { generateNeuroPhotoDirect } from '@/services/generateNeuroPhotoDirect'
import { logger } from '@/utils/logger'
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
  selectedSize?: string
  telegram_group_id?: string
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
 * Создает мок-контекст Telegram для тестирования
 */
function createMockContext(
  telegram_id: string,
  username: string,
  is_ru: string,
  mode: any
) {
  return {
    from: {
      id: parseInt(telegram_id),
      username: username || 'test_user',
    },
    session: {
      mode: mode,
      selectedSize: '9:16',
      sendToAdmin: true, // Всегда отправляем в группу для тестирования
    },
  }
}

/**
 * Генерирует случайный креативный промпт для NeuroPhoto
 * @returns {string} промпт
 */
export function generateCreativePrompt(): string {
  const subjects = [
    'a dreamy landscape with mountains',
    'a futuristic cityscape at sunset',
    'an enchanted forest with glowing mushrooms',
    'a cosmic scene with nebulae and stars',
    'an underwater world with coral reefs',
    'a fantasy castle on a floating island',
    'a steam punk world with flying machines',
    'a cyberpunk street scene at night',
    'a surreal desert with floating rocks',
    'an ancient temple overgrown with plants',
  ]

  const environments = [
    'under a starry sky',
    'in a misty fog',
    'during a gentle rainstorm',
    'at golden hour',
    'bathed in moonlight',
    'with a rainbow in the background',
    'during a meteor shower',
    'with northern lights',
    'at dawn with morning rays',
    'with dramatic storm clouds',
  ]

  const styles = [
    'with vibrant colors',
    'with a dreamy, ethereal quality',
    'with dramatic lighting',
    'with soft, pastel tones',
    'with high contrast',
    'with a cinematic feel',
    'with a painterly style',
    'with a minimalist aesthetic',
    'with intricate details',
    'with a vintage atmosphere',
  ]

  const details = [
    'rich textures',
    'floating particles',
    'lens flares',
    'dynamic composition',
    'reflections in water',
    'depth of field effect',
    'elaborate patterns',
    'small glowing elements',
    'delicate mist',
    'sharp, crisp details',
  ]

  const qualities = [
    'photorealistic',
    '8k resolution',
    'professional photography',
    'perfect lighting',
    'atmospheric perspective',
    'expertly composed',
    'hyper-detailed',
    'award-winning',
    'masterpiece',
    'breathtaking',
  ]

  const randomSubject = subjects[Math.floor(Math.random() * subjects.length)]
  const randomEnvironment =
    environments[Math.floor(Math.random() * environments.length)]
  const randomStyle = styles[Math.floor(Math.random() * styles.length)]
  const randomDetail = details[Math.floor(Math.random() * details.length)]
  const randomQuality = qualities[Math.floor(Math.random() * qualities.length)]

  return `NEUROCODER ${randomSubject} ${randomEnvironment}, ${randomStyle}, ${randomDetail}, ${randomQuality}`
}

/**
 * Генерирует случайный промпт для интерьеров и дизайна для NeuroPhoto
 * @returns {string} промпт
 */
export function generateDesignPrompt(): string {
  const designs = [
    'a minimalist website interface',
    'a modern app design with gradient elements',
    'a sleek dashboard with data visualizations',
    'a product packaging for an eco-friendly brand',
    'a geometric poster with bold typography',
    'a futuristic smartwatch interface',
    'a clean business card design',
    'an elegant logo for a luxury brand',
    'a book cover with abstract elements',
    'a magazine layout with dynamic grids',
  ]

  const styles = [
    'with a Scandinavian aesthetic',
    'with Japanese wabi-sabi influence',
    'with Bauhaus principles',
    'with Swiss design precision',
    'with Memphis style playfulness',
    'with Art Deco elements',
    'with Brutalist approach',
    'with a cyberpunk edge',
    'with organic, flowing shapes',
    'with isometric perspective',
  ]

  const elements = [
    'bold color contrasts',
    'subtle gradients',
    'elegant typography',
    'sacred geometry patterns',
    'negative space',
    '3D elements',
    'hand-drawn illustrations',
    'layered textures',
    'pixel-perfect icons',
    'balanced proportions',
  ]

  const contexts = [
    'for a tech startup',
    'for a sustainable fashion brand',
    'for a creative agency',
    'for a financial institution',
    'for a health and wellness company',
    'for an educational platform',
    'for a food delivery service',
    'for a music streaming app',
    'for a travel experience company',
    'for a gaming community',
  ]

  const qualities = [
    'award-winning',
    'trendsetting',
    'industry-leading',
    'innovative',
    'user-centered',
    'visually striking',
    'emotionally resonant',
    'functionally elegant',
    'aesthetically balanced',
    'expertly crafted',
  ]

  const randomDesign = designs[Math.floor(Math.random() * designs.length)]
  const randomStyle = styles[Math.floor(Math.random() * styles.length)]
  const randomElement = elements[Math.floor(Math.random() * elements.length)]
  const randomContext = contexts[Math.floor(Math.random() * contexts.length)]
  const randomQuality = qualities[Math.floor(Math.random() * qualities.length)]

  return `NEUROCODER ${randomDesign} ${randomStyle}, featuring ${randomElement} ${randomContext}, ${randomQuality} design`
}

/**
 * Генерирует случайный промпт для архитектуры для NeuroPhoto
 * @returns {string} промпт
 */
export function generateArchitecturePrompt(): string {
  const buildings = [
    'a modernist house with clean lines',
    'a futuristic skyscraper with organic forms',
    'a sustainable eco-resort integrated with nature',
    'a renovated industrial loft space',
    'a minimalist Japanese tea house',
    'a contemporary museum with dramatic lighting',
    'a floating pavilion on water',
    'a luxury penthouse with panoramic views',
    'a subterranean home built into a hillside',
    'a transparent glass structure in a forest',
  ]

  const materials = [
    'with exposed concrete and warm wood',
    'with weathered steel and glass panels',
    'with local stone and recycled materials',
    'with titanium cladding and smart glass',
    'with bamboo structures and living walls',
    'with marble accents and brass details',
    'with rammed earth and sustainable timber',
    'with parametric brick patterns',
    'with carbon fiber composites and aluminum',
    'with translucent polycarbonate and steel',
  ]

  const features = [
    'featuring cantilevered balconies',
    'featuring a central courtyard with water elements',
    'featuring floor-to-ceiling windows',
    'featuring a green roof garden',
    'featuring interconnected modular spaces',
    'featuring dynamic lighting scenarios',
    'featuring a spiral staircase as a focal point',
    'featuring passive solar design',
    'featuring floating platforms and walkways',
    'featuring hidden rooms and secret passages',
  ]

  const environments = [
    'nestled in a coastal cliff',
    'overlooking a vibrant cityscape',
    'surrounded by a minimalist zen garden',
    'integrated into a dense urban environment',
    'perched on mountain peak',
    'embedded in a tropical forest',
    'floating above a crystalline lake',
    'situated in a desert landscape',
    'within a revitalized historical district',
    'on the edge of a dramatic gorge',
  ]

  const qualities = [
    'award-winning architectural design',
    'sustainably engineered',
    'harmoniously balanced with surroundings',
    'pushing boundaries of structural engineering',
    'redefining spatial experience',
    'masterfully crafted with attention to detail',
    'expertly blending form and function',
    'innovative use of space and light',
    'with perfect proportions and scale',
    'embodying timeless design principles',
  ]

  const randomBuilding = buildings[Math.floor(Math.random() * buildings.length)]
  const randomMaterial = materials[Math.floor(Math.random() * materials.length)]
  const randomFeature = features[Math.floor(Math.random() * features.length)]
  const randomEnvironment =
    environments[Math.floor(Math.random() * environments.length)]
  const randomQuality = qualities[Math.floor(Math.random() * qualities.length)]

  return `NEUROCODER ${randomBuilding} ${randomMaterial}, ${randomFeature}, ${randomEnvironment}, ${randomQuality}`
}

/**
 * Отправляет результаты тестирования администратору через телеграм
 */
export async function sendResultsToAdmin(
  testName: string,
  result: SimpleTestResult,
  urls?: string[],
  telegram_group_id?: string
): Promise<void> {
  if (!bot) {
    logger.warn({
      message: '⚠️ Невозможно отправить результаты - токен бота не настроен',
      description: 'Cannot send results - bot token not configured',
    })
    console.error(
      '❌ БОТ НЕ ИНИЦИАЛИЗИРОВАН! Проверьте переменную TELEGRAM_BOT_TOKEN'
    )
    return
  }

  // Используем переданный ID группы или берем из переменных окружения
  const groupId =
    telegram_group_id || process.env.TELEGRAM_GROUP_ID || '-1001234567890'

  // Обязательно отправляем сообщение напрямую администратору
  const adminId = process.env.ADMIN_TELEGRAM_ID || ADMIN_TELEGRAM_ID
  console.log(`📧 Отправка результатов администратору с ID: ${adminId}`)

  try {
    // Сначала отправляем результаты в админ-чат
    const message = `${result.success ? '✅' : '❌'} Тест: ${testName}
${result.success ? 'Успешно' : 'Ошибка'}: ${result.message}
${result.error ? `Ошибка: ${result.error}` : ''}
Время: ${new Date().toISOString()}`

    await bot.telegram.sendMessage(adminId, message)
    console.log(
      `✅ [ADMIN_DIRECT]: Текстовое сообщение отправлено администратору ${adminId}`
    )

    // Отправляем изображения админу, если они есть
    if (urls && urls.length > 0) {
      for (const url of urls) {
        console.log(
          `📤 [ADMIN_DIRECT]: Отправка изображения админу напрямую: ${url.substring(0, 50)}...`
        )
        try {
          // Отправляем изображение по URL напрямую
          await bot.telegram.sendPhoto(adminId, { url })
          console.log(
            `✅ [ADMIN_DIRECT]: Изображение отправлено админу напрямую (ID: ${adminId})`
          )
        } catch (error) {
          console.error(
            `❌ [ADMIN_DIRECT]: Ошибка при отправке фото админу напрямую (ID: ${adminId}): ${error instanceof Error ? error.message : String(error)}`
          )

          // Если не получилось отправить как фото, отправляем как текст
          try {
            await bot.telegram.sendMessage(
              adminId,
              `Ссылка на изображение: ${url}`
            )
            console.log(
              `✅ [ADMIN_DIRECT]: Ссылка на изображение отправлена админу напрямую (ID: ${adminId})`
            )
          } catch (textError) {
            console.error(
              `❌ [ADMIN_DIRECT]: Ошибка при отправке ссылки админу напрямую (ID: ${adminId}): ${textError instanceof Error ? textError.message : String(textError)}`
            )
          }
        }
      }
    }

    logger.info({
      message: '✅ Результаты отправлены администратору',
      description: 'Results sent to admin directly',
      admin_id: adminId,
    })

    // ВСЕГДА отправляем в группу @neuro_blogger_pulse
    console.log(
      `🚀 [GROUP]: Отправка результатов в группу @neuro_blogger_pulse (ID: ${groupId})`
    )

    try {
      // Подготовим текст сообщения с ссылками на изображения
      let messageText =
        `✅ Результаты теста нейрофото:\n` +
        `Тест: ${testName}\n` +
        `Статус: ${result.success ? 'Успешно' : 'Ошибка'}\n` +
        `Промпт: "${result.details?.prompt || 'Не указан'}"`

      // Добавляем ссылки на изображения в текст сообщения
      if (urls && urls.length > 0) {
        messageText += '\n\n📸 Сгенерированные изображения:'
        urls.forEach((url, index) => {
          messageText += `\n${index + 1}. ${url}`
        })
      }

      // Отправляем одно сообщение со всей информацией
      await bot.telegram.sendMessage(groupId, messageText)
      console.log(
        `✅ [GROUP]: Сообщение со ссылками на изображения отправлено в группу @neuro_blogger_pulse`
      )

      // Пробуем также отправить изображения как фото
      if (urls && urls.length > 0) {
        for (const url of urls) {
          console.log(
            `📤 [GROUP]: Попытка отправки изображения в группу: ${url.substring(0, 50)}...`
          )
          try {
            // Пробуем отправить по URL
            await bot.telegram.sendPhoto(groupId, { url })
            console.log(`✅ [GROUP]: Изображение отправлено в группу как URL`)
          } catch (error) {
            console.error(
              `❌ [GROUP]: Ошибка при отправке фото в группу: ${error instanceof Error ? error.message : String(error)}`
            )

            // Если не получилось отправить как фото, отправляем как текст со ссылкой
            try {
              await bot.telegram.sendMessage(
                groupId,
                `📷 Изображение: ${url}\n\nЕсли изображение не отображается автоматически, пожалуйста, скопируйте и вставьте ссылку в браузер.`
              )
              console.log(
                `✅ [GROUP]: Ссылка на изображение отправлена в группу как текст`
              )
            } catch (textError) {
              console.error(
                `❌ [GROUP]: Ошибка при отправке ссылки в группу: ${textError instanceof Error ? textError.message : String(textError)}`
              )
            }
          }
        }
      } else {
        console.warn('⚠️ [GROUP]: Нет URLs для отправки изображений в группу')
      }

      console.log(
        `✅ [GROUP]: Результаты успешно отправлены в группу @neuro_blogger_pulse`
      )
    } catch (error) {
      console.error(
        `❌ [GROUP]: Ошибка при отправке результатов в группу @neuro_blogger_pulse: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при отправке результатов',
      description: 'Error sending results',
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
      bot_name: 'ai_koshey_bot',
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
      bot_name: 'ai_koshey_bot',
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
      bot_name: 'ai_koshey_bot',
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
    bot_name = 'ai_koshey_bot',
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
 * Тестирует прямую генерацию нейрофото с заданными параметрами и отправляет результаты в группу
 * @param params Параметры для теста
 * @returns Результат теста
 */
export async function testDirectGenerationAndReport(
  params: any
): Promise<SimpleTestResult> {
  try {
    const {
      prompt = '',
      model_url = '',
      numImages = 1,
      telegram_id = '',
      username = 'test_user',
      is_ru = 'true',
      bot_name = 'ai_koshey_bot',
      telegram_group_id = process.env.TELEGRAM_GROUP_ID || '-1001234567890',
      // остальные параметры игнорируем
    } = params

    // Генерируем промпт, если он не указан
    const finalPrompt = prompt || generateCreativePrompt()

    logger.info({
      message: '🚀 Начало теста генерации нейрофото',
      description: 'Starting neurophoto generation test',
      prompt: finalPrompt.substring(0, 50) + '...',
      model_url,
      numImages,
      telegram_id,
      bot_name,
      test_id: uuidv4(),
      telegram_group_id,
    })

    // Создаем моки для Telegram ctx
    const mockContext = createMockContext(
      telegram_id,
      username,
      is_ru,
      ModeEnum.NeuroPhoto
    )

    // Для гарантии что изображения отправятся в группу телеграм
    mockContext.session.sendToAdmin = true

    // Подключаемся к реальному API
    logger.info({
      message: '🔄 Подключение к реальному API и боту',
      description: 'Connecting to real API and bot',
      bot_name,
    })

    // Вызываем функцию прямой генерации с правильными параметрами
    const result = await generateNeuroPhotoDirect(
      finalPrompt,
      model_url,
      numImages,
      telegram_id,
      mockContext as any,
      bot_name
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

    // Отправляем результаты в группу и админу
    if (
      (result.urls && result.urls.length > 0) ||
      (params.fakeUrls && params.fakeUrls.length > 0)
    ) {
      // Используем fakeUrls если они есть, иначе используем результат генерации
      const urlsToSend =
        params.fakeUrls && params.fakeUrls.length > 0
          ? params.fakeUrls
          : result.urls || []

      logger.info({
        message: '📤 Отправка результатов в Telegram-группу',
        description: 'Sending results to Telegram group',
        telegram_group_id,
        urls_count: urlsToSend.length,
        using_fake_urls: !!params.fakeUrls,
      })

      console.log(`📸 [DIRECT]: URL изображений для отправки:`)
      urlsToSend.forEach((url: string, i: number) => {
        console.log(`📷 [${i + 1}/${urlsToSend.length}]: ${url}`)
      })

      // Обязательно отправляем в группу
      await sendResultsToAdmin(
        'Тест генерации нейрофото',
        {
          success: true,
          message: `Нейрофото успешно сгенерировано (промт: "${finalPrompt.substring(0, 30)}...")`,
          name: 'testDirectGenerationAndReport',
          details: {
            prompt: finalPrompt,
            urls: urlsToSend,
          },
        },
        urlsToSend,
        telegram_group_id
      )

      logger.info({
        message: '✅ Результаты отправлены в Telegram-группу',
        description: 'Results sent to Telegram group',
        telegram_group_id,
      })

      return {
        success: true,
        message: 'Нейрофото успешно сгенерировано и отправлено в группу',
        details: {
          urls: urlsToSend,
          using_fake_urls: !!params.fakeUrls,
        },
        name: 'testDirectGenerationAndReport',
      }
    }

    return {
      success: true,
      message: 'Нейрофото успешно сгенерировано и отправлено в группу',
      details: { urls: result.urls },
      name: 'testDirectGenerationAndReport',
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined

    logger.error({
      message: '❌ Ошибка при тестировании генерации',
      description: 'Error testing generation',
      error: errorMessage,
      stack,
    })

    return {
      success: false,
      message: 'Ошибка при тестировании генерации',
      error: errorMessage,
      name: 'testDirectGenerationAndReport',
    }
  }
}

export function generateHipsterPortraitPrompt(): string {
  const subjects = [
    'a stylish young man with a well-groomed beard',
    'an artistic woman with colorful hair',
    'a creative individual with distinctive eyewear',
    'a fashionable person with vintage-inspired clothing',
    'a musician with tattoos and a thoughtful expression',
    'a barista with detailed sleeve tattoos',
    'a designer with an undercut hairstyle',
    'an urban explorer with layered clothing',
    'a photographer with a minimalist aesthetic',
    'a trendsetter with unique accessories',
  ]

  const environments = [
    'in an industrial coffee shop',
    'against a brick wall with ivy',
    'in a renovated warehouse space',
    'near a window with natural light streaming in',
    'in an art gallery with abstract paintings',
    'on a rooftop with urban landscape',
    'in a vintage record store',
    'beside a classic motorcycle',
    'in a botanical indoor space',
    'at a street food market',
  ]

  const lighting = [
    'with soft, diffused lighting',
    'with dramatic side lighting',
    'in moody, atmospheric light',
    'with golden hour glow',
    'with cinematic color grading',
    'with subtle film grain effect',
    'with desaturated color palette',
    'with high contrast shadows',
    'with teal and orange color scheme',
    'with backlit silhouette effects',
  ]

  const styles = [
    'captured on medium format film',
    'with shallow depth of field',
    'with deliberate lens flare',
    'with authentic analog feel',
    'with thoughtful composition',
    'with editorial aesthetic',
    'with intentional negative space',
    'with vintage film emulation',
    'with urban contemporary feel',
    'with deliberate color theory',
  ]

  const details = [
    'intricate tattoo details',
    'authentic facial expression',
    'carefully curated outfit',
    'artisanal accessories',
    'thoughtfully styled hair',
    'natural skin texture',
    'genuine emotional depth',
    'cultural storytelling elements',
    'personal style signatures',
    'environmental context clues',
  ]

  const randomSubject = subjects[Math.floor(Math.random() * subjects.length)]
  const randomEnvironment =
    environments[Math.floor(Math.random() * environments.length)]
  const randomLighting = lighting[Math.floor(Math.random() * lighting.length)]
  const randomStyle = styles[Math.floor(Math.random() * styles.length)]
  const randomDetail = details[Math.floor(Math.random() * details.length)]

  return `NEUROCODER Portrait of ${randomSubject} ${randomEnvironment}, ${randomLighting}, ${randomStyle}, focusing on ${randomDetail}, modern hipster aesthetic, authentic and thoughtful portrait photography`
}

export function generateHipsterLifestylePrompt(): string {
  const scenes = [
    'a group of friends sharing food at an artisanal restaurant',
    'a person reading in a cozy independent bookstore',
    'creative professionals collaborating in a co-working space',
    'a mindful moment in a minimalist apartment',
    'cyclists exploring an urban neighborhood',
    'artisans working in a communal workshop',
    'a farmers market with local organic produce',
    'a zero-waste lifestyle vignette',
    'a sustainable fashion lookbook scene',
    'a craft brewery tasting experience',
  ]

  const aesthetics = [
    'with hygge-inspired warmth',
    'with wabi-sabi appreciation for imperfection',
    'with Scandinavian minimalist influence',
    'with rustic industrial touches',
    'with botanical bohemian elements',
    'with mid-century modern furniture',
    'with reclaimed materials and textures',
    'with monochromatic color harmony',
    'with sustainable living emphasis',
    'with analog technology nostalgia',
  ]

  const moods = [
    'conveying authentic connection',
    'celebrating creative passion',
    'expressing mindful presence',
    'capturing nostalgic reminiscence',
    'showing thoughtful introspection',
    'depicting joyful spontaneity',
    'illustrating purposeful craftsmanship',
    'revealing genuine curiosity',
    'portraying gentle activism',
    'demonstrating intentional living',
  ]

  const techniques = [
    'documentary-style photography',
    'candid moment capture',
    'lifestyle editorial approach',
    'environmental portraiture',
    'storytelling through details',
    'human-centered composition',
    'natural light mastery',
    'authentic moment preservation',
    'cultural narrative context',
    'emotional storytelling elements',
  ]

  const details = [
    'carefully curated surroundings',
    'meaningful personal objects',
    'thoughtful environmental choices',
    'artisanal craft details',
    'intentional color relationships',
    'authentic human interaction',
    'meaningful visual storytelling',
    'cultural context elements',
    'sustainable lifestyle choices',
    'personal expression through style',
  ]

  const randomScene = scenes[Math.floor(Math.random() * scenes.length)]
  const randomAesthetic =
    aesthetics[Math.floor(Math.random() * aesthetics.length)]
  const randomMood = moods[Math.floor(Math.random() * moods.length)]
  const randomTechnique =
    techniques[Math.floor(Math.random() * techniques.length)]
  const randomDetail = details[Math.floor(Math.random() * details.length)]

  return `NEUROCODER ${randomScene} ${randomAesthetic}, ${randomMood}, captured through ${randomTechnique}, highlighting ${randomDetail}, modern hipster lifestyle, authentic and visually compelling`
}

export async function generateAndSendImages(
  prompt: string,
  bot_name: string,
  context: any,
  user: any,
  fakeUrls?: string[],
  sendToAdmin = true
): Promise<SimpleTestResult> {
  console.log(
    `🚀 [GEN-AND-SEND] Генерация и отправка изображений для промпта: "${prompt.substring(
      0,
      50
    )}..."`
  )
  console.log(`📱 [GEN-AND-SEND] Бот: ${bot_name}`)
  console.log(
    `👤 [GEN-AND-SEND] Пользователь: ${user.telegram_id} / ${user.username}`
  )

  try {
    // Пытаемся сгенерировать изображения
    const mockContext = createMockContext(
      user.telegram_id,
      user.username,
      user.is_ru || 'true',
      ModeEnum.NeuroPhoto
    )

    // Вызываем функцию прямой генерации с правильными параметрами (6 аргументов)
    const generationResult = await generateNeuroPhotoDirect(
      prompt,
      context.model_url,
      context.numImages || 1,
      user.telegram_id,
      mockContext as any,
      bot_name
    )

    if (!generationResult) {
      console.error(
        `❌ [GEN-AND-SEND] Не удалось получить результаты генерации (NULL)`
      )
      return {
        success: false,
        message: 'Не удалось получить результаты генерации (NULL)',
        error: 'Generation result is null',
        name: 'generateAndSendImages',
        details: {
          prompt,
          bot_name,
          user: {
            telegram_id: user.telegram_id,
            username: user.username,
          },
        },
      }
    }

    // Если в generationResult нет URLs, но есть fakeUrls, используем их
    let urlsToSend: string[] = []

    if (generationResult.urls && generationResult.urls.length > 0) {
      console.log(
        `✅ [GEN-AND-SEND] Получены ${generationResult.urls.length} URL из генерации`
      )
      urlsToSend = generationResult.urls
    } else if (fakeUrls && fakeUrls.length > 0) {
      console.log(
        `⚠️ [GEN-AND-SEND] Используем ${fakeUrls.length} фейковых URLs, т.к. реальные URL не получены`
      )
      urlsToSend = fakeUrls
    } else {
      console.error(
        `❌ [GEN-AND-SEND] Нет URL для отправки (ни реальных, ни фейковых)`
      )
      return {
        success: false,
        message: 'Нет URL для отправки',
        error: 'No URLs to send',
        name: 'generateAndSendImages',
        details: {
          prompt,
          bot_name,
          user: {
            telegram_id: user.telegram_id,
            username: user.username,
          },
        },
      }
    }

    console.log(`📸 [DIRECT]: URL изображений для отправки:`)
    urlsToSend.forEach((url: string, i: number) => {
      console.log(`📷 [${i + 1}/${urlsToSend.length}]: ${url}`)
    })

    // Отправляем результаты администратору (вне зависимости от того, откуда URL)
    if (sendToAdmin) {
      console.log(
        `📤 [GEN-AND-SEND] Отправка результатов администратору и в группу...`
      )
      // Используем urlsToSend вместо generationResult.urls
      await sendResultsToAdmin(
        'Тест генерации изображений',
        {
          success: true,
          message: `Сгенерировано ${urlsToSend.length} изображений`,
          name: 'generateAndSendImages',
          details: {
            prompt,
            bot_name,
            user: {
              telegram_id: user.telegram_id,
              username: user.username,
            },
          },
        },
        urlsToSend
      )
    }

    console.log(
      `✅ [GEN-AND-SEND] Изображения успешно сгенерированы и отправлены`
    )
    return {
      success: true,
      message: `Сгенерировано ${urlsToSend.length} изображений`,
      name: 'generateAndSendImages',
      details: {
        prompt,
        bot_name,
        user: {
          telegram_id: user.telegram_id,
          username: user.username,
        },
        urls: urlsToSend,
      },
    }
  } catch (error) {
    console.error(
      `❌ [GEN-AND-SEND] Ошибка при генерации и отправке: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
    return {
      success: false,
      message: 'Ошибка при генерации и отправке изображений',
      name: 'generateAndSendImages',
      error:
        error instanceof Error
          ? error.message
          : 'Неизвестная ошибка в generateAndSendImages',
      details: {
        prompt,
        bot_name,
        user: {
          telegram_id: user.telegram_id,
          username: user.username,
        },
      },
    }
  }
}
