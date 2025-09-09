import axios from 'axios'
import { logger } from '@/utils/logger'
import * as fs from 'fs'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'

interface GeminiImageOptions {
  prompt: string
  userId?: number
  language?: 'ru' | 'en'
  aspectRatio?: string
  seed?: number
  inputImageUrl?: string // For image-to-image transformations
}

interface GeminiResponse {
  id: string
  choices: Array<{
    message: {
      content: string
      role: string
    }
    finish_reason: string
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

// Славянские персонажи для промптов
const slavicCharacters = {
  ru: [
    'Баба Яга в избушке на курьих ножках',
    'Иван-царевич на сером волке',
    'Василиса Прекрасная в русском сарафане',
    'Кощей Бессмертный с сундуком',
    'Жар-птица с золотыми перьями',
    'Добрыня Никитич в богатырских доспехах',
    'Снегурочка в ледяном дворце',
    'Леший в дремучем лесу',
    'Русалка у озера',
    'Домовой за печкой',
  ],
  en: [
    'Baba Yaga in her chicken-legged hut',
    'Ivan Tsarevich on a gray wolf',
    'Vasilisa the Beautiful in Russian sarafan',
    'Koschei the Deathless with his chest',
    'Firebird with golden feathers',
    'Dobrynya Nikitich in heroic armor',
    'Snow Maiden in ice palace',
    'Leshy in the deep forest',
    'Rusalka by the lake',
    'Domovoi behind the stove',
  ]
}

// Расширенные промпты для мальчиков и девочек
const genderPrompts = {
  boys: {
    ru: [
      'отважный рыцарь на коне',
      'космонавт в открытом космосе',
      'пират на корабле с сокровищами',
      'супергерой в полете над городом',
      'гонщик Формулы-1 на трассе',
      'робот-трансформер в битве',
      'драконий всадник в небесах',
      'ниндзя в ночном городе',
      'волшебник с магическим посохом',
      'викинг на драккаре',
    ],
    en: [
      'brave knight on horseback',
      'astronaut in open space',
      'pirate on treasure ship',
      'superhero flying over city',
      'Formula 1 racer on track',
      'transformer robot in battle',
      'dragon rider in the skies',
      'ninja in night city',
      'wizard with magical staff',
      'viking on longship',
    ]
  },
  girls: {
    ru: [
      'принцесса в волшебном замке',
      'фея с блестящими крыльями',
      'балерина на сцене',
      'единорог в радужном лесу',
      'русалочка под водой',
      'волшебница с хрустальным шаром',
      'эльфийская принцесса в лесу',
      'ангел с золотыми крыльями',
      'королева льда в снежном дворце',
      'девочка с волшебной палочкой',
    ],
    en: [
      'princess in magical castle',
      'fairy with sparkling wings',
      'ballerina on stage',
      'unicorn in rainbow forest',
      'mermaid underwater',
      'sorceress with crystal ball',
      'elven princess in forest',
      'angel with golden wings',
      'ice queen in snow palace',
      'girl with magic wand',
    ]
  }
}

/**
 * Обогащает промпт славянскими мотивами и гендерными элементами
 */
function enrichPrompt(prompt: string, language: 'ru' | 'en' = 'ru'): string {
  const randomSlavic = slavicCharacters[language][Math.floor(Math.random() * slavicCharacters[language].length)]
  
  // Определяем гендерную направленность по ключевым словам
  const boyKeywords = language === 'ru' 
    ? ['мальчик', 'парень', 'герой', 'рыцарь', 'воин']
    : ['boy', 'guy', 'hero', 'knight', 'warrior']
  
  const girlKeywords = language === 'ru'
    ? ['девочка', 'девушка', 'принцесса', 'фея', 'королева']
    : ['girl', 'princess', 'fairy', 'queen']
  
  let genderElement = ''
  const lowerPrompt = prompt.toLowerCase()
  
  if (boyKeywords.some(keyword => lowerPrompt.includes(keyword))) {
    const boyPrompt = genderPrompts.boys[language][Math.floor(Math.random() * genderPrompts.boys[language].length)]
    genderElement = boyPrompt
  } else if (girlKeywords.some(keyword => lowerPrompt.includes(keyword))) {
    const girlPrompt = genderPrompts.girls[language][Math.floor(Math.random() * genderPrompts.girls[language].length)]
    genderElement = girlPrompt
  }
  
  // Формируем обогащенный промпт
  const enrichedPrompt = language === 'ru'
    ? `${prompt}. Сказочная атмосфера с элементами: ${randomSlavic}${genderElement ? `, ${genderElement}` : ''}. Высокодетализированная иллюстрация в стиле русских сказок, яркие насыщенные цвета, волшебная атмосфера`
    : `${prompt}. Fairy tale atmosphere with elements: ${randomSlavic}${genderElement ? `, ${genderElement}` : ''}. Highly detailed illustration in Russian fairy tale style, vibrant saturated colors, magical atmosphere`
  
  return enrichedPrompt
}

/**
 * Генерирует изображение с помощью Google Gemini 2.5 Flash через OpenRouter
 */
export async function generateGeminiImage(options: GeminiImageOptions): Promise<string> {
  const {
    prompt,
    userId,
    language = 'ru',
    aspectRatio = '1:1',
    seed,
    inputImageUrl
  } = options

  try {
    logger.info('Starting Gemini 2.5 Flash image generation', {
      userId,
      promptLength: prompt.length,
      language,
      aspectRatio
    })

    // Обогащаем промпт славянскими мотивами
    const enrichedPrompt = enrichPrompt(prompt, language)
    
    // Формируем финальный промпт с техническими требованиями
    const finalPrompt = inputImageUrl 
      ? `Transform this image: ${enrichedPrompt}. Aspect ratio: ${aspectRatio}. High quality, 8K resolution, professional photography`
      : `${enrichedPrompt}. Aspect ratio: ${aspectRatio}. High quality, 8K resolution, professional photography`

    // Подготавливаем запрос к OpenRouter
    const openRouterUrl = 'https://openrouter.ai/api/v1/chat/completions'
    const apiKey = process.env.OPENROUTER_API_KEY

    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is not configured')
    }

    // Подготавливаем контент сообщения
    const messageContent: any[] = [
      {
        type: 'text',
        text: finalPrompt
      }
    ]

    // Если есть входное изображение, добавляем его в запрос
    if (inputImageUrl) {
      // Если это URL Telegram, нужно скачать и конвертировать в base64
      if (inputImageUrl.includes('api.telegram.org')) {
        try {
          const imageResponse = await axios.get(inputImageUrl, { responseType: 'arraybuffer' })
          const base64Image = Buffer.from(imageResponse.data, 'binary').toString('base64')
          const mimeType = imageResponse.headers['content-type'] || 'image/jpeg'
          
          messageContent.push({
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`
            }
          })
        } catch (error) {
          logger.error('Failed to fetch input image', { inputImageUrl, error })
          throw new Error('Failed to fetch input image')
        }
      } else {
        // Если это обычный URL или уже base64
        messageContent.push({
          type: 'image_url',
          image_url: {
            url: inputImageUrl
          }
        })
      }
    }

    const requestBody = {
      model: 'google/gemini-2.5-flash-image-preview',
      messages: [
        {
          role: 'user',
          content: messageContent
        }
      ],
      temperature: 0.7,
      max_tokens: 1290,
      top_p: 0.9,
      seed: seed || Math.floor(Math.random() * 1000000)
    }

    logger.info('Sending request to OpenRouter', {
      model: 'google/gemini-2.5-flash-image-preview',
      promptPreview: finalPrompt.substring(0, 100) + '...'
    })

    const response = await axios.post<GeminiResponse>(
      openRouterUrl,
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://neuro-blogger.ru',
          'X-Title': 'Neuro Blogger Bot'
        },
        timeout: 60000 // 60 секунд таймаут
      }
    )

    if (!response.data?.choices?.[0]?.message?.content) {
      throw new Error('Invalid response from Gemini API')
    }

    // Извлекаем URL изображения из ответа
    const content = response.data.choices[0].message.content
    
    // Gemini возвращает изображение в base64 или URL
    let imageUrl: string
    
    // Проверяем, является ли контент URL или base64
    if (content.startsWith('http')) {
      imageUrl = content
    } else if (content.startsWith('data:image')) {
      // Если это base64, сохраняем локально
      const base64Data = content.replace(/^data:image\/\w+;base64,/, '')
      const buffer = Buffer.from(base64Data, 'base64')
      
      const fileName = `gemini_${userId}_${uuidv4()}.png`
      const filePath = path.join(process.cwd(), 'temp', fileName)
      
      // Создаем директорию если не существует
      const dir = path.dirname(filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      
      fs.writeFileSync(filePath, buffer)
      imageUrl = filePath
      
      logger.info('Saved base64 image locally', { filePath })
    } else {
      // Попробуем распарсить JSON ответ
      try {
        const jsonResponse = JSON.parse(content)
        if (jsonResponse.url) {
          imageUrl = jsonResponse.url
        } else if (jsonResponse.image_url) {
          imageUrl = jsonResponse.image_url
        } else {
          throw new Error('Could not extract image URL from response')
        }
      } catch (parseError) {
        logger.error('Failed to parse Gemini response', {
          content: content.substring(0, 200),
          error: parseError
        })
        throw new Error('Invalid image response format from Gemini')
      }
    }

    // Логируем статистику использования
    if (response.data.usage) {
      logger.info('Gemini usage statistics', {
        promptTokens: response.data.usage.prompt_tokens,
        completionTokens: response.data.usage.completion_tokens,
        totalTokens: response.data.usage.total_tokens,
        estimatedCost: '$' + (response.data.usage.total_tokens * 0.00003).toFixed(4)
      })
    }

    logger.info('Successfully generated image with Gemini 2.5 Flash', {
      userId,
      imageUrl: imageUrl.substring(0, 100)
    })

    return imageUrl

  } catch (error) {
    logger.error('Failed to generate image with Gemini', {
      error: error instanceof Error ? error.message : error,
      userId,
      prompt: prompt.substring(0, 100)
    })
    
    throw error
  }
}

/**
 * Проверяет доступность Gemini API
 */
export async function checkGeminiAvailability(): Promise<boolean> {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY
    
    if (!apiKey) {
      logger.warn('OPENROUTER_API_KEY is not configured')
      return false
    }

    const response = await axios.get('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 5000
    })

    // Проверяем наличие нужной модели
    const models = response.data?.data || []
    const geminiModel = models.find((m: any) => m.id === 'google/gemini-2.5-flash-image-preview')
    
    if (geminiModel) {
      logger.info('Gemini 2.5 Flash model is available', {
        modelId: geminiModel.id,
        contextLength: geminiModel.context_length
      })
      return true
    }

    logger.warn('Gemini 2.5 Flash model not found in available models')
    return false

  } catch (error) {
    logger.error('Failed to check Gemini availability', {
      error: error instanceof Error ? error.message : error
    })
    return false
  }
}

/**
 * Расчет стоимости генерации в звездах
 */
export function calculateGeminiCost(): number {
  // $0.039 за изображение согласно OpenRouter
  // 1 звезда = $0.016
  return Math.ceil(0.039 / 0.016) // = 3 звезды
}