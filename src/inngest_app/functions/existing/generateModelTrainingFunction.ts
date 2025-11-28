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
import { replicate } from '@/core/replicate'
import { supabase } from '@/core/supabase'
import {
  sanitizeModelName,
  isValidReplicateModelName,
} from '@/helpers/sanitizeModelName'
import { getBotByNameAdapter } from '@/inngest_app/services/bot-adapter'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

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

        // ✅ STEP 1: Validate Replicate credentials
        const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN
        const REPLICATE_USERNAME = process.env.REPLICATE_USERNAME

        if (!REPLICATE_API_TOKEN) {
          throw new Error('❌ Missing REPLICATE_API_TOKEN in environment')
        }

        if (!REPLICATE_USERNAME) {
          throw new Error(
            '❌ Missing REPLICATE_USERNAME in environment. Please set it in Infisical.'
          )
        }

        logger.info('[INNGEST TRAINING] Using Replicate credentials', {
          username: REPLICATE_USERNAME,
          hasToken: !!REPLICATE_API_TOKEN,
        })

        // ✅ STEP 2: Download ZIP file from URL (Inngest лимит 256KB на событие)
        const zipFilePath = await step.run('download-zip', async () => {
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

          return filePath
        })

        // ✅ STEP 3: Convert ZIP to base64 (НЕ возвращаем через step - используем напрямую)
        // Проблема: base64 слишком большой для передачи через nginx (413 Request Entity Too Large)
        // Решение: конвертируем base64 внутри следующего step, чтобы не передавать через HTTP

        // ✅ STEP 4: Sanitize model name
        const modelNameSanitized = await step.run(
          'sanitize-model-name',
          async () => {
            let sanitized = eventData.modelName

            if (!isValidReplicateModelName(eventData.modelName)) {
              logger.warn('[INNGEST TRAINING] Invalid model name, sanitizing', {
                original: eventData.modelName,
              })
              sanitized = sanitizeModelName(eventData.modelName)
            }

            const modelNameLower = sanitized.toLowerCase()
            const uniqueModelName = `${modelNameLower}-${Date.now()}`
            const destination = `${REPLICATE_USERNAME}/${uniqueModelName}`

            logger.info('[INNGEST TRAINING] Model name prepared', {
              original: eventData.modelName,
              sanitized,
              destination,
            })

            return { destination, uniqueModelName }
          }
        )

        // ✅ STEP 5: Create/validate Replicate model
        await step.run('create-replicate-model', async () => {
          logger.info('[INNGEST TRAINING] Checking/creating Replicate model', {
            destination: modelNameSanitized.destination,
          })

          try {
            await replicate.models.get(
              REPLICATE_USERNAME,
              modelNameSanitized.uniqueModelName
            )
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
              logger.info('[INNGEST TRAINING] ✅ Model created successfully')
              // Wait for model to be fully initialized
              await new Promise(resolve => setTimeout(resolve, 5000))
            } else {
              throw error
            }
          }
        })

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

            logger.info('[INNGEST TRAINING] Creating Replicate training', {
              model,
              version,
              destination: modelNameSanitized.destination,
              steps: stepsNumber,
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
              }
            )

            logger.info('[INNGEST TRAINING] ✅ Training created successfully', {
              training_id: training.id,
              status: training.status,
              destination: modelNameSanitized.destination,
            })

            return training
          }
        )

        // ✅ STEP 7: Save training record to database
        await step.run('save-training-record', async () => {
          const stepsNumber =
            typeof eventData.steps === 'string'
              ? parseInt(eventData.steps, 10)
              : eventData.steps

          const trainingRecord = {
            telegram_id: eventData.telegram_id,
            model_name: eventData.modelName,
            trigger_word: eventData.triggerWord,
            zip_url: eventData.zipUrl,
            replicate_training_id: training.id,
            status: 'processing',
            bot_name: eventData.bot_name,
            steps: stepsNumber,
            gender: eventData.gender,
            is_ru: eventData.is_ru,
            created_at: new Date().toISOString(),
          }

          const { error: dbError } = await supabase
            .from('model_trainings')
            .insert(trainingRecord)

          if (dbError) {
            logger.error('[INNGEST TRAINING] Database error (non-fatal)', {
              error: dbError.message,
              telegram_id: eventData.telegram_id,
            })
          } else {
            logger.info('[INNGEST TRAINING] Training record saved to database')
          }
        })

        // ✅ STEP 8: Clean up downloaded ZIP file
        await step.run('cleanup-zip-file', async () => {
          try {
            if (fs.existsSync(zipFilePath)) {
              await fs.promises.unlink(zipFilePath)
              logger.info('[INNGEST TRAINING] ZIP file cleaned up')
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
          }
        })

        // ✅ STEP 9: Send Telegram notification to user
        await step.run('send-telegram-notification', async () => {
          const botData = getBotByNameAdapter(eventData.bot_name)

          if (!botData.bot || botData.error) {
            logger.error('[INNGEST TRAINING] Bot instance not found', {
              bot_name: eventData.bot_name,
              error: botData.error,
            })
            return
          }

          const successMessage = eventData.is_ru
            ? `✅ Тренировка модели запущена!\n\n📦 Модель: ${modelNameSanitized.destination}\n🆔 Training ID: ${training.id}\n⏱️ Время: ~1-2 часа\n\n🔗 Прямая ссылка: https://replicate.com/trainings/${training.id}\n\n💡 Статус проверяйте по прямой ссылке выше`
            : `✅ Model training started!\n\n📦 Model: ${modelNameSanitized.destination}\n🆔 Training ID: ${training.id}\n⏱️ Time: ~1-2 hours\n\n🔗 Direct link: https://replicate.com/trainings/${training.id}\n\n💡 Check status using the direct link above`

          try {
            await botData.bot.telegram.sendMessage(
              parseInt(eventData.telegram_id),
              successMessage
            )
            logger.info('[INNGEST TRAINING] ✅ Telegram notification sent', {
              telegram_id: eventData.telegram_id,
            })
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
          }
        })

        const result = {
          success: true,
          training_id: training.id,
          destination: modelNameSanitized.destination,
          telegram_id: eventData.telegram_id,
          elapsed_ms: Date.now() - startTime,
        }

        logger.info('[INNGEST TRAINING] ✅ Training function completed', result)
        return result
      } catch (error) {
        logger.error('[INNGEST TRAINING] ❌ Training failed', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          telegram_id: (event.data as any)?.telegram_id || 'unknown',
        })

        // Try to send error notification
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
          logger.error('[INNGEST TRAINING] Failed to send error notification', {
            error:
              notifyError instanceof Error
                ? notifyError.message
                : String(notifyError),
          })
        }

        // Return error in a serializable format
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          telegram_id: (event.data as any)?.telegram_id || 'unknown',
        }
      }
    }
  )
}
