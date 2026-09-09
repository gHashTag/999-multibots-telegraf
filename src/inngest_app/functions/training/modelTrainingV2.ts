import { inngest } from '@/inngest_app/client'
import { getBotByName } from '@/core/bot'
import {
  getUserByTelegramId,
  updateUserBalance,
  updateUserLevelPlusOne,
  getUserBalance,
  createModelTrainingV2,
} from '@/core/supabase'
import { processBalanceOperation } from '@/price/helpers'
// import { modeCosts } from '@/price/helpers/modelsCost' // Проверьте, нужен ли modeCosts здесь
import { ModeEnum } from '@/interfaces/modes'
import { calculateModeCost } from '@/price/helpers/modelsCost' // Импортируем calculateModeCost, если он нужен
import { errorMessageAdmin } from '@/helpers/error/errorMessageAdmin'
import axios from 'axios'
import { logger } from '@/utils/logger'
import { PaymentType } from '@/interfaces/payments.interface'
import { NonRetriableError } from 'inngest'
import { createInngestFailureHandler } from '@/inngest_app/client'
import { isSafeMode, skippedInSafeMode } from '@/inngest_app/safeMode' // For v3 migration

interface TrainingResponse {
  id: string
  status: string
  urls: { get: string }
  error?: string
  finetune_id?: string
}

// Функция для кодирования файла в base64
async function encodeFileToBase64(url: string): Promise<string> {
  // Explicit timeout: this download runs AFTER the balance charge (check-balance
  // step) and its only refund path is the outer catch, reached solely by a
  // thrown error. axios default timeout is 0 (infinite), so a half-open/silent
  // host would hang forever, never throw, and leave the user charged with no
  // model and no refund. A bounded timeout converts a hang into a throw so the
  // existing refund-balance step runs. 180s is generous for a biometric ZIP.
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 180000,
  })
  const buffer = Buffer.from(response.data)
  return buffer.toString('base64')
}

// Создаем Inngest функцию
export const modelTrainingV2 = inngest.createFunction(
  {
    // Canonical id (spec-first manifest). Legacy id was 'model-training-v2'.
    id: 'training-model-v2-start',
    name: '🚀 Model Training V2', // Optional display name
    // Charges balance + paid training API → admin visibility on failure.
    onFailure: createInngestFailureHandler('training-model-v2-start'),
  },
  // Canonical event first, legacy event kept for existing senders.
  [{ event: 'training/model-v2.start' }, { event: 'model/training.v2.requested' }],
  async ({ event, step, runId }) => {
    logger.info('🚀 Model training initiated', {
      runId: runId, // Use runId from args
      data: event.data,
    })

    const {
      zipUrl,
      triggerWord,
      modelName,
      steps,
      telegram_id,
      is_ru,
      bot_name,
      gender,
    } = event.data

    // Проверяем существование пользователя в базе
    const userExists = await step.run('check-user-exists', async () => {
      logger.info('🔍 Checking user existence', {
        telegramId: telegram_id,
        step: 'check-user-exists',
      })

      const user = await getUserByTelegramId(telegram_id)
      if (!user) {
        logger.error('❌ User not found', {
          telegramId: telegram_id,
          step: 'check-user-exists',
        })
        // Retrying cannot create the user — terminal.
        throw new NonRetriableError(
          `User with ID ${telegram_id} does not exist.`
        )
      }

      logger.info('✅ User found', {
        telegramId: telegram_id,
        userId: user.id,
        step: 'check-user-exists',
      })

      return user
    })

    // Увеличиваем уровень пользователя, если он на уровне 0
    if (userExists.level === 0) {
      await step.run('update-user-level', async () => {
        logger.info('⬆️ Upgrading user level from 0 to 1', {
          telegramId: telegram_id,
          currentLevel: userExists.level,
          step: 'update-user-level',
        })

        await updateUserLevelPlusOne(telegram_id, userExists.level)

        logger.info('✅ User level updated successfully', {
          telegramId: telegram_id,
          newLevel: 1,
          step: 'update-user-level',
        })
      })
    }

    // Получаем бот по имени
    const botData = (await step.run('get-bot', async () => {
      logger.info('🤖 Getting bot instance', {
        botName: bot_name,
        step: 'get-bot',
      })

      return getBotByName(bot_name)
    })) as { bot: any }

    // Извлекаем бота из результата функции getBotByName
    const bot = botData.bot

    // Safe mode: everything below charges the balance and calls a paid
    // training provider — stop here with an explicit marker.
    if (isSafeMode(event)) {
      const skipped = skippedInSafeMode('check-balance + create-training')
      logger.warn('🛡️ [TRAINING V2] safe mode — charge and training skipped', {
        telegramId: telegram_id,
        ...skipped,
      })
      return { success: false, ...skipped }
    }

    // Проверяем баланс и рассчитываем стоимость
    const { currentBalance, paymentAmount } = await step.run(
      'check-balance',
      async () => {
        logger.info('💰 Checking user balance', {
          telegramId: telegram_id,
          botName: bot_name,
          step: 'check-balance',
        })

        const currentBalance = await getUserBalance(telegram_id)

        logger.info('💲 Current user balance', {
          telegramId: telegram_id,
          balance: currentBalance,
          step: 'check-balance',
        })

        const paymentAmount = (
          calculateModeCost[ModeEnum.DigitalAvatarBodyV2] as (
            steps: number
          ) => number
        )(steps)

        logger.info('🧮 Calculated payment amount', {
          telegramId: telegram_id,
          paymentAmount: paymentAmount,
          trainingSteps: steps,
          step: 'check-balance',
        })

        const balanceCheck = await processBalanceOperation({
          telegram_id,
          paymentAmount,
          is_ru,
          bot_name,
        })

        if (!balanceCheck.success) {
          logger.error('⚠️ Balance check failed or insufficient funds', {
            telegramId: telegram_id,
            requiredAmount: paymentAmount,
            currentBalance: balanceCheck.currentBalance,
            error: balanceCheck.error,
            step: 'check-balance',
          })

          if (balanceCheck.error) {
            try {
              await bot.telegram.sendMessage(
                telegram_id.toString(),
                balanceCheck.error
              )
            } catch (notifyError) {
              logger.error(
                'Failed to send balance error notification to user',
                { telegramId: telegram_id, error: notifyError }
              )
            }
          }

          // Insufficient funds will not fix itself on retry — terminal.
          throw new NonRetriableError(
            balanceCheck.error || 'Balance check failed'
          )
        }

        logger.info('✅ Balance check successful', {
          telegramId: telegram_id,
          currentBalance: balanceCheck.currentBalance,
          requiredAmount: paymentAmount,
          step: 'check-balance',
        })

        return { currentBalance: balanceCheck.currentBalance, paymentAmount }
      }
    )

    try {
      // Кодируем ZIP файл в base64
      const encodedZip = await step.run('encode-zip', async () => {
        logger.info('📦 Encoding ZIP file to base64', {
          zipUrl: zipUrl,
          step: 'encode-zip',
        })

        const result = await encodeFileToBase64(zipUrl)

        logger.info('✅ ZIP file encoded successfully', {
          zipUrl: zipUrl,
          step: 'encode-zip',
        })

        return result
      })

      // Отправляем запрос на API для создания модели
      const training = await step.run('create-training', async () => {
        logger.info('🔍 Checking environment variables', {
          step: 'create-training',
        })

        if (!process.env.BFL_API_KEY) {
          logger.error('🚫 Missing required environment variable', {
            variable: 'BFL_API_KEY',
            step: 'create-training',
          })

          throw new Error('BFL_API_KEY is not set')
        }
        if (!process.env.BFL_WEBHOOK_URL) {
          logger.error('🚫 Missing required environment variable', {
            variable: 'BFL_WEBHOOK_URL',
            step: 'create-training',
          })

          throw new Error('BFL_WEBHOOK_URL is not set')
        }
        if (!process.env.REPLICATE_USERNAME) {
          logger.error('🚫 Missing required environment variable', {
            variable: 'REPLICATE_USERNAME',
            step: 'create-training',
          })

          throw new Error('REPLICATE_USERNAME is not set')
        }

        logger.info('🌐 Sending request to BFL API for model creation', {
          telegramId: telegram_id,
          triggerWord: triggerWord,
          modelName: modelName,
          steps: steps,
          step: 'create-training',
        })

        const response = await fetch('https://api.us1.bfl.ai/v1/finetune', {
          method: 'POST',
          // Bound the request: like the ZIP download above, this runs after the
          // balance charge and its only refund is the outer catch (throw-only).
          // A hung BFL socket must fail-fast so the refund-balance step runs
          // instead of leaving the user charged indefinitely.
          signal: AbortSignal.timeout(180000),
          headers: {
            'Content-Type': 'application/json',
            'X-Key': process.env.BFL_API_KEY,
          },
          body: JSON.stringify({
            file_data: encodedZip,
            finetune_comment: telegram_id,
            trigger_word: triggerWord,
            mode: 'character',
            iterations: steps,
            learning_rate: 0.00001,
            captioning: true,
            priority: 'high_res_only',
            finetune_type: 'full',
            lora_rank: 32,
            webhook_url: process.env.BFL_WEBHOOK_URL,
            webhook_secret: process.env.BFL_WEBHOOK_SECRET,
          }),
        })

        logger.info('📡 Received response from BFL API', {
          statusCode: response.status,
          step: 'create-training',
        })

        if (!response.ok) {
          logger.error('❌ Failed to create model training', {
            statusCode: response.status,
            step: 'create-training',
          })

          throw new Error(
            `Failed to initiate training with new API. Status: ${response.status}`
          )
        }

        const jsonResponse = (await response.json()) as TrainingResponse

        logger.info('🎉 Model training initiated successfully', {
          finetune_id: jsonResponse.finetune_id,
          telegramId: telegram_id,
          modelName: modelName,
          step: 'create-training',
        })

        return jsonResponse
      })

      // Сохраняем информацию о тренировке в базу данных
      await step.run('save-training-to-db', async () => {
        logger.info('💾 Saving training information to database', {
          finetune_id: training.finetune_id,
          telegramId: telegram_id,
          modelName: modelName,
          step: 'save-training-to-db',
        })

        await createModelTrainingV2({
          finetune_id: training.finetune_id,
          telegram_id: telegram_id,
          model_name: modelName,
          trigger_word: triggerWord,
          zip_url: zipUrl,
          steps,
          api: 'bfl',
          gender,
          bot_name,
        })

        logger.info('✅ Training information saved successfully', {
          finetune_id: training.finetune_id,
          telegramId: telegram_id,
          modelName: modelName,
          step: 'save-training-to-db',
        })
      })

      // Отправляем уведомление пользователю
      await step.run('notify-user', async () => {
        logger.info('📩 Sending notification to user', {
          telegramId: telegram_id,
          modelName: modelName,
          step: 'notify-user',
        })

        await bot.telegram.sendMessage(
          telegram_id,
          is_ru
            ? `✅ Обучение вашей модели "${modelName}" началось! Мы уведомим вас, когда модель будет готова.`
            : `✅ Your model "${modelName}" training has started! We'll notify you when it's ready.`
        )

        logger.info('📨 Notification sent successfully', {
          telegramId: telegram_id,
          step: 'notify-user',
        })
      })

      // Отправляем уведомление пользователю об успехе и списании
      await step.run('deduct-balance', async () => {
        logger.info('💸 Deducting balance after successful training start', {
          telegramId: telegram_id,
          paymentAmount: paymentAmount,
          currentBalance: currentBalance,
          step: 'deduct-balance',
        })

        const newBalance = currentBalance - paymentAmount

        // ЗДЕСЬ НЕ СПИСЫВАЕТСЯ. Деньги уже списаны шагом 'check-balance':
        // processBalanceOperation не проверяет баланс, а вставляет строку
        // MONEY_OUTCOME (src/price/helpers/processBalanceOperation.ts:120).
        // Раньше здесь стояло второе updateUserBalance на ту же сумму — то
        // есть одна тренировка списывалась дважды, а сообщение ниже сообщало
        // об одном списании и показывало баланс, завышенный ровно на одну
        // цену. Остальные девять вызывающих processBalanceOperation второй раз
        // не списывают; лишним был этот шаг, а не общий помощник.

        logger.info('✅ Balance updated successfully', {
          telegramId: telegram_id,
          newBalance: newBalance,
          step: 'deduct-balance',
        })

        const successMessage = is_ru
          ? `✅ Тренировка модели ${modelName} успешно запущена! С вашего баланса списано ${paymentAmount} ⭐. Ваш новый баланс: ${newBalance.toFixed(
              2
            )} ⭐.`
          : `✅ Model training ${modelName} started successfully! ${paymentAmount} ⭐ deducted from your balance. Your new balance: ${newBalance.toFixed(
              2
            )} ⭐.`

        await bot.telegram.sendMessage(telegram_id.toString(), successMessage)
      })

      logger.info('🏁 Model training process completed successfully', {
        telegramId: telegram_id,
        modelName: modelName,
        finetune_id: training.finetune_id,
      })

      return {
        success: true,
        message: `Training initiated successfully: ${JSON.stringify(training)}`,
      }
    } catch (error) {
      // В случае ошибки возвращаем списанные средства. Списание здесь всегда
      // состоялось: его делает processBalanceOperation в шаге check-balance,
      // который стоит ДО try — в catch попадают только ошибки после него.
      const refunded = await step.run('refund-balance', async () => {
        logger.info('♻️ Refunding payment due to error', {
          telegramId: telegram_id,
          amount: paymentAmount,
          currentBalance: currentBalance,
          newBalance: currentBalance + paymentAmount,
          refundedAmount: paymentAmount,
          step: 'refund-balance',
        })

        const ok = await updateUserBalance(
          // Сумма ОПЕРАЦИИ, а не новый баланс. Стояло
          // `currentBalance + paymentAmount` — весь прежний баланс человека
          // начислялся ему заново поверх возврата. Тот же комментарий про
          // «сумму операции, а не новый баланс» уже стоял в этом файле на
          // списании; до возврата он не дошёл.
          telegram_id,
          paymentAmount,
          PaymentType.MONEY_INCOME,
          `Refund for model training ${modelName} (steps: ${steps})`,
          {
            payment_method: 'System',
            bot_name,
            language: is_ru ? 'ru' : 'en',
          }
        )

        if (ok) {
          logger.info('✅ Payment refunded successfully', {
            telegramId: telegram_id,
            newBalance: currentBalance + paymentAmount,
            step: 'refund-balance',
          })
        } else {
          // Раньше результат выбрасывался и строка выше писалась безусловно.
          // updateUserBalance не бросает — возвращает false (нет строки в
          // users, отклонённая вставка); формулировка совпадает с
          // refundAndTell, чтобы поиск по журналу находил все невозвраты.
          logger.error('💸❌ REFUND FAILED — деньги НЕ возвращены', {
            alert: 'ЧЕЛОВЕКУ НЕ ВЕРНУЛИ ЗВЁЗДЫ ПОСЛЕ НЕУДАЧНОЙ ТРЕНИРОВКИ',
            telegram_id,
            amount: paymentAmount,
            step: 'refund-balance',
          })
        }
        return ok
      })

      // Логируем ошибку и отправляем уведомления
      await step.run('handle-error', async () => {
        logger.error('🚨 Error during model training', {
          error: error.message,
          stack: error.stack,
          telegramId: telegram_id,
          modelName: modelName,
          triggerWord: triggerWord,
          step: 'handle-error',
        })

        // Отправляем уведомление пользователю
        logger.info('📱 Sending error notification to user', {
          telegramId: telegram_id,
          step: 'handle-error',
        })

        // О возврате говорим только то, что знаем: refunded — настоящий
        // результат начисления, а не предположение.
        const refundLine = refunded
          ? is_ru
            ? 'Средства возвращены.'
            : 'Funds have been refunded.'
          : is_ru
            ? 'Вернуть средства автоматически не удалось — напишите в поддержку, приложив это сообщение.'
            : 'Automatic refund failed — please contact support and quote this message.'

        await bot.telegram.sendMessage(
          telegram_id,
          is_ru
            ? `❌ Произошла ошибка при генерации модели. Попробуйте еще раз.\n\n${refundLine}`
            : `❌ An error occurred during model generation. Please try again.\n\n${refundLine}`
        )

        // Отправляем уведомление администратору
        logger.info('👨‍💼 Sending error notification to admin', {
          telegramId: telegram_id,
          error: error.message,
          step: 'handle-error',
        })

        errorMessageAdmin(null, error as Error)
      })

      logger.error('🛑 Model training process failed', {
        telegramId: telegram_id,
        modelName: modelName,
        error: error.message,
      })

      throw error
    }
  }
)
