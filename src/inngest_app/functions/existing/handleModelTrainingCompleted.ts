/**
 * Inngest Function: Handle Model Training Completed
 *
 * Обрабатывает завершение тренировки модели от Replicate webhook
 *
 * Flow:
 * 1. Receive event 'model/training.completed' from webhook
 * 2. Find training record in database
 * 3. Update training status and model_url
 * 4. Send Telegram notification to user
 */

import { logger } from '@/utils/logger'
import { createInngestFailureHandler } from '@/inngest_app/client'
import { supabase } from '@/core/supabase'
import { getBotByNameAdapter } from '@/inngest_app/services/bot-adapter'
import { getUserLanguageFromDB } from '@/core/supabase/getUserLanguage'

interface TrainingCompletedEvent {
  name: 'model/training.completed'
  data: {
    training_id: string // Replicate training ID
    status: 'succeeded' | 'failed' | 'canceled'
    model?: string
    version?: string
    output?: {
      version: string
      weights: string
    }
    error?: string
    telegram_id?: string // Optional, will be fetched from DB if not provided
    bot_name?: string // Optional, will be fetched from DB if not provided
  }
}

export function createHandleModelTrainingCompletedFunction(inngest: any) {
  return inngest.createFunction(
    {
      id: 'handle-model-training-completed',
      name: '🤖 Training Complete',
      retries: 2, // Retry on transient errors
      // 🔥 CRITICAL: Log errors to application logs (not just Inngest dashboard)
      onFailure: createInngestFailureHandler('Training Complete'),
    },
    { event: 'model/training.completed' },
    async ({ event, step }) => {
      try {
        const eventData = event.data as TrainingCompletedEvent['data']
        const startTime = Date.now()

        logger.info('[TRAINING COMPLETED] 🎉 Processing training completion', {
          training_id: eventData.training_id,
          status: eventData.status,
        })

        // ✅ STEP 1: Find training record in database
        const trainingRecordResult = await step.run(
          'find-training-record',
          async () => {
            const { data, error } = await supabase
              .from('model_trainings')
              .select('*')
              .eq('replicate_training_id', eventData.training_id)
              .single()

            if (error || !data) {
              logger.warn(
                '[TRAINING COMPLETED] Training record not found (may be test webhook)',
                {
                  training_id: eventData.training_id,
                  error: error?.message,
                  note: 'This may be a test webhook or training was not saved to DB',
                }
              )

              // ✅ Возвращаем результат вместо throw - это может быть тестовый webhook
              return {
                found: false,
                training_id: eventData.training_id,
                error: error?.message || 'Record not found',
                isTest: true, // Помечаем как тестовый
              }
            }

            logger.info('[TRAINING COMPLETED] Training record found', {
              training_id: eventData.training_id,
              telegram_id: data.telegram_id,
              model_name: data.model_name,
              trigger_word: data.trigger_word,
            })

            // ✅ Возвращаем детальный результат для прозрачности
            return {
              ...data,
              found: true,
              recordId: data.id,
              isTest: false,
            }
          }
        )

        // ✅ Проверяем, найдена ли запись
        if (!trainingRecordResult.found) {
          logger.info(
            '[TRAINING COMPLETED] ⚠️ Training record not found - skipping processing',
            {
              training_id: eventData.training_id,
              note: 'This is likely a test webhook or the training was not saved to DB',
            }
          )

          // ✅ Возвращаем успешный результат, но с пометкой что запись не найдена
          return {
            success: true,
            skipped: true,
            reason: 'Training record not found (may be test webhook)',
            training_id: eventData.training_id,
            status: eventData.status,
          }
        }

        const trainingRecord = trainingRecordResult
        logger.info('[TRAINING COMPLETED] ✅ Step 1 completed: Record found', {
          training_id: eventData.training_id,
          telegram_id: trainingRecord.telegram_id,
          model_name: trainingRecord.model_name,
          trigger_word: trainingRecord.trigger_word,
        })

        // ✅ STEP 2: Update training status in database
        const dbUpdateResult = await step.run(
          'update-training-status',
          async () => {
            // Map Replicate statuses to our database format
            const statusMap: Record<string, string> = {
              succeeded: 'SUCCESS',
              failed: 'FAILED',
              canceled: 'CANCELED',
            }

            const updateData: any = {
              status:
                statusMap[eventData.status] || eventData.status.toUpperCase(),
              updated_at: new Date().toISOString(),
            }

            let modelUrl = null
            let versionHash = null

            if (eventData.status === 'succeeded' && eventData.output) {
              // Format model_url as owner/name:version for Replicate API compatibility
              versionHash = eventData.output.version
              const replicateUsername =
                process.env.REPLICATE_USERNAME || 'ghashtag'
              const modelName = trainingRecord.model_name || 'model'

              // Create full model reference: owner/name:version
              modelUrl = `${replicateUsername}/${modelName}:${versionHash}`
              updateData.model_url = modelUrl
              updateData.weights = eventData.output.weights
              updateData.result = 'SUCCESS'
              updateData.api = 'replicate'

              logger.info('[TRAINING COMPLETED] Formatted model URL', {
                training_id: eventData.training_id,
                version_hash: versionHash.substring(0, 20) + '...',
                model_url: modelUrl,
              })
            }

            if (eventData.status === 'failed' && eventData.error) {
              updateData.error = eventData.error
              updateData.result = 'FAILED'
            }

            const { error: updateError, data: updatedData } = await supabase
              .from('model_trainings')
              .update(updateData)
              .eq('replicate_training_id', eventData.training_id)
              .select()

            if (updateError) {
              logger.error(
                '[TRAINING COMPLETED] Failed to update training status',
                {
                  training_id: eventData.training_id,
                  error: updateError.message,
                }
              )
              throw new Error(
                `Failed to update training status: ${updateError.message}`
              )
            }

            logger.info('[TRAINING COMPLETED] Training status updated', {
              training_id: eventData.training_id,
              status: eventData.status,
            })

            // ✅ Возвращаем детальный результат для прозрачности
            return {
              updated: true,
              status: updateData.status,
              modelUrl,
              versionHash: versionHash
                ? versionHash.substring(0, 20) + '...'
                : null,
              recordId: updatedData?.[0]?.id || null,
            }
          }
        )
        logger.info(
          '[TRAINING COMPLETED] ✅ Step 2 completed: DB updated',
          dbUpdateResult
        )

        // ✅ STEP 3: Send Telegram notification to user
        const notificationResult = await step.run(
          'send-telegram-notification',
          async () => {
            // Only send notification for terminal statuses
            if (
              eventData.status !== 'succeeded' &&
              eventData.status !== 'failed'
            ) {
              logger.info(
                '[TRAINING COMPLETED] Skipping notification for non-terminal status',
                {
                  training_id: eventData.training_id,
                  status: eventData.status,
                }
              )
              return {
                sent: false,
                reason: 'Non-terminal status',
                status: eventData.status,
              }
            }

            // ✅ Проверяем наличие необходимых данных для уведомления
            const botName =
              eventData.bot_name || trainingRecord.bot_name || 'AI_STARS_bot'
            const telegramId =
              eventData.telegram_id || trainingRecord.telegram_id
            const modelName = trainingRecord.model_name

            if (!telegramId) {
              logger.warn(
                '[TRAINING COMPLETED] Cannot send notification - no telegram_id',
                {
                  training_id: eventData.training_id,
                  bot_name: botName,
                }
              )
              return {
                sent: false,
                reason: 'No telegram_id',
                training_id: eventData.training_id,
              }
            }

            logger.info('[TRAINING COMPLETED] Looking up bot instance', {
              bot_name: botName,
              telegram_id: telegramId,
              training_id: eventData.training_id,
            })

            const botData = getBotByNameAdapter(botName)

            if (!botData.bot || botData.error) {
              logger.error('[TRAINING COMPLETED] Bot instance not found - NOTIFICATION NOT SENT!', {
                bot_name: botName,
                error: botData.error,
                training_id: eventData.training_id,
                telegram_id: telegramId,
                availableBots: 'check getBotByNameAdapter logs',
              })
              return {
                sent: false,
                reason: `Bot instance not found: ${botName}`,
                error: botData.error,
                telegram_id: telegramId,
                training_id: eventData.training_id,
              }
            }

            // Determine language: DB record → user profile → default ru
            let isRu = trainingRecord.is_ru
            if (isRu === undefined || isRu === null) {
              const userLang = await getUserLanguageFromDB(telegramId)
              isRu = userLang !== 'en' // Default to Russian if unknown
              logger.info('[TRAINING COMPLETED] Language fallback used', {
                telegram_id: telegramId,
                userLang,
                isRu,
              })
            }

            let message: string
            const triggerWord = trainingRecord.trigger_word || 'TRIGGER_WORD'

            if (eventData.status === 'succeeded') {
              if (isRu) {
                message = `✅ Тренировка модели завершена!\n\n📦 Модель: ${modelName}\n🎯 Trigger word: <b>${triggerWord}</b>\n🆔 Training ID: ${eventData.training_id}\n\n🎨 Теперь вы можете использовать эту модель в разделе "Модели" в Нейрофото.\n\n💡 <b>Как использовать:</b>\nЧтобы активировать модель, укажите trigger word <b>${triggerWord}</b> в промпте при генерации изображений.\n\nПример промпта: "<b>${triggerWord}</b> person, cinematic lighting, high quality"`
              } else {
                message = `✅ Model training completed!\n\n📦 Model: ${modelName}\n🎯 Trigger word: <b>${triggerWord}</b>\n🆔 Training ID: ${eventData.training_id}\n\n🎨 You can now use this model in the "Models" section of Neurophoto.\n\n💡 <b>How to use:</b>\nTo activate the model, include the trigger word <b>${triggerWord}</b> in your prompt when generating images.\n\nExample prompt: "<b>${triggerWord}</b> person, cinematic lighting, high quality"`
              }
            } else {
              if (isRu) {
                message = `❌ Ошибка тренировки модели\n\n📦 Модель: ${modelName}\n🆔 Training ID: ${eventData.training_id}\n\n⚠️ Причина: ${eventData.error || 'Неизвестная ошибка'}\n\nПопробуйте запустить тренировку заново или обратитесь в поддержку.`
              } else {
                message = `❌ Model training failed\n\n📦 Model: ${modelName}\n🆔 Training ID: ${eventData.training_id}\n\n⚠️ Reason: ${eventData.error || 'Unknown error'}\n\nPlease try restarting the training or contact support.`
              }
            }

            // Main menu button
            const menuButtonText = isRu ? '🏠 Главное меню' : '🏠 Main Menu'

            try {
              await botData.bot.telegram.sendMessage(telegramId, message, {
                disable_notification: false,
                parse_mode: 'HTML',
                reply_markup: {
                  inline_keyboard: [
                    [{ text: menuButtonText, callback_data: 'go_main_menu' }],
                  ],
                },
              })

              logger.info('[TRAINING COMPLETED] ✅ User notified', {
                training_id: eventData.training_id,
                telegram_id: telegramId,
                status: eventData.status,
              })

              return {
                sent: true,
                telegram_id: telegramId,
                bot_name: botName,
                status: eventData.status,
                messageLength: message.length,
              }
            } catch (sendError) {
              logger.error('[TRAINING COMPLETED] Failed to send notification', {
                training_id: eventData.training_id,
                error:
                  sendError instanceof Error
                    ? sendError.message
                    : String(sendError),
                telegram_id: telegramId,
              })

              return {
                sent: false,
                error:
                  sendError instanceof Error
                    ? sendError.message
                    : String(sendError),
                telegram_id: telegramId,
                bot_name: botName,
              }
            }
          }
        )
        logger.info(
          '[TRAINING COMPLETED] ✅ Step 3 completed: User notified',
          notificationResult
        )

        const result = {
          success: true,
          training_id: eventData.training_id,
          status: eventData.status,
          elapsed_ms: Date.now() - startTime,
        }

        logger.info('[TRAINING COMPLETED] ✅ Processing completed', result)
        return result
      } catch (error) {
        logger.error('[TRAINING COMPLETED] ❌ Processing failed', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          training_id: (event.data as any)?.training_id || 'unknown',
        })

        throw error
      }
    }
  )
}
