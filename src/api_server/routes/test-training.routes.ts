import { Router } from 'express'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import { supabase } from '@/core/supabase'
import { inngest } from '@/inngest_app/client'
import { telegramApiFor } from '@/services/telegramApi'

const router = Router()

/**
 * 🧪 ТЕСТОВЫЙ РЕЖИМ - Бесплатная эмуляция тренировки модели
 *
 * Этот endpoint позволяет тестировать весь процесс тренировки БЕСПЛАТНО:
 * - НЕ тратит токены Replicate
 * - НЕ создает реальные модели
 * - Эмулирует процесс с реалистичными задержками
 * - В конце отправляет успешный callback через Inngest
 *
 * Использовать для:
 * - Тестирования интерфейса
 * - Проверки webhook'ов
 * - Демонстрации функциональности
 * - Разработки без трат
 */

interface TestTrainingRequest {
  triggerWord: string
  modelName: string
  telegramId: string
  isRu?: boolean
  steps?: number
  botName?: string
}

router.post('/test-training', async (req, res) => {
  // Debug-only endpoint (currently unmounted). It writes a model_trainings row
  // and sends Telegram messages for an ARBITRARY telegramId with no auth. Gate it
  // out of production so wiring it up later cannot expose an unauthenticated
  // write/notify vector; enable only in dev.
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).json({ error: 'Not found' })
  }
  const startTime = Date.now()
  const requestId = `test-${Date.now()}`

  logger.info(`[TEST TRAINING] 🧪 ${requestId} - Started`, {
    body: req.body,
    ip: req.ip,
  })

  try {
    // Валидация входных данных
    const {
      triggerWord,
      modelName,
      telegramId,
      isRu = false,
      steps = 1000,
      botName = 'neuro_blogger_bot',
    }: TestTrainingRequest = req.body

    if (!triggerWord || !modelName || !telegramId) {
      return res.status(400).json({
        error: 'Missing required fields: triggerWord, modelName, telegramId',
      })
    }

    // БЕСПЛАТНАЯ эмуляция - проверяем баланс только виртуально
    logger.info(`[TEST TRAINING] ${requestId} - Checking virtual balance`, {
      telegramId,
      cost: 0, // Тестовый режим БЕСПЛАТНЫЙ!
    })

    // Сохраняем запись о "тренировке" в БД
    const testTrainingId = requestId
    const trainingRecord = {
      telegram_id: telegramId,
      model_name: modelName,
      trigger_word: triggerWord,
      zip_url: 'test://mock.zip', // Мок URL
      replicate_training_id: testTrainingId,
      status: 'processing',
      bot_name: botName,
      steps: steps,
      gender: 'unknown',
      created_at: new Date().toISOString(),
    }

    const { error: dbError } = await supabase
      .from('model_trainings')
      .insert(trainingRecord)

    if (dbError) {
      logger.error(`[TEST TRAINING] ${requestId} - DB insert failed`, {
        error: dbError.message,
      })
      return res.status(500).json({ error: 'Database error' })
    }

    logger.info(`[TEST TRAINING] ${requestId} - Training record saved`, {
      trainingId: testTrainingId,
      telegramId,
    })

    // Отправляем пользователю сообщение о начале тестовой тренировки
    const token =
      process.env.TELEGRAM_BOT_TOKEN_TEST_1 ||
      process.env.TELEGRAM_BOT_TOKEN ||
      ''
    const message = isRu
      ? `🧪 ТЕСТОВЫЙ РЕЖИМ АКТИВИРОВАН!\n\n✅ Тренировка запущена БЕСПЛАТНО\n🆔 Test ID: ${testTrainingId}\n⏱️ Время: 30 секунд (эмуляция)\n\n💡 Это тест - деньги НЕ снимаются!`
      : `🧪 TEST MODE ACTIVATED!\n\n✅ Training started for FREE\n🆔 Test ID: ${testTrainingId}\n⏱️ Time: 30 seconds (emulation)\n\n💡 This is a test - NO CHARGES!`

    try {
      const response = await fetch(`${telegramApiFor(token)}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: telegramId, text: message }),
      })
      if (response.ok) {
        logger.info(`[TEST TRAINING] ${requestId} - Initial message sent`, {
          telegramId,
        })
      }
    } catch (msgError) {
      logger.warn(`[TEST TRAINING] ${requestId} - Failed to send message`, {
        error: msgError instanceof Error ? msgError.message : String(msgError),
      })
    }

    // Запускаем асинхронную эмуляцию
    setTimeout(async () => {
      await simulateTraining(
        testTrainingId,
        {
          telegramId,
          modelName,
          triggerWord,
          botName,
        },
        isRu
      )
    }, 2000) // Начинаем через 2 секунды

    // Сразу возвращаем ответ пользователю
    const responseMessage = isRu
      ? `🧪 Тестовая тренировка запущена!\n\n📦 Модель: ${modelName}\n🆔 Test ID: ${testTrainingId}\n⏱️ Время: ~30 секунд (эмуляция)\n\n🔗 Ссылка: https://replicate.com/models/${testTrainingId}\n\n💡 Это БЕСПЛАТНЫЙ тест - деньги не снимаются!\n⏰ Статус обновится автоматически через 30 сек.`
      : `🧪 Test training started!\n\n📦 Model: ${modelName}\n🆔 Test ID: ${testTrainingId}\n⏱️ Time: ~30 seconds (emulation)\n\n🔗 Link: https://replicate.com/models/${testTrainingId}\n\n💡 This is a FREE test - NO CHARGES!\n⏰ Status will update automatically in 30 sec.`

    res.json({
      success: true,
      message: responseMessage,
      model_id: modelName,
      bot_name: botName,
      training_id: testTrainingId,
      test_mode: true,
      elapsed_ms: Date.now() - startTime,
    })
  } catch (error) {
    logger.error(`[TEST TRAINING] ${requestId} - Error`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * Эмулирует процесс тренировки с реалистичными этапами
 */
async function simulateTraining(
  testTrainingId: string,
  params: {
    telegramId: string
    modelName: string
    triggerWord: string
    botName: string
  },
  isRu: boolean
) {
  const { telegramId, modelName, triggerWord, botName } = params

  try {
    logger.info(`[TEST TRAINING] ${testTrainingId} - Starting simulation`)

    // Этап 1: Подготовка данных (5 секунд)
    await delay(5000)
    logger.info(
      `[TEST TRAINING] ${testTrainingId} - Stage 1: Data preparation complete`
    )

    // Этап 2: Обучение модели (20 секунд)
    await delay(20000)
    logger.info(
      `[TEST TRAINING] ${testTrainingId} - Stage 2: Model training complete`
    )

    // Этап 3: Финализация (5 секунд)
    await delay(5000)
    logger.info(
      `[TEST TRAINING] ${testTrainingId} - Stage 3: Finalization complete`
    )

    // Обновляем статус в БД на "успешно"
    await supabase
      .from('model_trainings')
      .update({
        status: 'succeeded',
        updated_at: new Date().toISOString(),
      })
      .eq('replicate_training_id', testTrainingId)

    logger.info(
      `[TEST TRAINING] ${testTrainingId} - Status updated to succeeded`
    )

    // Отправляем webhook callback в Inngest (как это делает Replicate)
    await inngest.send({
      name: 'model/training.completed',
      data: {
        training_id: testTrainingId,
        status: 'succeeded',
        output: {
          version: `test-version-${Date.now()}`,
          weights: `test-weights-${Date.now()}`,
        },
        telegram_id: telegramId,
        model_name: modelName,
        trigger_word: triggerWord,
        bot_name: botName,
        test_mode: true,
      },
    })

    logger.info(`[TEST TRAINING] ${testTrainingId} - Event sent to Inngest`)

    // Отправляем пользователю уведомление о готовности
    const token2 =
      process.env.TELEGRAM_BOT_TOKEN_TEST_1 ||
      process.env.TELEGRAM_BOT_TOKEN ||
      ''
    const successMessage = isRu
      ? `🎉 ТЕСТОВАЯ ТРЕНИРОВКА ЗАВЕРШЕНА!\n\n✅ Модель готова к использованию\n📦 Название: ${modelName}\n🏷️ Триггер: ${triggerWord}\n🆔 Test ID: ${testTrainingId}\n\n💡 Это был БЕСПЛАТНЫЙ тест!\n🔗 Ссылка: https://replicate.com/models/${testTrainingId}`
      : `🎉 TEST TRAINING COMPLETED!\n\n✅ Model is ready to use\n📦 Name: ${modelName}\n🏷️ Trigger: ${triggerWord}\n🆔 Test ID: ${testTrainingId}\n\n💡 This was a FREE test!\n🔗 Link: https://replicate.com/models/${testTrainingId}`

    await fetch(`${telegramApiFor(token2)}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: telegramId, text: successMessage }),
    })
    logger.info(
      `[TEST TRAINING] ${testTrainingId} - Success message sent to user`
    )
  } catch (error) {
    logger.error(`[TEST TRAINING] ${testTrainingId} - Simulation error`, {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export default router
