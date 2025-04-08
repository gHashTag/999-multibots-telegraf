import { elevenlabs } from '@/core/elevenlabs'
import { logger } from '@/utils/logger'
import { TestResult } from './types'
import { supabase } from '@/core/supabase'
import { inngest } from '@/core/inngest'
import { v4 as uuidv4 } from 'uuid'
import { TEST_CONFIG } from './test-config'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { createTestError } from './test-logger'

/**
 * Настройки голоса
 */
interface VoiceSettings {
  stability: number
  similarity_boost: number
  style: number
  use_speaker_boost: boolean
}

/**
 * Информация о голосе
 */
interface Voice {
  voice_id: string
  name: string
  category: string
  description: string | null
  preview_url: string | null
  samples:
    | {
        sample_id: string
        file_name: string
        mime_type: string
        size_bytes: number
        hash: string
      }[]
    | null
  settings: VoiceSettings | null
  labels: Record<string, string>
  created_at_unix: number | null
}

/**
 * Тестирует получение списка голосов
 * @returns Promise<TestResult> - Результат тестирования
 */
export async function testGetVoices(): Promise<TestResult> {
  try {
    logger.info('🎯 Тест получения списка голосов', {
      description: 'Testing voice list retrieval',
      test_name: 'Get voices test',
    })

    // Проверяем наличие API ключа
    if (!process.env.ELEVEN_LABS_API_KEY) {
      logger.warn('⚠️ Отсутствует API ключ ElevenLabs', {
        description: 'Missing ElevenLabs API key',
        test_name: 'Get voices test',
      })

      return {
        name: 'Get voices test',
        success: false,
        message: 'Отсутствует API ключ ElevenLabs',
        error: new Error('Missing ElevenLabs API key'),
        startTime: Date.now(),
      }
    }

    const response = await elevenlabs.voices.getAll()
    const voices = response.voices as unknown as Voice[]

    if (!voices || voices.length === 0) {
      logger.warn('⚠️ Список голосов пуст', {
        description: 'Voice list is empty',
        test_name: 'Get voices test',
      })

      return {
        name: 'Get voices test',
        success: false,
        message: 'Список голосов пуст',
        error: new Error('Empty voice list'),
        startTime: Date.now(),
      }
    }

    // Собираем статистику по категориям
    const categories = new Map<string, number>()
    voices.forEach((voice: Voice) => {
      const count = categories.get(voice.category) || 0
      categories.set(voice.category, count + 1)
    })

    logger.info('📊 Статистика по категориям голосов', {
      description: 'Voice categories statistics',
      test_name: 'Get voices test',
      categories: Object.fromEntries(categories),
      voiceCount: voices.length,
    })

    // Логируем информацию о каждом голосе
    voices.forEach((voice: Voice) => {
      logger.debug('🗣️ Информация о голосе', {
        description: 'Voice details',
        test_name: 'Get voices test',
        voice_id: voice.voice_id,
        name: voice.name,
        category: voice.category,
      })
    })

    return {
      name: 'Get voices test',
      success: true,
      message: `Получено ${voices.length} голосов`,
      startTime: Date.now(),
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const err = error instanceof Error ? error : new Error(errorMessage)

    logger.error('❌ Ошибка при получении списка голосов', {
      description: 'Error getting voice list',
      test_name: 'Get voices test',
      error: errorMessage,
    })

    return {
      name: 'Get voices test',
      success: false,
      message: 'Ошибка при получении списка голосов',
      error: err,
      startTime: Date.now(),
    }
  }
}

/**
 * Тестирует все функции, связанные с голосами
 * @returns Promise<TestResult> - Результат тестирования
 */
export async function testVoices(): Promise<TestResult> {
  const testName = 'Voice Tests'
  const testTelegramId = Date.now().toString()
  const testBotName = TEST_CONFIG.TEST_BOT_NAME
  const testText = 'Hello, this is a test message for voice generation.'
  const testVoiceId = TEST_CONFIG.TEST_VOICE_ID || 'pNInz6obpgDQGcFmaJgB' // Adam voice as default

  try {
    logger.info('🚀 Начинаем тесты голосовых функций', {
      description: 'Starting voice tests',
      test_telegram_id: testTelegramId,
      test_bot_name: testBotName,
    })

    // Проверяем наличие API ключа
    if (!process.env.ELEVEN_LABS_API_KEY) {
      throw new Error('Отсутствует API ключ ElevenLabs')
    }

    // Создаем тестового пользователя
    const { error: createError } = await supabase.from('users').insert({
      telegram_id: testTelegramId,
      username: `test_user_${testTelegramId}`,
      bot_name: testBotName,
    })

    if (createError) {
      throw new Error(`Ошибка создания пользователя: ${createError.message}`)
    }

    logger.info('👤 Создан тестовый пользователь', {
      description: 'Test user created',
      telegram_id: testTelegramId,
      bot_name: testBotName,
    })

    // Пополняем баланс пользователя
    const addInv_id = uuidv4()
    await inngest.send({
      name: 'payment/process',
      data: {
        telegram_id: testTelegramId,
        amount: 100,
        type: 'money_income',
        description: 'Test add stars for voice generation',
        bot_name: testBotName,
        inv_id: addInv_id,
        service_type: ModeEnum.TopUpBalance,
        test_mode: true,
      },
    })

    logger.info('💰 Отправлен запрос на пополнение баланса', {
      description: 'Balance top-up request sent',
      amount: 100,
      inv_id: addInv_id,
    })

    // Проверяем баланс после пополнения
    const balanceAfterAdd = await getUserBalance(testTelegramId)
    if (balanceAfterAdd !== 100) {
      throw new Error(
        `Неверный баланс после пополнения: ${balanceAfterAdd}, ожидалось: 100`
      )
    }

    logger.info('✅ Баланс успешно пополнен', {
      description: 'Balance topped up successfully',
      balance: balanceAfterAdd,
    })

    // Отправляем запрос на генерацию голоса
    const voiceInv_id = uuidv4()
    await inngest.send({
      name: 'voice/generate',
      data: {
        telegram_id: testTelegramId,
        text: testText,
        voice_id: testVoiceId,
        bot_name: testBotName,
        inv_id: voiceInv_id,
        test_mode: true,
      },
    })

    logger.info('🎤 Отправлен запрос на генерацию голоса', {
      description: 'Voice generation request sent',
      text: testText,
      voice_id: testVoiceId,
      inv_id: voiceInv_id,
    })

    // Проверяем баланс после генерации
    const balanceAfterVoice = await getUserBalance(testTelegramId)
    const expectedBalance = balanceAfterAdd - TEST_CONFIG.VOICE_GENERATION_COST

    if (balanceAfterVoice !== expectedBalance) {
      throw new Error(
        `Неверный баланс после генерации голоса: ${balanceAfterVoice}, ожидалось: ${expectedBalance}`
      )
    }

    logger.info('✅ Баланс корректно уменьшен после генерации голоса', {
      description: 'Balance correctly reduced after voice generation',
      balance: balanceAfterVoice,
      cost: TEST_CONFIG.VOICE_GENERATION_COST,
    })

    // Проверяем запись в таблице voice_generations
    const { data: voiceGeneration, error: voiceError } = await supabase
      .from('voice_generations')
      .select('*')
      .eq('inv_id', voiceInv_id)
      .single()

    if (voiceError || !voiceGeneration) {
      throw new Error(
        `Ошибка при проверке записи генерации голоса: ${
          voiceError?.message || 'Запись не найдена'
        }`
      )
    }

    logger.info('✅ Запись о генерации голоса создана', {
      description: 'Voice generation record created',
      voice_generation: voiceGeneration,
    })

    // Очищаем тестовые данные, если указано в конфигурации
    if (TEST_CONFIG.CLEANUP_TEST_DATA) {
      const { error: deleteUserError } = await supabase
        .from('users')
        .delete()
        .eq('telegram_id', testTelegramId)

      if (deleteUserError) {
        logger.warn('⚠️ Ошибка при удалении тестового пользователя', {
          description: 'Error deleting test user',
          error: deleteUserError.message,
        })
      }

      const { error: deleteVoiceError } = await supabase
        .from('voice_generations')
        .delete()
        .eq('inv_id', voiceInv_id)

      if (deleteVoiceError) {
        logger.warn('⚠️ Ошибка при удалении записи о генерации голоса', {
          description: 'Error deleting voice generation record',
          error: deleteVoiceError.message,
        })
      }

      logger.info('🧹 Тестовые данные очищены', {
        description: 'Test data cleaned up',
      })
    }

    return {
      name: testName,
      success: true,
      message: 'Тесты голосовых функций успешно завершены',
      startTime: Date.now(),
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const err = error instanceof Error ? error : new Error(errorMessage)

    logger.error('❌ Ошибка при тестировании голосовых функций', {
      description: 'Error in voice tests',
      error: errorMessage,
    })

    // Пытаемся очистить тестовые данные даже в случае ошибки
    if (TEST_CONFIG.CLEANUP_TEST_DATA) {
      try {
        await supabase.from('users').delete().eq('telegram_id', testTelegramId)
        logger.info('🧹 Тестовые данные очищены после ошибки', {
          description: 'Test data cleaned up after error',
        })
      } catch (cleanupError) {
        logger.warn('⚠️ Ошибка при очистке тестовых данных', {
          description: 'Error cleaning up test data',
          error:
            cleanupError instanceof Error
              ? cleanupError.message
              : String(cleanupError),
        })
      }
    }

    return {
      name: testName,
      success: false,
      message: 'Ошибка при тестировании голосовых функций',
      error: err,
      startTime: Date.now(),
    }
  }
}

export async function runVoiceTests(): Promise<TestResult[]> {
  const results: TestResult[] = []
  const startTime = Date.now()

  try {
    logger.info('🎤 Запуск тестов голосовых функций')

    // Тест создания голоса
    try {
      const voiceResult = await createTestVoice()
      results.push({
        name: 'Voice Creation Test',
        success: true,
        message: 'Голос успешно создан',
        startTime,
        details: voiceResult,
      })
    } catch (error) {
      logger.error(`❌ Ошибка при создании голоса: ${error}`)
      results.push({
        name: 'Voice Creation Test',
        success: false,
        message: 'Ошибка при создании голоса',
        error: createTestError(error),
        startTime,
      })
    }

    // Тест генерации речи
    try {
      const speechResult = await generateTestSpeech()
      results.push({
        name: 'Speech Generation Test',
        success: true,
        message: 'Речь успешно сгенерирована',
        startTime,
        details: speechResult,
      })
    } catch (error) {
      logger.error(`❌ Ошибка при генерации речи: ${error}`)
      results.push({
        name: 'Speech Generation Test',
        success: false,
        message: 'Ошибка при генерации речи',
        error: createTestError(error),
        startTime,
      })
    }

    return results
  } catch (error) {
    logger.error(`❌ Критическая ошибка в тестах голосовых функций: ${error}`)
    results.push({
      name: 'Voice Tests',
      success: false,
      message: 'Критическая ошибка в тестах голосовых функций',
      error: createTestError(error),
      startTime,
    })
    return results
  }
}

async function createTestVoice() {
  // Здесь должна быть реализация создания тестового голоса
  return { voice_id: 'test_voice_id' }
}

async function generateTestSpeech() {
  // Здесь должна быть реализация генерации тестовой речи
  return { audio_url: 'test_audio_url' }
}
