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
import { safeRecipient } from '@/inngest_app/safeMode'
import { supabase } from '@/core/supabase'
import { getBotByNameAdapter } from '@/inngest_app/services/bot-adapter'
import { getUserLanguageFromDB } from '@/core/supabase/getUserLanguage'
import { buildModelUrl } from '@/core/replicate/buildModelUrl'

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
      // Canonical id (spec-first manifest). Legacy id was
      // 'handle-model-training-completed'.
      id: 'training-model-complete',
      name: '🤖 Training Complete',
      retries: 2, // Retry on transient errors
      // 🔥 CRITICAL: Log errors to application logs (not just Inngest dashboard)
      onFailure: createInngestFailureHandler('training-model-complete'),
    },
    // Canonical event first, legacy event kept for the Replicate webhook path.
    [
      { event: 'training/model.complete' },
      { event: 'model/training.completed' },
    ],
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

        // Replay dedup. Replicate webhooks are at-least-once: a re-POST creates a
        // NEW Inngest event = a NEW run of this function, which would re-send the
        // completion Telegram message. If the record is ALREADY terminal when
        // this run reads it, a prior run finalized + notified it -> skip. The
        // find-training-record step is memoized within a run, so a run that read
        // a non-terminal status keeps attempting the notify across Inngest retries
        // (no first notification is ever dropped); only a separate replay run sees
        // the terminal status and skips.
        const TERMINAL_STATUSES = ['SUCCESS', 'FAILED', 'CANCELED']
        if (
          TERMINAL_STATUSES.includes(
            String(trainingRecord.status || '').toUpperCase()
          )
        ) {
          logger.info(
            '[TRAINING COMPLETED] Record already terminal at read time — replay, skipping re-notify',
            {
              training_id: eventData.training_id,
              telegram_id: trainingRecord.telegram_id,
              currentStatus: trainingRecord.status,
            }
          )
          return {
            success: true,
            skipped: true,
            reason: 'already terminal (replay dedup)',
            training_id: eventData.training_id,
            status: eventData.status,
          }
        }

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
              // ССЫЛКА НА МОДЕЛЬ СОБИРАЛАСЬ НЕВЕРНО — ДВЕ ОШИБКИ СРАЗУ.
              //
              // Было:
              //   modelUrl = `${replicateUsername}/${modelName}:${versionHash}`
              //
              // 1. `modelName` — это `trainingRecord.model_name`, то есть имя,
              //    которое ввёл ЧЕЛОВЕК: «Anneya», «My_lenA», «Мой аватар».
              //    Настоящее имя модели у Replicate другое — приведённый к
              //    нижнему регистру слаг с меткой времени.
              // 2. `eventData.output.version` — это уже ПОЛНАЯ ссылка вида
              //    `owner/slug:hash`, а не голый хеш.
              //
              // В итоге в базу писалось
              //   jalisawallet-coder/Anneya:jalisawallet-coder/anneya-1773937126432:d365…
              // — путь, которого не существует.
              //
              // Проверено на живых данных: у трёх человек (2025-12-20,
              // 2026-02-06, 2026-03-19) в базе такой мусор, при этом настоящие
              // модели ЖИВЫ и отвечают 200:
              //   ghashtag/moy-avatar-1766257198919
              //   jalisawallet-coder/my-lena-1770401829279
              //   jalisawallet-coder/anneya-1773937126432
              // То есть модели не потеряны — потеряна ссылка на них.
              //
              // Правильное значение уже пришло от Replicate: если в `version`
              // есть и `/`, и `:`, это готовая ссылка, её и берём. Составлять
              // самим нужно только когда пришёл голый хеш — так было раньше, и
              // те старые записи (`ghashtag/tatizaharova:78bd…`) исправны.
              const rawVersion = String(eventData.output.version || '')
              const replicateUsername =
                process.env.REPLICATE_USERNAME || 'ghashtag'

              modelUrl = buildModelUrl(
                rawVersion,
                replicateUsername,
                String(trainingRecord.model_name || '')
              )
              versionHash = modelUrl.split(':').pop() || null

              if (versionHash) {
                updateData.model_url = modelUrl
                updateData.weights = eventData.output.weights
                updateData.result = 'SUCCESS'
                updateData.api = 'replicate'

                logger.info('[TRAINING COMPLETED] Formatted model URL', {
                  training_id: eventData.training_id,
                  version_hash: versionHash.substring(0, 20) + '...',
                  model_url: modelUrl,
                })
              } else {
                // Replicate reported success but the output carried no usable
                // version (legacy / odd output shape — exactly the old rows the
                // stuck-training watchdog sweeps). Building the URL yields
                // owner/slug: with an empty hash, and versionHash.substring on
                // null used to THROW here, inside step.run, BEFORE the row was
                // flipped out of PENDING/starting/processing — so the cron
                // re-selected it every 30 minutes forever. Still flip the status
                // to terminal (updateData.status is already SUCCESS above) so the
                // watchdog stops, but skip the broken model_url rather than write
                // it. result stays unset so the record is visibly incomplete.
                //
                // That last sentence used to be false: the line below set
                // result = 'SUCCESS', which is exactly what the comment says not
                // to do. A row with no model_url then read as a finished
                // training to anyone looking at `result` -- the one field whose
                // whole job here is to say the record is NOT complete. Nothing
                // in src reads it today, so this changes no behaviour; it makes
                // the record say what it was meant to say.
                logger.warn(
                  '[TRAINING COMPLETED] Succeeded with no usable model version — status flipped, model_url skipped',
                  {
                    training_id: eventData.training_id,
                    raw_version: rawVersion,
                  }
                )
              }
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
              // whether a USABLE model_url was actually persisted (false on the
              // version-less success path, where the local modelUrl is a broken
              // owner/slug: but updateData.model_url was intentionally skipped). #1349
              modelUrlWritten: !!updateData.model_url,
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
            // Safe mode: user-facing sends are redirected to ADMIN_CHAT_ID.
            const telegramId = safeRecipient(
              event,
              eventData.telegram_id || trainingRecord.telegram_id
            )
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
              logger.error(
                '[TRAINING COMPLETED] Bot instance not found - NOTIFICATION NOT SENT!',
                {
                  bot_name: botName,
                  error: botData.error,
                  training_id: eventData.training_id,
                  telegram_id: telegramId,
                  availableBots: 'check getBotByNameAdapter logs',
                }
              )
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

            if (
              eventData.status === 'succeeded' &&
              dbUpdateResult?.modelUrlWritten
            ) {
              if (isRu) {
                message = `✅ Тренировка модели завершена!\n\n📦 Модель: ${modelName}\n🎯 Trigger word: <b>${triggerWord}</b>\n🆔 Training ID: ${eventData.training_id}\n\n🎨 Теперь вы можете использовать эту модель в разделе "Модели" в Нейрофото.\n\n💡 <b>Как использовать:</b>\nЧтобы активировать модель, укажите trigger word <b>${triggerWord}</b> в промпте при генерации изображений.\n\nПример промпта: "<b>${triggerWord}</b> person, cinematic lighting, high quality"`
              } else {
                message = `✅ Model training completed!\n\n📦 Model: ${modelName}\n🎯 Trigger word: <b>${triggerWord}</b>\n🆔 Training ID: ${eventData.training_id}\n\n🎨 You can now use this model in the "Models" section of Neurophoto.\n\n💡 <b>How to use:</b>\nTo activate the model, include the trigger word <b>${triggerWord}</b> in your prompt when generating images.\n\nExample prompt: "<b>${triggerWord}</b> person, cinematic lighting, high quality"`
              }
            } else if (eventData.status === 'succeeded') {
              // Succeeded but model_url was NOT written (version-less output: the
              // legacy/odd shape the watchdog sweeps). The row is flipped terminal
              // but the model cannot be selected/used, so do NOT claim it is ready.
              // Mirror the failed-branch tone. #1349
              if (isRu) {
                message = `⏳ Тренировка модели почти завершена\n\n📦 Модель: ${modelName}\n🆔 Training ID: ${eventData.training_id}\n\nМы финализируем вашу модель. Если она не появится в разделе "Модели" в течение часа — обратитесь в поддержку.`
              } else {
                message = `⏳ Model training is almost done\n\n📦 Model: ${modelName}\n🆔 Training ID: ${eventData.training_id}\n\nWe are finalizing your model. If it does not appear in the "Models" section within an hour, please contact support.`
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
