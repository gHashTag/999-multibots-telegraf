import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { TestResult } from '../types'
import { v4 as uuidv4 } from 'uuid'
import { TEST_CONFIG } from '../test-config'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { getUserBalance } from '@/core/supabase/getUserBalance'

export async function testImageToPrompt(): Promise<TestResult> {
  const testName = 'Image to Prompt Test'
  const testTelegramId = Date.now().toString()
  const testBotName = TEST_CONFIG.TEST_BOT_NAME
  const testImageUrl = TEST_CONFIG.TEST_IMAGE_URL

  try {
    logger.info('🚀 Начинаем тест преобразования изображения в промпт', {
      description: 'Starting image to prompt test',
      test_telegram_id: testTelegramId,
      test_bot_name: testBotName,
    })

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
    const addInv_id = `${testTelegramId}-${Date.now()}`
    await TEST_CONFIG.inngestEngine.send({
      name: 'payment/process',
      data: {
        telegram_id: testTelegramId,
        amount: 100,
        type: 'money_income',
        description: 'Test add stars for image processing',
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
        `Баланс после пополнения ${balanceAfterAdd}, ожидалось 100`
      )
    }

    logger.info('✅ Баланс пополнен', {
      description: 'Balance topped up',
      balance: balanceAfterAdd,
    })

    // Отправляем запрос на обработку изображения
    const eventId = uuidv4()
    await TEST_CONFIG.inngestEngine.send({
      name: 'image/process',
      data: {
        telegram_id: testTelegramId,
        bot_name: testBotName,
        image_url: testImageUrl,
        event_id: eventId,
        test_mode: true,
        service_type: ModeEnum.ImageToPrompt,
      },
    })

    logger.info('🖼️ Отправлен запрос на обработку изображения', {
      description: 'Image processing request sent',
      event_id: eventId,
      image_url: testImageUrl,
    })

    // Отправляем запрос на генерацию промпта
    await TEST_CONFIG.inngestEngine.send({
      name: 'image/to-prompt.generate',
      data: {
        telegram_id: testTelegramId,
        username: `test_user_${testTelegramId}`,
        bot_name: testBotName,
        image: testImageUrl,
        is_ru: true,
        cost_per_image: 1.875,
      },
    })

    logger.info('🎯 Отправлен запрос на генерацию промпта', {
      description: 'Prompt generation request sent',
      telegram_id: testTelegramId,
      image_url: testImageUrl,
    })

    // Ждем обработки изображения
    const startTime = Date.now()
    const timeout = 10000 // 10 секунд
    let imageProcessed = false

    while (Date.now() - startTime < timeout) {
      const { data: event, error: eventError } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .eq('telegram_id', testTelegramId)
        .eq('bot_name', testBotName)
        .single()

      if (eventError) {
        throw new Error(`Ошибка получения события: ${eventError.message}`)
      }

      if (event?.status === 'completed') {
        imageProcessed = true
        break
      }

      await new Promise(resolve => setTimeout(resolve, 500))
    }

    if (!imageProcessed) {
      throw new Error('Таймаут обработки изображения')
    }

    logger.info('✅ Изображение обработано', {
      description: 'Image processed',
      event_id: eventId,
    })

    // Проверяем баланс после обработки
    const finalBalance = await getUserBalance(testTelegramId)
    const expectedCost = 1.875 // Стоимость для режима ImageToPrompt
    const expectedBalance = balanceAfterAdd - expectedCost

    if (Math.abs(finalBalance - expectedBalance) > 0.01) {
      throw new Error(
        `Некорректное списание за обработку изображения. Ожидалось: ${expectedBalance}, получено: ${finalBalance}`
      )
    }

    logger.info('💰 Проверка баланса после обработки', {
      description: 'Balance check after processing',
      initial_balance: balanceAfterAdd,
      final_balance: finalBalance,
      cost: expectedCost,
    })

    // Очистка тестовых данных
    if (TEST_CONFIG.cleanupAfterEach) {
      await Promise.all([
        supabase
          .from('users')
          .delete()
          .eq('telegram_id', testTelegramId)
          .eq('bot_name', testBotName),
        supabase
          .from('events')
          .delete()
          .eq('telegram_id', testTelegramId)
          .eq('bot_name', testBotName),
      ])

      logger.info('🧹 Тестовые данные очищены', {
        description: 'Test data cleaned up',
        telegram_id: testTelegramId,
        bot_name: testBotName,
      })
    }

    return {
      name: testName,
      success: true,
      message: 'Тест преобразования изображения успешно пройден',
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))

    logger.error('❌ Ошибка при тестировании преобразования изображения', {
      description: 'Error in image to prompt test',
      error: error.message,
      telegram_id: testTelegramId,
      bot_name: testBotName,
    })

    return {
      name: testName,
      success: false,
      message: 'Ошибка при тестировании преобразования изображения',
      error,
    }
  }
}
