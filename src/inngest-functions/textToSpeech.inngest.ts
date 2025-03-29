import { inngest } from '@/core/inngest/clients'
import { getBotByName } from '@/core/bot'
import {
  getUserByTelegramIdString,
  updateUserLevelPlusOne,
} from '@/core/supabase'
import { errorMessage, errorMessageAdmin } from '@/helpers'
import { InputFile } from 'telegraf/typings/core/types/typegram'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { sendBalanceMessage } from '@/price/helpers'
import { v4 as uuidv4 } from 'uuid'
import { elevenlabs } from '@/core/elevenlabs'
import { calculateModeCost } from '@/price/helpers/modelsCost'
import * as path from 'path'
import * as os from 'os'
import { logger } from '@/utils/logger'
import { supabase } from '@/core/supabase'
import { Telegraf } from 'telegraf'

interface TextToSpeechParams {
  text: string
  voice_id: string
  telegram_id: string
  is_ru: boolean
  bot_name: string
  username?: string
}

interface PaymentResult {
  data?: {
    newBalance: number
  }
}

/**
 * Генерирует аудио буфер из текста используя ElevenLabs API
 */
export async function generateAudioBuffer(
  text: string,
  voice_id: string
): Promise<Buffer> {
  logger.info({
    message: '🚀 Начинаем генерацию аудио',
    description: 'Starting audio generation',
    text,
    voice_id,
    timestamp: new Date().toISOString(),
  })

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`
  const headers = {
    'xi-api-key': process.env.ELEVENLABS_API_KEY as string,
    'Content-Type': 'application/json',
  }

  const body = {
    text,
    model_id: 'eleven_turbo_v2_5',
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
    },
  }

  logger.info({
    message: '📡 Отправляем запрос к ElevenLabs API',
    description: 'Sending request to ElevenLabs API',
    url,
    voice_id,
    timestamp: new Date().toISOString(),
  })

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new Error(
        `ElevenLabs API вернула ошибку: ${response.status} ${response.statusText}`
      )
    }

    if (!response.body) {
      throw new Error('Не получен стрим от API')
    }

    logger.info({
      message: '📡 Получен ответ от API, начинаем чтение бинарных данных',
      description: 'Response received from API, starting binary data reading',
      timestamp: new Date().toISOString(),
    })

    const chunks: Uint8Array[] = []
    let totalSize = 0
    let isReading = true

    const reader = response.body.getReader()

    while (isReading) {
      const { done, value } = await reader.read()

      if (done) {
        logger.info({
          message: '✅ Чтение стрима завершено',
          description: 'Stream reading completed',
          totalSize,
          timestamp: new Date().toISOString(),
        })
        isReading = false
        continue
      }

      chunks.push(value)
      totalSize += value.length
      logger.debug({
        message: '📦 Получен чанк данных',
        description: 'Data chunk received',
        chunkSize: value.length,
        totalSize,
        timestamp: new Date().toISOString(),
      })
    }

    const audioBuffer = Buffer.concat(chunks)
    logger.info({
      message: '✅ Аудио буфер создан',
      description: 'Audio buffer created',
      size: audioBuffer.length,
      timestamp: new Date().toISOString(),
    })

    if (audioBuffer.length === 0) {
      throw new Error('Получен пустой аудио буфер')
    }

    return audioBuffer
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при генерации аудио',
      description: 'Error generating audio',
      error: error instanceof Error ? error.message : String(error),
      voice_id,
      timestamp: new Date().toISOString(),
    })
    throw error
  }
}

// Основная функция генерации аудио
export async function generateSpeech(
  params: TextToSpeechParams
): Promise<void> {
  const { text, voice_id, telegram_id, is_ru, bot_name, username } = params

  logger.info({
    message: '🎙️ Начало генерации речи',
    description: 'Starting speech generation',
    params: {
      textLength: text.length,
      voice_id,
      telegram_id,
      is_ru,
      bot_name,
      username,
    },
  })

  try {
    // Получаем баланс пользователя
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('balance')
      .eq('telegram_id', telegram_id)
      .single()

    if (userError || !userData) {
      logger.error({
        message: '❌ Ошибка при получении баланса пользователя',
        description: 'Error getting user balance',
        error: userError?.message,
        telegram_id,
      })
      throw new Error('Ошибка при получении баланса пользователя')
    }

    const cost = calculateModeCost({ mode: ModeEnum.TextToSpeech }).stars
    const currentBalance = userData.balance

    logger.info({
      message: '💰 Проверка баланса',
      description: 'Checking balance',
      currentBalance,
      cost,
      telegram_id,
    })

    if (currentBalance < cost) {
      logger.warn({
        message: '⚠️ Недостаточно средств',
        description: 'Insufficient funds',
        currentBalance,
        cost,
        telegram_id,
      })
      throw new Error('Недостаточно средств')
    }

    // Генерируем аудио
    logger.info({
      message: '🎵 Генерация аудио через ElevenLabs',
      description: 'Generating audio via ElevenLabs',
      text: text.substring(0, 50) + '...',
      voice_id,
    })

    const audioBuffer = await generateAudioBuffer(text, voice_id)

    logger.info({
      message: '📦 Аудио буфер получен',
      description: 'Audio buffer received',
      bufferType: typeof audioBuffer,
      hasData: !!audioBuffer,
      isBuffer: Buffer.isBuffer(audioBuffer),
      bufferLength: audioBuffer?.length,
    })

    // Обновляем баланс пользователя
    const newBalance = currentBalance - cost
    const { error: updateError } = await supabase
      .from('users')
      .update({ balance: newBalance })
      .eq('telegram_id', telegram_id)

    if (updateError) {
      logger.error({
        message: '❌ Ошибка при обновлении баланса',
        description: 'Error updating balance',
        error: updateError.message,
        telegram_id,
      })
      throw new Error('Ошибка при обновлении баланса')
    }

    // Создаем запись о платеже
    const { error: paymentError } = await supabase.from('payments').insert({
      telegram_id,
      amount: cost,
      type: 'text-to-speech',
      status: 'completed',
    })

    if (paymentError) {
      logger.error({
        message: '❌ Ошибка при создании записи о платеже',
        description: 'Error creating payment record',
        error: paymentError.message,
        telegram_id,
      })
    }

    // Отправляем аудио
    logger.info({
      message: '📤 Подготовка к отправке аудио',
      description: 'Preparing to send audio',
      telegram_id,
      audioBufferSize: audioBuffer?.length,
    })

    const { bot } = getBotByName(bot_name)
    if (!bot) {
      logger.error({
        message: '❌ Бот не найден',
        description: 'Bot instance not found',
        bot_name,
      })
      throw new Error('Бот не найден')
    }

    try {
      logger.info({
        message: '🚀 Отправка аудио в Telegram',
        description: 'Sending audio to Telegram',
        telegram_id,
      })

      await (bot as Telegraf<any>).telegram.sendAudio(
        telegram_id,
        { source: audioBuffer },
        {
          caption: is_ru
            ? `💫 Ваш текст успешно преобразован в речь!\n\nОстаток баланса: ${newBalance} ⭐️`
            : `💫 Your text has been successfully converted to speech!\n\nRemaining balance: ${newBalance} ⭐️`,
        }
      )

      logger.info({
        message: '✅ Аудио успешно отправлено',
        description: 'Audio successfully sent',
        telegram_id,
      })
    } catch (sendError) {
      logger.error({
        message: '❌ Ошибка при отправке аудио',
        description: 'Error sending audio',
        error:
          sendError instanceof Error ? sendError.message : String(sendError),
        telegram_id,
        audioBufferInfo: {
          type: typeof audioBuffer,
          isBuffer: Buffer.isBuffer(audioBuffer),
          length: audioBuffer?.length,
          hasData: !!audioBuffer,
        },
      })
      throw sendError
    }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка в процессе генерации речи',
      description: 'Error in speech generation process',
      error: error instanceof Error ? error.message : String(error),
      params: {
        textLength: text.length,
        voice_id,
        telegram_id,
        is_ru,
        bot_name,
      },
    })
    throw error
  }
}

// Inngest функция для обратной совместимости
export const textToSpeechFunction = inngest.createFunction(
  {
    name: 'text-to-speech-generation',
    id: 'text-to-speech',
    concurrency: { limit: 5 },
    retries: 2,
  },
  { event: 'text-to-speech.requested' },
  async ({ event }: any) => {
    await generateSpeech(event.data)
    return { success: true }
  }
)
