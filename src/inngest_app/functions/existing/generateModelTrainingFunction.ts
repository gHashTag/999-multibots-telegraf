/**
 * Inngest Function: Model Training (Flux LoRA)
 *
 * Async model training with Replicate webhook callback
 *
 * Flow:
 * 1. Receive event 'model/training.start'
 * 2. Download ZIP file from zipUrl
 * 3. Convert to base64
 * 4. Create/validate Replicate model
 * 5. Create Replicate training
 * 6. Save training record to database
 * 7. Send Telegram notification to user
 */

import { logger } from '@/utils/logger'
import { supabase } from '@/core/supabase'
import {
  sanitizeModelName,
  isValidReplicateModelName,
} from '@/helpers/sanitizeModelName'
import { getBotByNameAdapter } from '@/inngest_app/services/bot-adapter'
import { PUBLIC_URL } from '@/config'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
const Replicate = require('replicate')

interface ModelTrainingEvent {
  name: 'model/training.start'
  data: {
    telegram_id: string
    bot_name: string
    modelName: string
    triggerWord: string
    zipUrl: string // HTTP URL to ZIP file in Supabase Storage
    steps: number | string // Can be string from scene
    is_ru: boolean
    gender: string
  }
}

export function createGenerateModelTrainingFunction(inngest: any) {
  return inngest.createFunction(
    {
      id: 'generate-model-training',
      name: 'Model Training - Flux LoRA',
      concurrency: [
        {
          limit: 2, // Max 2 concurrent trainings
        },
      ],
      retries: 0, // No retries for training - user can restart manually
    },
    { event: 'model/training.start' },
    async ({ event, step }) => {
      try {
        const eventData = event.data as ModelTrainingEvent['data']
        const startTime = Date.now()

        logger.info('[INNGEST TRAINING] 🚀 Starting model training', {
          telegram_id: eventData.telegram_id,
          modelName: eventData.modelName,
          zipUrl: eventData.zipUrl,
          steps: eventData.steps,
          bot_name: eventData.bot_name,
        })

        // ✅ STEP 1: Validate Replicate credentials и создаем клиент с явной передачей токена
        const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN
        const REPLICATE_USERNAME = process.env.REPLICATE_USERNAME || 'ghashtag'

        if (!REPLICATE_API_TOKEN) {
          throw new Error('❌ Missing REPLICATE_API_TOKEN in environment')
        }

        // ✅ КРИТИЧНО: Создаем новый Replicate клиент с явной передачей токена
        // Проблема: глобальный клиент из @/core/replicate может быть инициализирован без токена
        // Решение: создаем клиент внутри функции с явной передачей токена из process.env
        const replicate = new Replicate({
          auth: REPLICATE_API_TOKEN,
        })

        logger.info('[INNGEST TRAINING] Using Replicate credentials', {
          username: REPLICATE_USERNAME,
          hasToken: !!REPLICATE_API_TOKEN,
          tokenLength: REPLICATE_API_TOKEN.length,
        })

        // ✅ STEP 2: Download ZIP file from URL (Inngest лимит 256KB на событие)
        const zipDownloadResult = await step.run('download-zip', async () => {
          logger.info('[INNGEST TRAINING] Downloading ZIP file', {
            zipUrl: eventData.zipUrl,
          })

          const tempDir = path.join(process.cwd(), 'tmp')
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true })
          }

          const fileName = `training-${eventData.telegram_id}-${Date.now()}.zip`
          const filePath = path.join(tempDir, fileName)

          const response = await axios({
            method: 'GET',
            url: eventData.zipUrl,
            responseType: 'stream',
            timeout: 60000, // 60 seconds timeout
          })

          const writer = fs.createWriteStream(filePath)
          response.data.pipe(writer)

          await new Promise<void>((resolve, reject) => {
            writer.on('finish', () => resolve())
            writer.on('error', reject)
          })

          const stats = fs.statSync(filePath)
          logger.info('[INNGEST TRAINING] ZIP file downloaded', {
            filePath,
            size: stats.size,
          })

          // ✅ Возвращаем детальный результат для прозрачности
          return {
            filePath,
            fileName,
            size: stats.size,
            sizeMB: (stats.size / 1024 / 1024).toFixed(2),
            downloaded: true,
            sourceUrl: eventData.zipUrl,
          }
        })
        const zipFilePath = zipDownloadResult.filePath
        logger.info(
          '[INNGEST TRAINING] ✅ Step 2 completed: ZIP downloaded',
          zipDownloadResult
        )

        // ✅ STEP 3: Convert ZIP to base64 (НЕ возвращаем через step - используем напрямую)
        // Проблема: base64 слишком большой для передачи через nginx (413 Request Entity Too Large)
        // Решение: конвертируем base64 внутри следующего step, чтобы не передавать через HTTP

        // ✅ STEP 4: Sanitize model name
        const modelNameSanitized = await step.run(
          'sanitize-model-name',
          async () => {
            const originalName = eventData.modelName
            let sanitized = originalName
            let wasSanitized = false

            if (!isValidReplicateModelName(originalName)) {
              logger.warn('[INNGEST TRAINING] Invalid model name, sanitizing', {
                original: originalName,
              })
              sanitized = sanitizeModelName(originalName)
              wasSanitized = true
            }

            const modelNameLower = sanitized.toLowerCase()
            const timestamp = Date.now()
            const uniqueModelName = `${modelNameLower}-${timestamp}`
            const destination = `${REPLICATE_USERNAME}/${uniqueModelName}`

            logger.info('[INNGEST TRAINING] Model name prepared', {
              original: originalName,
              sanitized,
              destination,
            })

            // ✅ Возвращаем детальный результат для прозрачности
            return {
              destination,
              uniqueModelName,
              originalName,
              sanitized,
              wasSanitized,
              timestamp,
              username: REPLICATE_USERNAME,
            }
          }
        )
        logger.info(
          '[INNGEST TRAINING] ✅ Step 4 completed: Model name sanitized',
          modelNameSanitized
        )

        // ✅ STEP 5: Create/validate Replicate model
        const modelCreationResult = await step.run(
          'create-replicate-model',
          async () => {
            logger.info(
              '[INNGEST TRAINING] Checking/creating Replicate model',
              {
                destination: modelNameSanitized.destination,
              }
            )

            let modelExists = false
            let modelCreated = false

            try {
              await replicate.models.get(
                REPLICATE_USERNAME,
                modelNameSanitized.uniqueModelName
              )
              modelExists = true
              logger.info('[INNGEST TRAINING] Model already exists')
            } catch (error: any) {
              if (error?.response?.status === 404) {
                logger.info('[INNGEST TRAINING] Creating new model')
                await replicate.models.create(
                  REPLICATE_USERNAME,
                  modelNameSanitized.uniqueModelName,
                  {
                    description: `LoRA: ${eventData.triggerWord}`,
                    visibility: 'public',
                    hardware: 'gpu-l40s',
                  }
                )
                modelCreated = true
                logger.info('[INNGEST TRAINING] ✅ Model created successfully')
                // Wait for model to be fully initialized
                await new Promise(resolve => setTimeout(resolve, 5000))
              } else {
                throw error
              }
            }

            // ✅ Возвращаем детальный результат для прозрачности
            return {
              destination: modelNameSanitized.destination,
              uniqueModelName: modelNameSanitized.uniqueModelName,
              modelExists,
              modelCreated,
              triggerWord: eventData.triggerWord,
            }
          }
        )
        logger.info(
          '[INNGEST TRAINING] ✅ Step 5 completed: Model created/validated',
          modelCreationResult
        )

        // ✅ STEP 6: Convert ZIP to base64 И Create Replicate training (в одном step)
        // Объединяем конвертацию и создание training, чтобы base64 не передавался через HTTP
        // Это решает проблему "413 Request Entity Too Large" от nginx
        const training = await step.run(
          'create-replicate-training',
          async () => {
            const model = 'ostris/flux-dev-lora-trainer'
            const version =
              'e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497'

            const stepsNumber =
              typeof eventData.steps === 'string'
                ? parseInt(eventData.steps, 10)
                : eventData.steps

            // ✅ КРИТИЧНО: Конвертируем base64 ВНУТРИ этого step, чтобы не передавать через HTTP
            // Проблема: base64 слишком большой (~1.4MB) для передачи через nginx (413 Request Entity Too Large)
            // Решение: конвертируем base64 внутри step и сразу используем для Replicate API
            logger.info(
              '[INNGEST TRAINING] Converting ZIP to base64 (inside step)'
            )
            const fileBuffer = fs.readFileSync(zipFilePath)
            const base64Data = fileBuffer.toString('base64')
            const dataUri = `data:application/zip;base64,${base64Data}`

            logger.info('[INNGEST TRAINING] Base64 conversion complete', {
              originalSize: fileBuffer.length,
              base64Length: base64Data.length,
            })

            // ✅ КРИТИЧНО: Получаем webhook URL для уведомлений о завершении тренировки
            // В ai-server используется `${API_URL}/webhooks/replicate`
            // ✅ FALLBACK: Если PUBLIC_URL не установлен, используем хардкод для production
            const publicUrl =
              PUBLIC_URL ||
              process.env.BASE_WEBHOOK_URL ||
              (process.env.NODE_ENV === 'production'
                ? 'https://three-head-dragon.shop'
                : 'http://localhost:3000')
            const webhookUrl = `${publicUrl}/api/webhooks/replicate`

            logger.info('[INNGEST TRAINING] 🔗 WEBHOOK CONFIGURATION', {
              webhookUrl,
              PUBLIC_URL,
              BASE_WEBHOOK_URL: process.env.BASE_WEBHOOK_URL,
              NODE_ENV: process.env.NODE_ENV,
              publicUrl,
              triggerWord: eventData.triggerWord,
              model: modelNameSanitized.destination,
              steps: stepsNumber,
            })

            // ✅ КРИТИЧНО: Проверяем, что webhook URL валидный (должен быть HTTPS в production)
            if (
              !webhookUrl.startsWith('http://') &&
              !webhookUrl.startsWith('https://')
            ) {
              logger.error('[INNGEST TRAINING] ❌ Invalid webhook URL', {
                webhookUrl,
                PUBLIC_URL,
                BASE_WEBHOOK_URL: process.env.BASE_WEBHOOK_URL,
                publicUrl,
              })
              throw new Error(
                `Invalid webhook URL: ${webhookUrl}. PUBLIC_URL: ${PUBLIC_URL}, BASE_WEBHOOK_URL: ${process.env.BASE_WEBHOOK_URL}, publicUrl: ${publicUrl}`
              )
            }

            logger.info('[INNGEST TRAINING] Creating Replicate training', {
              model,
              version,
              destination: modelNameSanitized.destination,
              steps: stepsNumber,
              triggerWord: eventData.triggerWord,
              webhookUrl, // Логируем webhook URL для отладки
            })

            const training = await replicate.trainings.create(
              'ostris', // owner
              'flux-dev-lora-trainer', // model name
              version, // version ID
              {
                destination:
                  modelNameSanitized.destination as `${string}/${string}`,
                input: {
                  input_images: dataUri,
                  trigger_word: eventData.triggerWord,
                  steps: stepsNumber,
                  lora_rank: 128,
                  optimizer: 'adamw8bit',
                  batch_size: 1,
                  resolution: '512,768,1024',
                  autocaption: true,
                  learning_rate: 0.0001,
                  wandb_project: 'flux_train_replicate',
                },
                // ✅ КРИТИЧНО: Добавляем webhook для получения уведомлений о завершении (как в ai-server)
                webhook: webhookUrl,
                webhook_events_filter: ['completed'], // Только событие 'completed' (succeeded/failed/canceled)
              }
            )

            logger.info('[INNGEST TRAINING] ✅ Training created with webhook', {
              training_id: training.id,
              webhookUrl,
              triggerWord: eventData.triggerWord,
            })

            logger.info('[INNGEST TRAINING] ✅ Training created successfully', {
              training_id: training.id,
              status: training.status,
              destination: modelNameSanitized.destination,
            })

            // ✅ КРИТИЧНО: Возвращаем детальные сериализуемые данные для прозрачности
            // Проблема "Invalid JSON in response" возникает из-за несериализуемых полей в объекте training
            return {
              id: training.id,
              status: training.status,
              destination: modelNameSanitized.destination,
              webhookUrl,
              triggerWord: eventData.triggerWord,
              steps: stepsNumber,
              model: modelNameSanitized.uniqueModelName,
              zipSize: fileBuffer.length,
              zipSizeMB: (fileBuffer.length / 1024 / 1024).toFixed(2),
              base64Length: base64Data.length,
              createdAt: new Date().toISOString(),
            }
          }
        )
        logger.info(
          '[INNGEST TRAINING] ✅ Step 6 completed: Training created',
          {
            training_id: training.id,
            status: training.status,
            webhookUrl: training.webhookUrl,
            triggerWord: training.triggerWord,
          }
        )

        // ✅ STEP 7: Save training record to database
        const dbSaveResult = await step.run(
          'save-training-record',
          async () => {
            const stepsNumber =
              typeof eventData.steps === 'string'
                ? parseInt(eventData.steps, 10)
                : eventData.steps

            // ✅ КРИТИЧНО: Создаем trainingRecord БЕЗ is_ru, так как колонка отсутствует в схеме БД
            // Supabase выдает ошибку "Could not find the 'is_ru' column" если пытаемся вставить это поле
            const trainingRecord: any = {
              telegram_id: eventData.telegram_id,
              model_name: eventData.modelName,
              trigger_word: eventData.triggerWord,
              zip_url: eventData.zipUrl,
              replicate_training_id: training.id, // ✅ training теперь объект с {id, status, destination}
              status: 'processing',
              bot_name: eventData.bot_name,
              steps: stepsNumber,
              gender: eventData.gender,
              created_at: new Date().toISOString(),
            }

            // ✅ is_ru НЕ добавляем - колонка отсутствует в схеме model_trainings
            // Если нужно будет добавить в будущем, сначала нужно добавить колонку в Supabase

            const { data: insertedData, error: dbError } = await supabase
              .from('model_trainings')
              .insert(trainingRecord)
              .select()

            if (dbError) {
              logger.error('[INNGEST TRAINING] Database error (non-fatal)', {
                error: dbError.message,
                telegram_id: eventData.telegram_id,
              })
              return {
                saved: false,
                error: dbError.message,
                trainingRecord,
              }
            } else {
              logger.info(
                '[INNGEST TRAINING] Training record saved to database'
              )
              return {
                saved: true,
                recordId: insertedData?.[0]?.id || null,
                trainingRecord,
              }
            }
          }
        )
        logger.info(
          '[INNGEST TRAINING] ✅ Step 7 completed: DB record saved',
          dbSaveResult
        )

        // ✅ STEP 8: Clean up downloaded ZIP file
        const cleanupResult = await step.run('cleanup-zip-file', async () => {
          try {
            if (fs.existsSync(zipFilePath)) {
              await fs.promises.unlink(zipFilePath)
              logger.info('[INNGEST TRAINING] ZIP file cleaned up')
              return {
                cleaned: true,
                filePath: zipFilePath,
              }
            } else {
              return {
                cleaned: false,
                reason: 'File does not exist',
                filePath: zipFilePath,
              }
            }
          } catch (unlinkError) {
            logger.warn(
              '[INNGEST TRAINING] Failed to cleanup ZIP (non-fatal)',
              {
                error:
                  unlinkError instanceof Error
                    ? unlinkError.message
                    : String(unlinkError),
              }
            )
            return {
              cleaned: false,
              error:
                unlinkError instanceof Error
                  ? unlinkError.message
                  : String(unlinkError),
              filePath: zipFilePath,
            }
          }
        })
        logger.info(
          '[INNGEST TRAINING] ✅ Step 8 completed: ZIP cleanup',
          cleanupResult
        )

        // ✅ STEP 9: Send Telegram notification to user
        const notificationResult = await step.run(
          'send-telegram-notification',
          async () => {
            const botData = getBotByNameAdapter(eventData.bot_name)

            if (!botData.bot || botData.error) {
              logger.error('[INNGEST TRAINING] Bot instance not found', {
                bot_name: eventData.bot_name,
                error: botData.error,
              })
              return {
                sent: false,
                error: `Bot not found: ${botData.error}`,
                bot_name: eventData.bot_name,
                telegram_id: eventData.telegram_id,
              }
            }

            const successMessage = eventData.is_ru
              ? `✅ Тренировка модели запущена!\n\n📦 Модель: ${modelNameSanitized.destination}\n🆔 Training ID: ${training.id}\n⏱️ Время: ~1-2 часа`
              : `✅ Model training started!\n\n📦 Model: ${modelNameSanitized.destination}\n🆔 Training ID: ${training.id}\n⏱️ Time: ~1-2 hours`

            try {
              await botData.bot.telegram.sendMessage(
                parseInt(eventData.telegram_id),
                successMessage
              )
              logger.info('[INNGEST TRAINING] ✅ Telegram notification sent', {
                telegram_id: eventData.telegram_id,
              })
              return {
                sent: true,
                telegram_id: eventData.telegram_id,
                bot_name: eventData.bot_name,
                messageLength: successMessage.length,
              }
            } catch (sendError) {
              logger.error(
                '[INNGEST TRAINING] Failed to send Telegram notification',
                {
                  error:
                    sendError instanceof Error
                      ? sendError.message
                      : String(sendError),
                  telegram_id: eventData.telegram_id,
                }
              )
              return {
                sent: false,
                error:
                  sendError instanceof Error
                    ? sendError.message
                    : String(sendError),
                telegram_id: eventData.telegram_id,
                bot_name: eventData.bot_name,
              }
            }
          }
        )
        logger.info(
          '[INNGEST TRAINING] ✅ Step 9 completed: Telegram notification',
          notificationResult
        )

        // ✅ Возвращаем успешный результат в сериализуемом формате (как в ai-server)
        // КРИТИЧНО: Простой объект без вложенных сложных структур для избежания "Invalid JSON in response"
        const result = {
          success: true,
          message: `Training initiated successfully. Training ID: ${training.id}`,
          training_id: training.id,
          destination: modelNameSanitized.destination,
        }

        logger.info('[INNGEST TRAINING] ✅ Training function completed', {
          training_id: training.id,
          destination: modelNameSanitized.destination,
          telegram_id: eventData.telegram_id,
          elapsed_ms: Date.now() - startTime,
        })

        return result
      } catch (error) {
        logger.error('[INNGEST TRAINING] ❌ Training failed', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          telegram_id: (event.data as any)?.telegram_id || 'unknown',
        })

        // ✅ Отправляем уведомление об ошибке в отдельном step (как в ai-server)
        await step.run('send-error-notification', async () => {
          try {
            const eventData = event.data as ModelTrainingEvent['data']
            const botData = getBotByNameAdapter(eventData.bot_name)

            if (botData.bot && !botData.error) {
              const errorMessage = eventData.is_ru
                ? `❌ Ошибка при запуске тренировки:\n${error instanceof Error ? error.message : 'Неизвестная ошибка'}`
                : `❌ Error starting training:\n${error instanceof Error ? error.message : 'Unknown error'}`

              await botData.bot.telegram.sendMessage(
                parseInt(eventData.telegram_id),
                errorMessage
              )
            }
          } catch (notifyError) {
            logger.error(
              '[INNGEST TRAINING] Failed to send error notification',
              {
                error:
                  notifyError instanceof Error
                    ? notifyError.message
                    : String(notifyError),
              }
            )
          }
        })

        // ✅ КРИТИЧНО: Пробрасываем ошибку вместо возврата объекта (как в ai-server)
        // В ai-server ошибки пробрасываются через throw, что правильно для Inngest
        throw error
      }
    }
  )
}
